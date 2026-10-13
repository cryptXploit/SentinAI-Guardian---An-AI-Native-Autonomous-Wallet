import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeProposal,
  storeFixtureProposal,
  retrieveProposal,
  authorizeProposal,
  lockProposalForExecution,
  getProposalStatus,
  _resetProposalsForTesting,
} from '../proposal';
import { generateIIP } from '../iip';
import type { IntentIntegrityProof } from '../iip';
import {
  testSecurityFixtureAction,
  authorizeAndExecute,
  MOCK_USER_POLICY,
} from '@/app/actions/orchestrator';
import * as auth from '../auth';
import * as controller from '../../execution/controller';
import { BroadcastError } from '../../execution/controller';
import { EXACT_MAX_UINT256, EXTREMELY_LARGE_FINITE_THRESHOLD } from '../approval-analyzer';

describe('Milestone R7.1 — Security Boundary, Demo Isolation & Execution Uncertainty Suite', () => {
  const mockUserId = 'operator-test-session';

  beforeEach(() => {
    _resetProposalsForTesting();
    vi.restoreAllMocks();

    // Mock authenticated operator session
    vi.spyOn(auth, 'verifySession').mockResolvedValue({
      userId: mockUserId,
      sessionId: 'test-session-123',
      expiresAt: Date.now() + 3600000,
    });
  });

  function createValidIIP(finalDecision: 'ALLOW_FOR_AUTHORIZATION' | 'BLOCKED' = 'ALLOW_FOR_AUTHORIZATION'): IntentIntegrityProof {
    return generateIIP(
      { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
      { to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', value: BigInt('50000000000000000'), chainId: 11155111 },
      { status: finalDecision === 'ALLOW_FOR_AUTHORIZATION' ? 'ALLOW' : 'BLOCKED', reason: 'policy verdict' },
      { success: finalDecision === 'ALLOW_FOR_AUTHORIZATION', timestamp: new Date().toISOString() }
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Priority A: Demo Fixture Execution Isolation
  // ──────────────────────────────────────────────────────────────────────────
  describe('Priority A: Demo Fixture Execution Isolation', () => {
    it('A1: Security fixtures are recorded with provenance=SECURITY_FIXTURE and is_executable=0', async () => {
      const res = await testSecurityFixtureAction('safe-bounded-approval');
      expect(res.proposalId).toBeDefined();
      expect(res.isDemo).toBe(true);
      expect(res.provenance).toBe('SECURITY_FIXTURE');

      const record = retrieveProposal(res.proposalId!);
      expect(record).toBeDefined();
      expect(record?.provenance).toBe('SECURITY_FIXTURE');
      expect(record?.isExecutable).toBe(false);
    });

    it('A2: Safe fixture CANNOT execute through authorizeAndExecute', async () => {
      const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
      const res = await testSecurityFixtureAction('safe-bounded-approval');
      const fixtureProposalId = res.proposalId!;

      await expect(authorizeAndExecute(fixtureProposalId)).rejects.toThrow(
        /FIXTURE_EXECUTION_BLOCKED/
      );

      // Signer / broadcast must NEVER have been called
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('A3: Blocked fixture CANNOT execute through authorizeAndExecute', async () => {
      const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
      const res = await testSecurityFixtureAction('excessive-finite-approval');
      const fixtureProposalId = res.proposalId!;

      await expect(authorizeAndExecute(fixtureProposalId)).rejects.toThrow(
        /FIXTURE_EXECUTION_BLOCKED/
      );

      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('A4: Direct authorizeProposal SQL rejects SECURITY_FIXTURE even in PREPARED state', () => {
      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const fixtureId = storeFixtureProposal(iip, mockUserId);

      // Attempting to authorize a fixture directly fails at SQL level (returns false)
      const authorized = authorizeProposal(fixtureId, mockUserId);
      expect(authorized).toBe(false);
      expect(getProposalStatus(fixtureId)).toBe('PREPARED');
    });

    it('A5: Direct lockProposalForExecution SQL rejects non-executable proposals', () => {
      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const nonExecId = storeProposal(iip, mockUserId, 60000, 'UNVERIFIED', false);

      const locked = lockProposalForExecution(nonExecId, mockUserId);
      expect(locked).toBe(false);
    });

    it('A6: Rejects forged proposal IDs and non-existent proposals', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await expect(authorizeAndExecute(fakeId)).rejects.toThrow(/UNKNOWN_PROPOSAL/);
    });

    it('A7: Live verified proposal remains compatible with normal authorization', async () => {
      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const liveId = storeProposal(iip, mockUserId, 60000, 'LIVE_VERIFIED', true);

      const record = retrieveProposal(liveId);
      expect(record?.provenance).toBe('LIVE_VERIFIED');
      expect(record?.isExecutable).toBe(true);

      const authorized = authorizeProposal(liveId, mockUserId);
      expect(authorized).toBe(true);
      expect(getProposalStatus(liveId)).toBe('AUTHORIZED');

      const locked = lockProposalForExecution(liveId, mockUserId);
      expect(locked).toBe(true);
      expect(getProposalStatus(liveId)).toBe('SUBMITTING');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Priority B: Broadcast Uncertainty Handling
  // ──────────────────────────────────────────────────────────────────────────
  describe('Priority B: Broadcast Uncertainty Handling', () => {
    it('B1: Classifies pre-dispatch failure as FAILED_BEFORE_BROADCAST', async () => {
      process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
      process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test';

      vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
        new BroadcastError('Nonce too low', 'DEFINITELY_NOT_BROADCAST')
      );

      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const liveId = storeProposal(iip, mockUserId, 60000, 'LIVE_VERIFIED', true);

      const result = await authorizeAndExecute(liveId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('BROADCAST_FAILED');
      expect(getProposalStatus(liveId)).toBe('FAILED_BEFORE_BROADCAST');
    });

    it('B2: Classifies ambiguous network timeout as EXECUTION_UNKNOWN (NOT FAILED_BEFORE_BROADCAST)', async () => {
      process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
      process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test';

      vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
        new BroadcastError('Gateway Timeout 504 on sendRawTransaction', 'BROADCAST_OUTCOME_UNKNOWN')
      );

      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const liveId = storeProposal(iip, mockUserId, 60000, 'LIVE_VERIFIED', true);

      const result = await authorizeAndExecute(liveId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('BROADCAST_UNCERTAIN');
      // Crucial: Status MUST be EXECUTION_UNKNOWN so it is never automatically replayed
      expect(getProposalStatus(liveId)).toBe('EXECUTION_UNKNOWN');
      expect(getProposalStatus(liveId)).not.toBe('FAILED_BEFORE_BROADCAST');
    });

    it('B3: Ambiguous broadcast errors are correctly detected by isAmbiguousBroadcastError', () => {
      expect(controller.isAmbiguousBroadcastError(new Error('Request timed out after 30000ms'))).toBe(true);
      expect(controller.isAmbiguousBroadcastError(new Error('Socket closed by peer'))).toBe(true);
      expect(controller.isAmbiguousBroadcastError(new Error('HTTP 504 Gateway Timeout'))).toBe(true);
      expect(controller.isAmbiguousBroadcastError(new Error('fetch failed: ECONNRESET'))).toBe(true);
      expect(controller.isAmbiguousBroadcastError(new Error('insufficient funds for gas * price + value'))).toBe(false);
      expect(controller.isAmbiguousBroadcastError(new Error('nonce too low'))).toBe(false);
    });

    it('B4: Hash received but receipt timeout transitions proposal to RECONCILIATION_REQUIRED', async () => {
      process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
      process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test';

      vi.spyOn(controller, 'broadcastTransaction').mockResolvedValue({
        hash: '0xconfirmedhash1234567890abcdef',
        outcome: 'BROADCAST_SUBMITTED',
      });
      vi.spyOn(controller, 'waitForReceipt').mockRejectedValue(
        new Error('Transaction receipt polling timed out')
      );

      const iip = createValidIIP('ALLOW_FOR_AUTHORIZATION');
      const liveId = storeProposal(iip, mockUserId, 60000, 'LIVE_VERIFIED', true);

      const result = await authorizeAndExecute(liveId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('RECEIPT_PENDING');
      expect(getProposalStatus(liveId)).toBe('RECONCILIATION_REQUIRED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Priority C & D: Approval Constants & Policies
  // ──────────────────────────────────────────────────────────────────────────
  describe('Priority C & D: Exact uint256 & Token Policies', () => {
    it('CD1: EXACT_MAX_UINT256 is strictly 2^256 - 1', () => {
      expect(EXACT_MAX_UINT256).toBe(115792089237316195423570985008687907853269984665640564039457584007913129639935n);
    });

    it('CD2: EXTREMELY_LARGE_FINITE_THRESHOLD is strictly 2^255', () => {
      expect(EXTREMELY_LARGE_FINITE_THRESHOLD).toBe(57896044618658097711785492504343953926634992332820282019728792003956564819968n);
      expect(EXTREMELY_LARGE_FINITE_THRESHOLD).toBeLessThan(EXACT_MAX_UINT256);
    });

    it('CD3: Default policy defines explicit USDC, DAI, and USDT token approval policies', () => {
      expect(MOCK_USER_POLICY.tokenApprovalPolicies).toBeDefined();
      const usdcPolicy = MOCK_USER_POLICY.tokenApprovalPolicies!['11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'];
      expect(usdcPolicy).toBeDefined();
      expect(usdcPolicy.tokenSymbol).toBe('USDC');
      expect(usdcPolicy.tokenDecimals).toBe(6);
      expect(usdcPolicy.maxApprovalAmountBaseUnits).toBe('100000000'); // 100 USDC
      expect(usdcPolicy.allowUnlimited).toBe(false);
    });
  });
});
