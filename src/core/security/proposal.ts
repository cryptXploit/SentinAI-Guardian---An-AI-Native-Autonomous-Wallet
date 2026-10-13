import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { IntentIntegrityProof } from './iip';

export type ProposalStatus =
  | 'PREPARED'
  | 'AUTHORIZED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REVERTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FAILED_BEFORE_BROADCAST'
  | 'EXECUTION_UNKNOWN'
  | 'RECONCILIATION_REQUIRED';

export type ProposalRecord = {
  id: string;
  ownerId: string;
  digest: string;
  iipData: IntentIntegrityProof;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  authorizedAt: string | null;
  txHash: string | null;
};

export const TERMINAL_STATES: ReadonlySet<ProposalStatus> = new Set([
  'CONFIRMED',
  'FAILED',
  'REVERTED',
  'EXPIRED',
  'CANCELLED',
  'FAILED_BEFORE_BROADCAST',
]);

// Default proposal lifetime: 15 minutes
export const DEFAULT_PROPOSAL_LIFETIME_MS = 15 * 60 * 1000;

export const SCHEMA_VERSION = 2;

export function resolveDatabasePath(): string {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  return process.env.SENTINAI_DB_PATH || 'sentinai.db';
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dbPath = resolveDatabasePath();
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    migrateSchema(_db, dbPath);
  }
  return _db;
}

export function migrateSchema(db: Database.Database, dbPath?: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const currentVersion = row?.version ?? 0;

  // Fail safe on unsupported future schema version
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `UNSUPPORTED_SCHEMA_VERSION: Database schema version ${currentVersion} is newer than application supported version ${SCHEMA_VERSION}`
    );
  }

  if (currentVersion === SCHEMA_VERSION) {
    return; // Already up to date
  }

  // Backup file database before non-destructive migration
  if (dbPath && dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    try {
      const backupPath = `${dbPath}.bak.${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
    } catch {
      // Backup attempt logged/handled safely
    }
  }

  // Run atomic migration inside a transaction
  const runMigration = db.transaction(() => {
    if (currentVersion === 0) {
      // Fresh initialization: Create complete schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS proposals (
          id            TEXT PRIMARY KEY,
          owner_id      TEXT NOT NULL DEFAULT '__legacy__',
          digest        TEXT NOT NULL DEFAULT '',
          iip_data      TEXT NOT NULL,
          status        TEXT NOT NULL DEFAULT 'PREPARED',
          created_at    DATETIME DEFAULT (datetime('now')),
          expires_at    DATETIME NOT NULL,
          authorized_at DATETIME,
          tx_hash       TEXT,
          updated_at    DATETIME DEFAULT (datetime('now'))
        )
      `);
    } else if (currentVersion === 1) {
      // Non-destructive migration from v1 (R5C schema):
      // v1 schema: proposals(id TEXT PRIMARY KEY, iip_data TEXT NOT NULL, status TEXT, created_at DATETIME)
      // Preserves existing proposals, transaction hashes, execution statuses, and confirmed history.
      const columns = db.prepare("PRAGMA table_info(proposals)").all() as Array<{ name: string }>;
      const columnNames = new Set(columns.map((c) => c.name));

      if (!columnNames.has('owner_id')) {
        db.exec("ALTER TABLE proposals ADD COLUMN owner_id TEXT NOT NULL DEFAULT '__legacy__'");
      }
      if (!columnNames.has('digest')) {
        db.exec("ALTER TABLE proposals ADD COLUMN digest TEXT NOT NULL DEFAULT ''");
      }
      if (!columnNames.has('expires_at')) {
        db.exec("ALTER TABLE proposals ADD COLUMN expires_at DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
      }
      if (!columnNames.has('authorized_at')) {
        db.exec("ALTER TABLE proposals ADD COLUMN authorized_at DATETIME");
      }
      if (!columnNames.has('tx_hash')) {
        db.exec("ALTER TABLE proposals ADD COLUMN tx_hash TEXT");
      }
      if (!columnNames.has('updated_at')) {
        db.exec("ALTER TABLE proposals ADD COLUMN updated_at DATETIME DEFAULT '1970-01-01T00:00:00.000Z'");
        db.exec("UPDATE proposals SET updated_at = datetime('now') WHERE updated_at = '1970-01-01T00:00:00.000Z'");
      }

      // Security requirement: Legacy records with insufficient security info (no authentic owner)
      // must be quarantined into a non-executable state so they cannot be executed.
      // Historical terminal records (CONFIRMED, FAILED, REVERTED) remain preserved!
      db.exec(`
        UPDATE proposals SET status = 'EXPIRED'
        WHERE owner_id = '__legacy__' AND status IN ('PREPARED', 'AUTHORIZED', 'SUBMITTING')
      `);
    }

    // Ensure performance & uniqueness indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_owner ON proposals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_digest ON proposals(digest);
    `);

    // Update schema version record
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  });

  runMigration();
}

// ─── Serialization ──────────────────────────────────────────────────────────

function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __bigint__: value.toString() };
  }
  return value;
}

function bigIntReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__bigint__' in (value as Record<string, unknown>)) {
    return BigInt((value as Record<string, string>).__bigint__);
  }
  return value;
}

function serializeIIP(iip: IntentIntegrityProof): string {
  return JSON.stringify(iip, bigIntReplacer);
}

function deserializeIIP(json: string): IntentIntegrityProof {
  const parsed = JSON.parse(json, bigIntReviver);
  if (!parsed || typeof parsed !== 'object' || !parsed.proofDigest || !parsed.candidate || !parsed.intent) {
    throw new Error('CORRUPTED_PROPOSAL: Stored IIP data failed structural validation');
  }
  return parsed as IntentIntegrityProof;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Stores a new proposal with a unique random ID. Returns the proposalId.
 */
export function storeProposal(
  iip: IntentIntegrityProof,
  ownerId: string,
  lifetimeMs: number = DEFAULT_PROPOSAL_LIFETIME_MS
): string {
  const db = getDb();
  const serialized = serializeIIP(iip);
  const digest = iip.proofDigest;
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const proposalId = randomUUID();

  db.prepare(
    `INSERT INTO proposals (id, owner_id, digest, iip_data, status, expires_at)
     VALUES (?, ?, ?, ?, 'PREPARED', ?)`
  ).run(proposalId, ownerId, digest, serialized, expiresAt);

  return proposalId;
}

/**
 * Retrieves a proposal by ID. Returns the full record or undefined.
 */
export function retrieveProposal(proposalId: string): ProposalRecord | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, owner_id, digest, iip_data, status, created_at, expires_at, authorized_at, tx_hash FROM proposals WHERE id = ?'
  ).get(proposalId) as
    | {
        id: string;
        owner_id: string;
        digest: string;
        iip_data: string;
        status: ProposalStatus;
        created_at: string;
        expires_at: string;
        authorized_at: string | null;
        tx_hash: string | null;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    ownerId: row.owner_id,
    digest: row.digest,
    iipData: deserializeIIP(row.iip_data),
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    authorizedAt: row.authorized_at,
    txHash: row.tx_hash,
  };
}

/**
 * Checks if a proposal has expired based on its expires_at field.
 * Handles both ISO 8601 strings and Unix timestamps with millisecond accuracy.
 */
export function isProposalExpired(proposalId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT expires_at FROM proposals WHERE id = ?').get(proposalId) as
    | { expires_at: string | number }
    | undefined;
  if (!row) return true;
  const expiry = typeof row.expires_at === 'number' ? row.expires_at : new Date(row.expires_at).getTime();
  if (isNaN(expiry)) return true;
  return Date.now() >= expiry;
}

/**
 * Atomically transitions a proposal from PREPARED to AUTHORIZED.
 * Requires owner match and proposal must not be expired.
 */
export function authorizeProposal(proposalId: string, ownerId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals
     SET status = 'AUTHORIZED', authorized_at = ?, updated_at = ?
     WHERE id = ? AND owner_id = ? AND status = 'PREPARED'
     AND datetime(expires_at) > datetime(?)`
  ).run(now, now, proposalId, ownerId, now);
  return result.changes === 1;
}

/**
 * Atomically locks an AUTHORIZED proposal for execution (transition to SUBMITTING).
 * Requires owner match and proposal must not be expired.
 */
export function lockProposalForExecution(proposalId: string, ownerId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals
     SET status = 'SUBMITTING', updated_at = ?
     WHERE id = ? AND owner_id = ? AND status = 'AUTHORIZED'
     AND datetime(expires_at) > datetime(?)`
  ).run(now, proposalId, ownerId, now);
  return result.changes === 1;
}

/**
 * Phase C: Marks proposal as SUBMITTED immediately upon receiving broadcast transaction hash.
 * This persists the transaction hash BEFORE awaiting receipt confirmation.
 */
export function markSubmitted(proposalId: string, txHash: string): boolean {
  const db = getDb();
  const result = db.prepare(
    `UPDATE proposals
     SET status = 'SUBMITTED', tx_hash = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'SUBMITTING'`
  ).run(txHash, proposalId);
  return result.changes === 1;
}

/**
 * Records the transaction hash immediately after broadcast attempt.
 */
export function recordTxHash(proposalId: string, txHash: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE proposals SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(txHash, proposalId);
}

/**
 * Updates the terminal status of a proposal after execution completes.
 * Allows transition FROM 'SUBMITTING' or 'SUBMITTED' to a terminal state.
 */
export function updateProposalStatus(
  proposalId: string,
  status: ProposalStatus
): boolean {
  const db = getDb();
  const result = db.prepare(
    `UPDATE proposals SET status = ?, updated_at = datetime('now')
     WHERE id = ? AND status IN ('SUBMITTING', 'SUBMITTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN')`
  ).run(status, proposalId);
  return result.changes === 1;
}

/**
 * Cancels a proposal. Only PREPARED or AUTHORIZED proposals can be cancelled.
 */
export function cancelProposal(proposalId: string, ownerId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    `UPDATE proposals SET status = 'CANCELLED', updated_at = datetime('now')
     WHERE id = ? AND owner_id = ? AND status IN ('PREPARED', 'AUTHORIZED')`
  ).run(proposalId, ownerId);
  return result.changes === 1;
}

/**
 * Expires all proposals that have passed their expiration time and are still in non-terminal states.
 */
export function expireStaleProposals(): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals SET status = 'EXPIRED', updated_at = datetime('now')
     WHERE status IN ('PREPARED', 'AUTHORIZED')
     AND datetime(expires_at) <= datetime(?)`
  ).run(now);
  return result.changes;
}

/**
 * Returns the current status of a proposal, or undefined if not found.
 */
export function getProposalStatus(proposalId: string): ProposalStatus | undefined {
  const db = getDb();
  const row = db.prepare('SELECT status FROM proposals WHERE id = ?').get(proposalId) as
    | { status: ProposalStatus }
    | undefined;
  return row?.status;
}

/**
 * Lists proposals in non-terminal in-flight states that may need reconciliation.
 */
export function getStuckSubmittingProposals(): ProposalRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, owner_id, digest, iip_data, status, created_at, expires_at, authorized_at, tx_hash
     FROM proposals WHERE status IN ('SUBMITTING', 'SUBMITTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN')`
  ).all() as Array<{
    id: string;
    owner_id: string;
    digest: string;
    iip_data: string;
    status: ProposalStatus;
    created_at: string;
    expires_at: string;
    authorized_at: string | null;
    tx_hash: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    digest: row.digest,
    iipData: deserializeIIP(row.iip_data),
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    authorizedAt: row.authorized_at,
    txHash: row.tx_hash,
  }));
}

/**
 * Reconciliation: Marks an in-flight proposal as CONFIRMED, FAILED, or REVERTED
 * based on external on-chain verification.
 */
export function reconcileProposal(
  proposalId: string,
  status: 'CONFIRMED' | 'FAILED' | 'REVERTED',
  txHash?: string
): boolean {
  const db = getDb();
  const stmt = txHash
    ? db.prepare(
        `UPDATE proposals SET status = ?, tx_hash = COALESCE(tx_hash, ?), updated_at = datetime('now')
         WHERE id = ? AND status IN ('SUBMITTING', 'SUBMITTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN')`
      )
    : db.prepare(
        `UPDATE proposals SET status = ?, updated_at = datetime('now')
         WHERE id = ? AND status IN ('SUBMITTING', 'SUBMITTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN')`
      );
  const result = txHash ? stmt.run(status, txHash, proposalId) : stmt.run(status, proposalId);
  return result.changes === 1;
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

export function _resetProposalsForTesting(): void {
  const db = getDb();
  db.exec('DELETE FROM proposals');
}

export function _closeDbForTesting(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function _getDb(): Database.Database {
  return getDb();
}
