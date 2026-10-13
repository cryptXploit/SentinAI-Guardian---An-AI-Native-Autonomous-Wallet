import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { IntentIntegrityProof } from './iip';

export type ProposalStatus =
  | 'PREPARED'
  | 'AUTHORIZED'
  | 'SUBMITTING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REVERTED'
  | 'EXPIRED'
  | 'CANCELLED';

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

const TERMINAL_STATES: ReadonlySet<ProposalStatus> = new Set([
  'CONFIRMED', 'FAILED', 'REVERTED', 'EXPIRED', 'CANCELLED'
]);

// Default proposal lifetime: 15 minutes
const DEFAULT_PROPOSAL_LIFETIME_MS = 15 * 60 * 1000;

const SCHEMA_VERSION = 2;

function resolveDatabasePath(): string {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  return process.env.SENTINAI_DB_PATH || 'sentinai.db';
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(resolveDatabasePath());
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    migrateSchema(_db);
  }
  return _db;
}

function migrateSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number } | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    // Drop old table if upgrading from v0/v1
    if (currentVersion > 0 && currentVersion < SCHEMA_VERSION) {
      db.exec('DROP TABLE IF EXISTS proposals');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id            TEXT PRIMARY KEY,
        owner_id      TEXT NOT NULL,
        digest        TEXT NOT NULL,
        iip_data      TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'PREPARED',
        created_at    DATETIME DEFAULT (datetime('now')),
        expires_at    DATETIME NOT NULL,
        authorized_at DATETIME,
        tx_hash       TEXT,
        updated_at    DATETIME DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_owner ON proposals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_digest ON proposals(digest);
    `);

    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
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
  // Basic structural validation
  if (!parsed || typeof parsed !== 'object' || !parsed.proofDigest || !parsed.candidate || !parsed.intent) {
    throw new Error('CORRUPTED_PROPOSAL: Stored IIP data failed structural validation');
  }
  return parsed as IntentIntegrityProof;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Stores a new proposal with a unique random ID. Returns the proposalId.
 * Uses INSERT ... ON CONFLICT DO NOTHING to never reset existing proposal state.
 * If a proposal with the same ID already exists (astronomically unlikely with UUID),
 * a new ID is generated.
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

  // Generate unique proposal ID (separate from digest)
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
  ).get(proposalId) as {
    id: string; owner_id: string; digest: string; iip_data: string;
    status: ProposalStatus; created_at: string; expires_at: string;
    authorized_at: string | null; tx_hash: string | null;
  } | undefined;

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
 */
export function isProposalExpired(proposalId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT expires_at FROM proposals WHERE id = ?').get(proposalId) as
    | { expires_at: string } | undefined;
  if (!row) return true;
  return new Date(row.expires_at).getTime() <= Date.now();
}

/**
 * Atomically transitions a proposal from PREPARED to AUTHORIZED.
 * Requires owner match and proposal must not be expired.
 * Returns true if the transition succeeded.
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
 * Atomically locks an AUTHORIZED proposal for execution.
 * Requires owner match and not expired.
 * SQL: UPDATE proposals SET status = 'SUBMITTING' WHERE id = ? AND owner_id = ? AND status = 'AUTHORIZED' AND not expired
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
 * Records the transaction hash immediately after broadcast attempt.
 * This persists evidence that a broadcast was attempted, enabling crash recovery.
 */
export function recordTxHash(proposalId: string, txHash: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE proposals SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(txHash, proposalId);
}

/**
 * Updates the terminal status of a proposal after execution completes.
 * Only allows transition FROM 'SUBMITTING' to a terminal state.
 */
export function updateProposalStatus(
  proposalId: string,
  status: 'CONFIRMED' | 'FAILED' | 'REVERTED'
): boolean {
  const db = getDb();
  const result = db.prepare(
    `UPDATE proposals SET status = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'SUBMITTING'`
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
    | { status: ProposalStatus } | undefined;
  return row?.status;
}

/**
 * Lists proposals in SUBMITTING state that may need reconciliation.
 * These are proposals where a broadcast was attempted but the outcome is unknown.
 */
export function getStuckSubmittingProposals(): ProposalRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, owner_id, digest, iip_data, status, created_at, expires_at, authorized_at, tx_hash
     FROM proposals WHERE status = 'SUBMITTING'`
  ).all() as Array<{
    id: string; owner_id: string; digest: string; iip_data: string;
    status: ProposalStatus; created_at: string; expires_at: string;
    authorized_at: string | null; tx_hash: string | null;
  }>;

  return rows.map(row => ({
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
 * Reconciliation: Marks a SUBMITTING proposal as CONFIRMED or FAILED
 * based on external evidence (e.g., checking tx receipt on-chain).
 * Only transitions FROM SUBMITTING.
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
         WHERE id = ? AND status = 'SUBMITTING'`
      )
    : db.prepare(
        `UPDATE proposals SET status = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'SUBMITTING'`
      );
  const result = txHash
    ? stmt.run(status, txHash, proposalId)
    : stmt.run(status, proposalId);
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
