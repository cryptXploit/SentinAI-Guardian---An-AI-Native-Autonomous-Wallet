import Database from 'better-sqlite3';
import { IntentIntegrityProof } from './iip';

export type ProposalStatus = 'PREPARED' | 'SUBMITTING' | 'CONFIRMED' | 'FAILED' | 'REVERTED';

/**
 * Durable SQLite Proposal Store (R5C)
 *
 * Replaces the in-memory Map with an atomic, crash-resilient SQLite database.
 * Uses `:memory:` in test environments (NODE_ENV=test or VITEST=true) and
 * a persistent `sentinai.db` file in production/development.
 *
 * State machine:
 *   PREPARED  ──(lockProposalForExecution)──►  SUBMITTING
 *   SUBMITTING ──(updateProposalStatus)──►  CONFIRMED | FAILED | REVERTED
 */

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
    _db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id         TEXT PRIMARY KEY,
        iip_data   TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'PREPARED',
        created_at DATETIME DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

/**
 * Custom replacer for JSON.stringify that handles BigInt serialization.
 * BigInt values are encoded as `{ __bigint__: "<string>" }`.
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __bigint__: value.toString() };
  }
  return value;
}

/**
 * Custom reviver for JSON.parse that restores BigInt values.
 */
function bigIntReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__bigint__' in (value as Record<string, unknown>)) {
    return BigInt((value as Record<string, string>).__bigint__);
  }
  return value;
}

/**
 * Stores an Intent Integrity Proof in the durable SQLite database with status PREPARED.
 * Returns the canonical proposalId (proofDigest).
 */
export function storeProposal(iip: IntentIntegrityProof): string {
  const db = getDb();
  const proposalId = iip.proofDigest;
  const serialized = JSON.stringify(iip, bigIntReplacer);

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO proposals (id, iip_data, status) VALUES (?, ?, ?)'
  );
  stmt.run(proposalId, serialized, 'PREPARED');
  return proposalId;
}

/**
 * Retrieves a stored proposal by its canonical proposalId.
 * Returns the deserialized IntentIntegrityProof or undefined if not found.
 */
export function retrieveProposal(proposalId: string): IntentIntegrityProof | undefined {
  const db = getDb();
  const row = db.prepare('SELECT iip_data FROM proposals WHERE id = ?').get(proposalId) as
    | { iip_data: string }
    | undefined;

  if (!row) return undefined;
  return JSON.parse(row.iip_data, bigIntReviver) as IntentIntegrityProof;
}

/**
 * Atomically locks a proposal for execution using a single SQL UPDATE with a WHERE guard.
 *
 * SQL: UPDATE proposals SET status = 'SUBMITTING' WHERE id = ? AND status = 'PREPARED'
 *
 * If `changes === 1`, the caller obtained the lock (first execution).
 * If `changes === 0`, the proposal is already SUBMITTING/CONFIRMED/FAILED/REVERTED,
 * meaning a concurrent or duplicate execution attempt — returns false.
 *
 * This is mathematically race-free because SQLite serializes all writes.
 */
export function lockProposalForExecution(proposalId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE proposals SET status = 'SUBMITTING' WHERE id = ? AND status = 'PREPARED'"
  ).run(proposalId);
  return result.changes === 1;
}

/**
 * Updates the terminal status of a proposal after execution completes.
 */
export function updateProposalStatus(
  proposalId: string,
  status: 'CONFIRMED' | 'FAILED' | 'REVERTED'
): void {
  const db = getDb();
  db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run(status, proposalId);
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
 * Deletes a proposal from the database.
 */
export function deleteProposal(proposalId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM proposals WHERE id = ?').run(proposalId);
  return result.changes === 1;
}

/**
 * Test helper: resets the database by dropping and recreating the proposals table.
 * Also closes and nullifies the connection so a fresh in-memory DB is created next call.
 */
export function _resetProposalsForTesting(): void {
  if (_db) {
    _db.exec('DELETE FROM proposals');
  }
}

/**
 * Test helper: closes the database connection entirely.
 */
export function _closeDbForTesting(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
