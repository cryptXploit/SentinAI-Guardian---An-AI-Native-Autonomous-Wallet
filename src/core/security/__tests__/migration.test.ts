import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateSchema, SCHEMA_VERSION } from '../proposal';

describe('R5E Non-Destructive Database Migration Suite', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('M1: Fresh database initialization creates v2 schema directly', () => {
    migrateSchema(db);

    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(SCHEMA_VERSION);

    const columns = db.prepare('PRAGMA table_info(proposals)').all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    expect(columnNames.has('id')).toBe(true);
    expect(columnNames.has('owner_id')).toBe(true);
    expect(columnNames.has('digest')).toBe(true);
    expect(columnNames.has('iip_data')).toBe(true);
    expect(columnNames.has('status')).toBe(true);
    expect(columnNames.has('created_at')).toBe(true);
    expect(columnNames.has('expires_at')).toBe(true);
    expect(columnNames.has('authorized_at')).toBe(true);
    expect(columnNames.has('tx_hash')).toBe(true);
    expect(columnNames.has('updated_at')).toBe(true);
  });

  it('M2: Non-destructive migration from v1 schema preserves confirmed records and transaction hashes', () => {
    // 1. Simulate legacy v1 schema (from R5C)
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (1);

      CREATE TABLE proposals (
        id         TEXT PRIMARY KEY,
        iip_data   TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'PREPARED',
        created_at DATETIME DEFAULT (datetime('now'))
      );
    `);

    // Insert historical v1 proposals
    const sampleIIP = JSON.stringify({
      proofDigest: '0xhash123',
      intent: { action: 'TRANSFER', asset: 'ETH', amount: '0.1', recipientAlias: 'alice' },
      candidate: { to: '0xd8d', value: '100', chainId: 11155111 },
      policyDecision: { status: 'ALLOW', reason: 'ok' },
      simulation: { success: true },
      finalDecision: 'ALLOW_FOR_AUTHORIZATION',
    });

    db.prepare('INSERT INTO proposals (id, iip_data, status) VALUES (?, ?, ?)').run(
      'prop-confirmed-1',
      sampleIIP,
      'CONFIRMED'
    );

    db.prepare('INSERT INTO proposals (id, iip_data, status) VALUES (?, ?, ?)').run(
      'prop-prepared-legacy',
      sampleIIP,
      'PREPARED'
    );

    // 2. Run migration to v2
    migrateSchema(db);

    // Verify schema version updated to 2
    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(2);

    // Verify historical confirmed proposal survived with intact status
    const confirmed = db.prepare('SELECT * FROM proposals WHERE id = ?').get('prop-confirmed-1') as {
      id: string;
      status: string;
      owner_id: string;
    };
    expect(confirmed).toBeDefined();
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.owner_id).toBe('__legacy__');

    // Verify legacy PREPARED proposal was quarantined to EXPIRED (cannot be executed without authentic owner)
    const quarantined = db.prepare('SELECT * FROM proposals WHERE id = ?').get('prop-prepared-legacy') as {
      id: string;
      status: string;
    };
    expect(quarantined).toBeDefined();
    expect(quarantined.status).toBe('EXPIRED');
  });

  it('M3: Migration is idempotent (safe to run repeatedly)', () => {
    migrateSchema(db);
    expect(() => migrateSchema(db)).not.toThrow();
    expect(() => migrateSchema(db)).not.toThrow();

    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(SCHEMA_VERSION);
  });

  it('M4: Unsupported future schema fails closed safely', () => {
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (99);
    `);

    expect(() => migrateSchema(db)).toThrow('UNSUPPORTED_SCHEMA_VERSION');
  });
});
