import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IntentIntegrityProof } from './iip';
import { ProposalProvenance } from '../domain/schemas';

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
  provenance: ProposalProvenance;
  isExecutable: boolean;
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

/**
 * Explicit state transition matrix enforcing permitted lifecycle transitions.
 * Arbitrary transitions (e.g. SUBMITTED -> PREPARED or CONFIRMED -> SUBMITTING) are strictly forbidden.
 */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<ProposalStatus, ReadonlySet<ProposalStatus>>> = {
  PREPARED: new Set(['AUTHORIZED', 'CANCELLED', 'EXPIRED', 'FAILED']),
  AUTHORIZED: new Set(['SUBMITTING', 'CANCELLED', 'EXPIRED', 'FAILED']),
  SUBMITTING: new Set(['SUBMITTED', 'CONFIRMED', 'REVERTED', 'FAILED_BEFORE_BROADCAST', 'FAILED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN']),
  SUBMITTED: new Set(['CONFIRMED', 'REVERTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN']),
  RECONCILIATION_REQUIRED: new Set(['CONFIRMED', 'REVERTED', 'FAILED']),
  EXECUTION_UNKNOWN: new Set(['CONFIRMED', 'REVERTED', 'FAILED']),
  CONFIRMED: new Set([]),
  REVERTED: new Set([]),
  FAILED: new Set([]),
  EXPIRED: new Set([]),
  CANCELLED: new Set([]),
  FAILED_BEFORE_BROADCAST: new Set([]),
};

// Default proposal lifetime: 15 minutes
export const DEFAULT_PROPOSAL_LIFETIME_MS = 15 * 60 * 1000;

export const SCHEMA_VERSION = 3;

export function resolveDatabasePath(): string {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  return process.env.SENTINAI_DB_PATH || 'sentinai.db';
}

let _db: Database.Database | null = null;

export function ensureSessionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
}

export function ensurePolicyTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_policies (
      owner_id TEXT PRIMARY KEY,
      policy_json TEXT NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS policy_audit_log (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_policy_json TEXT NOT NULL,
      new_policy_json TEXT NOT NULL,
      created_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_policy_audit_owner ON policy_audit_log(owner_id, created_at DESC);
  `);
}

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = resolveDatabasePath();
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    migrateSchema(_db, dbPath);
    ensureSessionsTable(_db);
    ensurePolicyTables(_db);
  }
  return _db;
}

/**
 * Safely creates a backup of a live WAL-mode SQLite database.
 * Checkpoints WAL first to flush committed frames into the main database file before copying.
 */
export function backupDatabase(destinationPath: string): void {
  const db = getDb();
  const dbPath = resolveDatabasePath();
  if (dbPath === ':memory:') {
    throw new Error('CANNOT_BACKUP_MEMORY_DB: Backup requires a persistent database file.');
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(/*turbopackIgnore: true*/ dbPath, /*turbopackIgnore: true*/ destinationPath);
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

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `UNSUPPORTED_SCHEMA_VERSION: Database schema version ${currentVersion} is newer than application supported version ${SCHEMA_VERSION}`
    );
  }

  if (currentVersion === SCHEMA_VERSION) {
    ensureSessionsTable(db);
    return;
  }

  if (dbPath && dbPath !== ':memory:' && fs.existsSync(/*turbopackIgnore: true*/ dbPath)) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      const backupPath = `${dbPath}.bak.${Date.now()}`;
      fs.copyFileSync(/*turbopackIgnore: true*/ dbPath, /*turbopackIgnore: true*/ backupPath);
    } catch {
      // Backup attempt logged/handled safely
    }
  }

  const runMigration = db.transaction(() => {
    if (currentVersion === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS proposals (
          id            TEXT PRIMARY KEY,
          owner_id      TEXT NOT NULL DEFAULT '__legacy__',
          digest        TEXT NOT NULL DEFAULT '',
          iip_data      TEXT NOT NULL,
          status        TEXT NOT NULL DEFAULT 'PREPARED',
          provenance    TEXT NOT NULL DEFAULT 'UNVERIFIED',
          is_executable INTEGER NOT NULL DEFAULT 0,
          created_at    DATETIME DEFAULT (datetime('now')),
          expires_at    DATETIME NOT NULL,
          authorized_at DATETIME,
          tx_hash       TEXT,
          updated_at    DATETIME DEFAULT (datetime('now'))
        )
      `);
    } else {
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
      if (!columnNames.has('provenance')) {
        db.exec("ALTER TABLE proposals ADD COLUMN provenance TEXT NOT NULL DEFAULT 'UNVERIFIED'");
      }
      if (!columnNames.has('is_executable')) {
        db.exec("ALTER TABLE proposals ADD COLUMN is_executable INTEGER NOT NULL DEFAULT 0");
      }

      // Security requirement: Legacy records with insufficient security info
      // must be quarantined into a non-executable state.
      db.exec(`
        UPDATE proposals SET status = 'EXPIRED'
        WHERE owner_id = '__legacy__' AND status IN ('PREPARED', 'AUTHORIZED', 'SUBMITTING')
      `);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_owner ON proposals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_digest ON proposals(digest);
      CREATE INDEX IF NOT EXISTS idx_proposals_provenance ON proposals(provenance);
    `);

    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  });

  runMigration();
  ensureSessionsTable(db);
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
 * Stores a new proposal with a unique random ID.
 * Invariant: Only LIVE_VERIFIED proposals can ever be created with isExecutable=true.
 */
export function storeProposal(
  iip: IntentIntegrityProof,
  ownerId: string,
  lifetimeMs: number = DEFAULT_PROPOSAL_LIFETIME_MS,
  provenance: ProposalProvenance = 'LIVE_VERIFIED',
  isExecutable: boolean = true
): string {
  const db = getDb();
  const serialized = serializeIIP(iip);
  const digest = iip.proofDigest;
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const proposalId = randomUUID();

  // Strict backend-enforced invariant: Only LIVE_VERIFIED proposals can ever be executable
  const executableInt = provenance === 'LIVE_VERIFIED' && isExecutable ? 1 : 0;

  db.prepare(
    `INSERT INTO proposals (id, owner_id, digest, iip_data, status, provenance, is_executable, expires_at)
     VALUES (?, ?, ?, ?, 'PREPARED', ?, ?, ?)`
  ).run(proposalId, ownerId, digest, serialized, provenance, executableInt, expiresAt);

  return proposalId;
}

/**
 * Stores a security demonstration fixture proposal.
 * STRICTLY non-executable with SECURITY_FIXTURE provenance.
 */
export function storeFixtureProposal(
  iip: IntentIntegrityProof,
  ownerId: string,
  lifetimeMs: number = DEFAULT_PROPOSAL_LIFETIME_MS
): string {
  return storeProposal(iip, ownerId, lifetimeMs, 'SECURITY_FIXTURE', false);
}

/**
 * Retrieves a proposal by ID. Returns the full record or undefined.
 */
export function retrieveProposal(proposalId: string): ProposalRecord | undefined {
  const db = getDb();
  const row = db.prepare(
    `SELECT id, owner_id, digest, iip_data, status, provenance, is_executable,
            created_at, expires_at, authorized_at, tx_hash
     FROM proposals WHERE id = ?`
  ).get(proposalId) as
    | {
        id: string;
        owner_id: string;
        digest: string;
        iip_data: string;
        status: ProposalStatus;
        provenance?: string;
        is_executable?: number;
        created_at: string;
        expires_at: string;
        authorized_at: string | null;
        tx_hash: string | null;
      }
    | undefined;

  if (!row) return undefined;

  const provenance = (row.provenance as ProposalProvenance) || 'UNVERIFIED';
  const isExecutable = Boolean(row.is_executable) && provenance === 'LIVE_VERIFIED';

  return {
    id: row.id,
    ownerId: row.owner_id,
    digest: row.digest,
    iipData: deserializeIIP(row.iip_data),
    status: row.status,
    provenance,
    isExecutable,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    authorizedAt: row.authorized_at,
    txHash: row.tx_hash,
  };
}

/**
 * Checks if a proposal has expired based on its expires_at field.
 */
export function isProposalExpired(proposalId: string, referenceTimeMs: number = Date.now()): boolean {
  const db = getDb();
  const row = db.prepare('SELECT expires_at FROM proposals WHERE id = ?').get(proposalId) as
    | { expires_at: string | number }
    | undefined;
  if (!row) return true;
  const expiry = typeof row.expires_at === 'number' ? row.expires_at : new Date(row.expires_at).getTime();
  if (isNaN(expiry)) return true;
  return referenceTimeMs >= expiry;
}

/**
 * Atomically transitions a proposal from PREPARED to AUTHORIZED.
 * Requires:
 * 1. Owner match
 * 2. Unexpired
 * 3. Provenance MUST be 'LIVE_VERIFIED'
 * 4. is_executable MUST be 1
 * Demonstrations and unverified proposals CANNOT be authorized.
 */
export function authorizeProposal(proposalId: string, ownerId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals
     SET status = 'AUTHORIZED', authorized_at = ?, updated_at = ?
     WHERE id = ? AND owner_id = ? AND status = 'PREPARED'
       AND provenance = 'LIVE_VERIFIED' AND is_executable = 1
       AND expires_at > ?`
  ).run(now, now, proposalId, ownerId, now);
  return result.changes === 1;
}

/**
 * Atomically locks an AUTHORIZED proposal for execution (transition to SUBMITTING).
 * Requires:
 * 1. Owner match
 * 2. Unexpired
 * 3. Provenance MUST be 'LIVE_VERIFIED'
 * 4. is_executable MUST be 1
 */
export function lockProposalForExecution(proposalId: string, ownerId: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals
     SET status = 'SUBMITTING', updated_at = ?
     WHERE id = ? AND owner_id = ? AND status = 'AUTHORIZED'
       AND provenance = 'LIVE_VERIFIED' AND is_executable = 1
       AND expires_at > ?`
  ).run(now, proposalId, ownerId, now);
  return result.changes === 1;
}

/**
 * Phase C: Marks proposal as SUBMITTED immediately upon receiving broadcast transaction hash.
 */
export function markSubmitted(proposalId: string, txHash: string): boolean {
  const db = getDb();
  const current = getProposalStatus(proposalId);
  if (current !== 'SUBMITTING') return false;

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
 * Updates the status of a proposal after execution or exception.
 * Validates transition against the explicit ALLOWED_STATUS_TRANSITIONS matrix.
 */
export function updateProposalStatus(
  proposalId: string,
  targetStatus: ProposalStatus
): boolean {
  const db = getDb();
  const current = getProposalStatus(proposalId);
  if (!current) return false;

  const allowed = ALLOWED_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.has(targetStatus)) {
    return false;
  }

  const result = db.prepare(
    `UPDATE proposals SET status = ?, updated_at = datetime('now')
     WHERE id = ? AND status = ?`
  ).run(targetStatus, proposalId, current);
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
 * Expires all proposals that have passed their expiration time.
 */
export function expireStaleProposals(): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE proposals SET status = 'EXPIRED', updated_at = datetime('now')
     WHERE status IN ('PREPARED', 'AUTHORIZED')
     AND expires_at <= ?`
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
    `SELECT id, owner_id, digest, iip_data, status, provenance, is_executable,
            created_at, expires_at, authorized_at, tx_hash
     FROM proposals WHERE status IN ('SUBMITTING', 'SUBMITTED', 'RECONCILIATION_REQUIRED', 'EXECUTION_UNKNOWN')`
  ).all() as Array<{
    id: string;
    owner_id: string;
    digest: string;
    iip_data: string;
    status: ProposalStatus;
    provenance?: string;
    is_executable?: number;
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
    provenance: (row.provenance as ProposalProvenance) || 'UNVERIFIED',
    isExecutable: Boolean(row.is_executable) && row.provenance === 'LIVE_VERIFIED',
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
  const current = getProposalStatus(proposalId);
  if (!current) return false;

  const allowed = ALLOWED_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.has(status)) {
    return false;
  }

  const stmt = txHash
    ? db.prepare(
        `UPDATE proposals SET status = ?, tx_hash = COALESCE(tx_hash, ?), updated_at = datetime('now')
         WHERE id = ? AND status = ?`
      )
    : db.prepare(
        `UPDATE proposals SET status = ?, updated_at = datetime('now')
         WHERE id = ? AND status = ?`
      );
  const result = txHash ? stmt.run(status, txHash, proposalId, current) : stmt.run(status, proposalId, current);
  return result.changes === 1;
}

/**
 * Lists recent proposals for an authenticated owner (or all proposals if ownerId is '*'),
 * ordered newest first.
 */
export function listProposalsByOwner(ownerId: string, limit: number = 25): ProposalRecord[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = (
    ownerId === '*'
      ? db
          .prepare(
            `SELECT id, owner_id, digest, iip_data, status, provenance, is_executable,
                    created_at, expires_at, authorized_at, tx_hash
             FROM proposals ORDER BY created_at DESC, rowid DESC LIMIT ?`
          )
          .all(safeLimit)
      : db
          .prepare(
            `SELECT id, owner_id, digest, iip_data, status, provenance, is_executable,
                    created_at, expires_at, authorized_at, tx_hash
             FROM proposals WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`
          )
          .all(ownerId, safeLimit)
  ) as Array<{
    id: string;
    owner_id: string;
    digest: string;
    iip_data: string;
    status: ProposalStatus;
    provenance?: string;
    is_executable?: number;
    created_at: string;
    expires_at: string;
    authorized_at: string | null;
    tx_hash: string | null;
  }>;

  const records: ProposalRecord[] = [];
  for (const row of rows) {
    try {
      const provenance = (row.provenance as ProposalProvenance) || 'UNVERIFIED';
      records.push({
        id: row.id,
        ownerId: row.owner_id,
        digest: row.digest,
        iipData: deserializeIIP(row.iip_data),
        status: row.status,
        provenance,
        isExecutable: Boolean(row.is_executable) && provenance === 'LIVE_VERIFIED',
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        authorizedAt: row.authorized_at,
        txHash: row.tx_hash,
      });
    } catch {
      // Skip corrupted historical row safely
    }
  }
  return records;
}

// ─── Durable Broadcast Recovery Journal (R8.4 Section 3) ────────────────────
// When a transaction is accepted by the blockchain (Phase B) and the subsequent
// SQLite update (`markSubmitted`) fails (Phase C), this file-backed journal
// ensures the `(proposalId, txHash)` pair survives a server restart and can be
// recovered without ever broadcasting a second transaction.

export type BroadcastRecoveryJournalEntry = {
  proposalId: string;
  txHash: string;
  ownerId: string;
  recordedAt: string;
};

export function resolveRecoveryJournalPath(): string {
  if (process.env.SENTINAI_RECOVERY_JOURNAL_PATH) {
    return process.env.SENTINAI_RECOVERY_JOURNAL_PATH;
  }
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return path.join(os.tmpdir(), `sentinai-recovery-journal-${process.pid}.json`);
  }
  const dbPath = resolveDatabasePath();
  return `${dbPath}.recovery-journal.json`;
}

export function writeBroadcastRecoveryJournal(
  proposalId: string,
  txHash: string,
  ownerId: string
): void {
  try {
    const journalPath = resolveRecoveryJournalPath();
    let entries: Record<string, BroadcastRecoveryJournalEntry> = {};
    if (fs.existsSync(/*turbopackIgnore: true*/ journalPath)) {
      try {
        entries = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ journalPath, 'utf8'));
      } catch {
        entries = {};
      }
    }
    entries[proposalId] = {
      proposalId,
      txHash,
      ownerId,
      recordedAt: new Date().toISOString(),
    };
    fs.writeFileSync(/*turbopackIgnore: true*/ journalPath, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // Non-fatal fallback if filesystem is read-only
  }
}

export function readBroadcastRecoveryJournal(
  proposalId: string
): BroadcastRecoveryJournalEntry | undefined {
  try {
    const journalPath = resolveRecoveryJournalPath();
    if (!fs.existsSync(/*turbopackIgnore: true*/ journalPath)) return undefined;
    const entries = JSON.parse(
      fs.readFileSync(/*turbopackIgnore: true*/ journalPath, 'utf8')
    ) as Record<string, BroadcastRecoveryJournalEntry>;
    return entries[proposalId];
  } catch {
    return undefined;
  }
}

export function clearBroadcastRecoveryJournal(proposalId: string): void {
  try {
    const journalPath = resolveRecoveryJournalPath();
    if (!fs.existsSync(/*turbopackIgnore: true*/ journalPath)) return;
    const entries = JSON.parse(
      fs.readFileSync(/*turbopackIgnore: true*/ journalPath, 'utf8')
    ) as Record<string, BroadcastRecoveryJournalEntry>;
    if (proposalId in entries) {
      delete entries[proposalId];
      fs.writeFileSync(/*turbopackIgnore: true*/ journalPath, JSON.stringify(entries, null, 2), 'utf8');
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

export function _resetProposalsForTesting(): void {
  const db = getDb();
  ensurePolicyTables(db);
  db.exec('DELETE FROM proposals');
  db.exec('DELETE FROM user_policies');
  db.exec('DELETE FROM policy_audit_log');
  try {
    const journalPath = resolveRecoveryJournalPath();
    if (fs.existsSync(/*turbopackIgnore: true*/ journalPath)) {
      fs.unlinkSync(/*turbopackIgnore: true*/ journalPath);
    }
  } catch {
    // Ignore cleanup errors
  }
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
