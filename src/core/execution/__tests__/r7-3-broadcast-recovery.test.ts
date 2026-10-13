import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeProposal,
  retrieveProposal,
  authorizeProposal,
  lockProposalForExecution,
  updateProposalStatus,
  getProposalStatus,
  getStuckSubmittingProposals,
  reconcileProposal,
  _resetProposalsForTesting,
  ALLOWED_STATUS_TRANSITIONS,
} from '../../security/proposal';
import { generateIIP } from '../../security/iip';
import type { IntentIntegrityProof } from '../../security/iip';
import { authorizeAndExecute } from '@/app/actions/orchestrator';
import * as auth from '../../security/auth';
import * as controller from '../controller';
import { BroadcastError } from '../controller';

describe('Milestone R7.3 — Phase 3: Broadcast State Machine & Crash Recovery Suite', () => {
  const operatorUserId = 'operator-test-session';

  beforeEach(() => {
    _resetProposalsForTesting();
    vi.restoreAllMocks();

    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
    process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test-rpc';

    vi.spyOn(auth, 'verifySession').mockResolvedValue({
      userId: operatorUserId,
      sessionId: 'session-xyz-123',
      expiresAt: Date.now() + 3600000,
    });
  });

  function createValidIIP(): IntentIntegrityProof {
    return generateIIP(
      { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
      { to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', value: BigInt('50000000000000000'), chainId: 11155111 },
      { status: 'ALLOW', reason: 'valid transfer within limit' },
      { success: true, timestamp: new Date().toISOString() }
    );
  }

  // ─── 1. Network Failure Simulations ─────────────────────────────────────────
  it('N1: Connection timeout during broadcast transitions to EXECUTION_UNKNOWN', async () => {
    vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
      new BroadcastError('Request timed out after 10000ms', 'BROADCAST_OUTCOME_UNKNOWN')
    );

    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    const result = await authorizeAndExecute(proposalId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('BROADCAST_UNCERTAIN');
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
  });

  it('N2: ECONNRESET during broadcast transitions to EXECUTION_UNKNOWN', async () => {
    vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
      new BroadcastError('fetch failed: socket closed ECONNRESET', 'BROADCAST_OUTCOME_UNKNOWN')
    );

    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    const result = await authorizeAndExecute(proposalId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('BROADCAST_UNCERTAIN');
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
  });

  it('N3: HTTP 504 Gateway Timeout during broadcast transitions to EXECUTION_UNKNOWN', async () => {
    vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
      new BroadcastError('HTTP 504 Gateway Timeout from Sepolia RPC', 'BROADCAST_OUTCOME_UNKNOWN')
    );

    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    const result = await authorizeAndExecute(proposalId);
    expect(result.success).toBe(false);
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
  });

  it('N4: Deterministic pre-broadcast failure (nonce too low) marks FAILED_BEFORE_BROADCAST', async () => {
    vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
      new BroadcastError('nonce too low: current nonce 45, tx nonce 44', 'DEFINITELY_NOT_BROADCAST')
    );

    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    const result = await authorizeAndExecute(proposalId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('BROADCAST_FAILED');
    expect(getProposalStatus(proposalId)).toBe('FAILED_BEFORE_BROADCAST');
  });

  it('N5: Transaction hash received but receipt timeout transitions to RECONCILIATION_REQUIRED', async () => {
    const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    vi.spyOn(controller, 'broadcastTransaction').mockResolvedValue({
      hash: txHash,
      outcome: 'BROADCAST_SUBMITTED',
    });
    vi.spyOn(controller, 'waitForReceipt').mockRejectedValue(
      new Error('Transaction receipt polling timed out after 60000ms')
    );

    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    const result = await authorizeAndExecute(proposalId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('RECEIPT_PENDING');
    expect(getProposalStatus(proposalId)).toBe('RECONCILIATION_REQUIRED');

    // Confirm transaction hash is safely persisted
    const record = retrieveProposal(proposalId);
    expect(record?.txHash).toBe(txHash);
  });

  // ─── 2. Crash Recovery & Prohibited Transitions ─────────────────────────────
  it('CR1: Server restart with EXECUTION_UNKNOWN record blocks duplicate execution', async () => {
    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    // Simulate an execution that ended in EXECUTION_UNKNOWN
    authorizeProposal(proposalId, operatorUserId);
    lockProposalForExecution(proposalId, operatorUserId);
    updateProposalStatus(proposalId, 'EXECUTION_UNKNOWN');
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');

    // Subsequent execution attempt MUST be rejected immediately (never re-dispatched)
    await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);

    // Record remains locked in EXECUTION_UNKNOWN
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
  });

  it('CR2: Server restart with RECONCILIATION_REQUIRED record blocks duplicate execution', async () => {
    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    authorizeProposal(proposalId, operatorUserId);
    lockProposalForExecution(proposalId, operatorUserId);
    updateProposalStatus(proposalId, 'SUBMITTED');
    updateProposalStatus(proposalId, 'RECONCILIATION_REQUIRED');
    expect(getProposalStatus(proposalId)).toBe('RECONCILIATION_REQUIRED');

    // Execution attempt must fail
    await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
    expect(getProposalStatus(proposalId)).toBe('RECONCILIATION_REQUIRED');
  });

  it('CR3: getStuckSubmittingProposals identifies in-flight proposals requiring reconciliation', () => {
    const iip = createValidIIP();
    const id1 = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);
    const id2 = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);
    const id3 = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    // id1: EXECUTION_UNKNOWN
    authorizeProposal(id1, operatorUserId);
    lockProposalForExecution(id1, operatorUserId);
    updateProposalStatus(id1, 'EXECUTION_UNKNOWN');

    // id2: RECONCILIATION_REQUIRED
    authorizeProposal(id2, operatorUserId);
    lockProposalForExecution(id2, operatorUserId);
    updateProposalStatus(id2, 'SUBMITTED');
    updateProposalStatus(id2, 'RECONCILIATION_REQUIRED');

    // id3: CONFIRMED (terminal)
    authorizeProposal(id3, operatorUserId);
    lockProposalForExecution(id3, operatorUserId);
    updateProposalStatus(id3, 'SUBMITTED');
    updateProposalStatus(id3, 'CONFIRMED');

    const stuck = getStuckSubmittingProposals();
    const stuckIds = stuck.map((p) => p.id);

    expect(stuckIds).toContain(id1);
    expect(stuckIds).toContain(id2);
    expect(stuckIds).not.toContain(id3);
  });

  it('CR4: External reconciliation can resolve EXECUTION_UNKNOWN to CONFIRMED or FAILED', () => {
    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    authorizeProposal(proposalId, operatorUserId);
    lockProposalForExecution(proposalId, operatorUserId);
    updateProposalStatus(proposalId, 'EXECUTION_UNKNOWN');

    // Admin reconciles after inspecting Sepolia explorer: transaction was confirmed
    const reconciled = reconcileProposal(proposalId, 'CONFIRMED', '0xverifiedhash');
    expect(reconciled).toBe(true);
    expect(getProposalStatus(proposalId)).toBe('CONFIRMED');

    const record = retrieveProposal(proposalId);
    expect(record?.status).toBe('CONFIRMED');
    expect(record?.txHash).toBe('0xverifiedhash');
  });

  it('CR5: Prohibited state transitions are strictly rejected by transition matrix', () => {
    const unknownAllowed = ALLOWED_STATUS_TRANSITIONS.EXECUTION_UNKNOWN;
    expect(unknownAllowed.has('SUBMITTING')).toBe(false);
    expect(unknownAllowed.has('PREPARED')).toBe(false);
    expect(unknownAllowed.has('AUTHORIZED')).toBe(false);

    const confirmedAllowed = ALLOWED_STATUS_TRANSITIONS.CONFIRMED;
    expect(confirmedAllowed.size).toBe(0);

    const revertedAllowed = ALLOWED_STATUS_TRANSITIONS.REVERTED;
    expect(revertedAllowed.size).toBe(0);
  });

  it('CR6: Concurrent authorization attempts allow exactly one execution lock', async () => {
    const iip = createValidIIP();
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    authorizeProposal(proposalId, operatorUserId);

    // Simulate two concurrent execution lock attempts
    const lock1 = lockProposalForExecution(proposalId, operatorUserId);
    const lock2 = lockProposalForExecution(proposalId, operatorUserId);

    // Exactly one must acquire lock
    expect(lock1).toBe(true);
    expect(lock2).toBe(false);
    expect(getProposalStatus(proposalId)).toBe('SUBMITTING');
  });
});
