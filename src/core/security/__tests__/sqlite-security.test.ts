import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  storeProposal,
  authorizeProposal,
  lockProposalForExecution,
  markSubmitted,
  updateProposalStatus,
  getProposalStatus,
  isProposalExpired,
  _resetProposalsForTesting,
} from '../proposal';
import { generateIIP } from '../iip';
import type { IntentIntegrityProof } from '../iip';
import type { TransactionCandidate } from '../../transaction/builder';

function createMockIIP(): IntentIntegrityProof {
  const candidate: TransactionCandidate = {
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    value: BigInt('1000000000000000'),
    chainId: 11155111,
  };
  return generateIIP(
    { action: 'TRANSFER', asset: 'ETH', amount: '0.001', recipientAlias: 'alice' },
    candidate,
    { status: 'ALLOW', reason: 'ok' },
    { success: true, timestamp: 'now' }
  );
}

describe('R6 SQLite Security Corrections', () => {
  beforeEach(() => {
    _resetProposalsForTesting();
  });

  describe('3.1 State Transition Matrix Enforcement', () => {
    it('S1: Permits valid execution lifecycle (PREPARED -> AUTHORIZED -> SUBMITTING -> SUBMITTED -> CONFIRMED)', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, 'operator-1');
      expect(getProposalStatus(id)).toBe('PREPARED');

      expect(authorizeProposal(id, 'operator-1')).toBe(true);
      expect(getProposalStatus(id)).toBe('AUTHORIZED');

      expect(lockProposalForExecution(id, 'operator-1')).toBe(true);
      expect(getProposalStatus(id)).toBe('SUBMITTING');

      expect(markSubmitted(id, '0xhash123')).toBe(true);
      expect(getProposalStatus(id)).toBe('SUBMITTED');

      expect(updateProposalStatus(id, 'CONFIRMED')).toBe(true);
      expect(getProposalStatus(id)).toBe('CONFIRMED');
    });

    it('S2: Rejects forbidden retrograde transition (SUBMITTED -> PREPARED)', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, 'operator-1');
      authorizeProposal(id, 'operator-1');
      lockProposalForExecution(id, 'operator-1');
      markSubmitted(id, '0xhash123');

      expect(updateProposalStatus(id, 'PREPARED')).toBe(false);
      expect(getProposalStatus(id)).toBe('SUBMITTED');
    });

    it('S3: Rejects transition from terminal state (CONFIRMED -> SUBMITTING)', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, 'operator-1');
      authorizeProposal(id, 'operator-1');
      lockProposalForExecution(id, 'operator-1');
      markSubmitted(id, '0xhash123');
      updateProposalStatus(id, 'CONFIRMED');

      expect(updateProposalStatus(id, 'SUBMITTING')).toBe(false);
      expect(updateProposalStatus(id, 'PREPARED')).toBe(false);
      expect(getProposalStatus(id)).toBe('CONFIRMED');
    });

    it('S4: Rejects unauthorized jump (SUBMITTING -> AUTHORIZED)', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, 'operator-1');
      authorizeProposal(id, 'operator-1');
      lockProposalForExecution(id, 'operator-1');

      expect(updateProposalStatus(id, 'AUTHORIZED')).toBe(false);
      expect(getProposalStatus(id)).toBe('SUBMITTING');
    });

    it('S5: Rejects resurrection from FAILED_BEFORE_BROADCAST', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, 'operator-1');
      authorizeProposal(id, 'operator-1');
      lockProposalForExecution(id, 'operator-1');
      updateProposalStatus(id, 'FAILED_BEFORE_BROADCAST');

      expect(updateProposalStatus(id, 'PREPARED')).toBe(false);
      expect(updateProposalStatus(id, 'SUBMITTING')).toBe(false);
      expect(getProposalStatus(id)).toBe('FAILED_BEFORE_BROADCAST');
    });
  });

  describe('3.2 Expiration Precision & Boundary Testing', () => {
    it('S6: Rejects authorization at exact boundary timestamp', () => {
      const iip = createMockIIP();
      const lifetimeMs = 100;
      const id = storeProposal(iip, 'operator-1', lifetimeMs);

      // Verify boundary behavior with explicit reference time
      const startTime = Date.now();
      expect(isProposalExpired(id, startTime)).toBe(false);
      expect(isProposalExpired(id, startTime + lifetimeMs)).toBe(true); // Exact boundary is expired!
      expect(isProposalExpired(id, startTime + lifetimeMs + 1)).toBe(true);
    });
  });

  describe('3.3 WAL Backup Functionality', () => {
    const tempDbPath = path.join(process.cwd(), 'temp-test-backup.db');
    const backupPath = path.join(process.cwd(), 'temp-test-backup.db.bak');

    afterEach(() => {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      if (fs.existsSync(`${tempDbPath}-wal`)) fs.unlinkSync(`${tempDbPath}-wal`);
      if (fs.existsSync(`${tempDbPath}-shm`)) fs.unlinkSync(`${tempDbPath}-shm`);
    });

    it('S7: Checkpoints WAL and creates consistent file backup', () => {
      const db = new Database(tempDbPath);
      db.pragma('journal_mode = WAL');
      db.exec('CREATE TABLE test_data (id INT, val TEXT);');
      db.prepare('INSERT INTO test_data (id, val) VALUES (?, ?)').run(1, 'checkpoint_me');

      // Checkpoint WAL
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(tempDbPath, backupPath);

      // Verify backup is valid SQLite database
      const backupDb = new Database(backupPath);
      const row = backupDb.prepare('SELECT val FROM test_data WHERE id = 1').get() as { val: string };
      expect(row.val).toBe('checkpoint_me');
      backupDb.close();
      db.close();
    });
  });
});
