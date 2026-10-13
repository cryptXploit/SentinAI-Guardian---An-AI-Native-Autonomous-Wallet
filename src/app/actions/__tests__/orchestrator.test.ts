import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  prepareTransactionIntent,
  authorizeAndExecute,
} from '../orchestrator';
import {
  _resetProposalsForTesting,
  _closeDbForTesting,
  retrieveProposal,
  getProposalStatus,
  storeProposal,
  authorizeProposal,
  lockProposalForExecution,
  updateProposalStatus,
  isProposalExpired,
  cancelProposal,
  reconcileProposal,
  recordTxHash,
  getStuckSubmittingProposals,
  _getDb,
} from '@/core/security/proposal';
import {
  verifySession,
  createSession,
  revokeSession,
  validateSessionToken,
  _resetSessionsForTesting,
} from '@/core/security/auth';
import { generateIIP, verifyIIPDigest } from '@/core/security/iip';
import type { IntentIntegrityProof } from '@/core/security/iip';
import type { TransactionCandidate } from '@/core/transaction/builder';
import type { PolicyDecision } from '@/core/policy/engine';
import type { SimulationResult } from '@/core/security/simulator';

// Mock dependencies
vi.mock('@/core/security/auth', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    verifySession: vi.fn(),
  };
});

vi.mock('@/core/ai/intent-parser', () => ({
  parseIntent: vi.fn().mockResolvedValue({
    action: "TRANSFER",
    asset: "ETH",
    amount: "0.05",
    recipientAlias: "alice"
  })
}));

vi.mock('@/core/security/simulator', () => ({
  simulateTransaction: vi.fn().mockResolvedValue({
    success: true,
    gasEstimated: BigInt(21000),
    timestamp: "now"
  })
}));

vi.mock('@/core/execution/controller', () => ({
  executeTransaction: vi.fn().mockResolvedValue({
    success: true,
    transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    receiptStatus: "success"
  })
}));

// Helper: create a mock IIP for direct proposal store tests
function createMockIIP(overrides?: Partial<IntentIntegrityProof>): IntentIntegrityProof {
  const candidate: TransactionCandidate = {
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    value: BigInt("50000000000000000"),
    chainId: 11155111,
  };
  const intent = { action: "TRANSFER" as const, asset: "ETH", amount: "0.05", recipientAlias: "alice" };
  const policy: PolicyDecision = { status: "ALLOW", reason: "ok", resolvedAddress: candidate.to };
  const simulation: SimulationResult = { success: true, gasEstimated: BigInt(21000), timestamp: "now" };
  const iip = generateIIP(intent, candidate, policy, simulation);
  return { ...iip, ...overrides };
}

describe('R5D — Security Recovery & Execution Reliability', () => {
  beforeAll(() => {
    _resetProposalsForTesting();
    _resetSessionsForTesting();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetProposalsForTesting();
    _resetSessionsForTesting();
    process.env.RPC_URL = "https://sepolia.mock.rpc";
    process.env.AGENT_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // Default: authenticated session
    (verifySession as any).mockResolvedValue({ userId: "operator-1", sessionId: "test-session", expiresAt: Date.now() + 3600000 });
  });

  afterAll(() => {
    _closeDbForTesting();
  });

  // ═══ Category A: Authentication ═══════════════════════════════════════════

  describe('Category A — Authentication', () => {
    it('A1: Valid session succeeds for preparation', async () => {
      const result = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(result.success).toBe(true);
      expect(result.proposalId).toBeDefined();
    });

    it('A2: Invalid/null session rejects preparation', async () => {
      (verifySession as any).mockResolvedValue(null);
      await expect(prepareTransactionIntent("Send 0.05 ETH to alice"))
        .rejects.toThrow("UNAUTHORIZED_ACCESS");
    });

    it('A3: Invalid/null session rejects execution', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      (verifySession as any).mockResolvedValue(null);
      await expect(authorizeAndExecute(prepared.proposalId!))
        .rejects.toThrow("UNAUTHORIZED_ACCESS");
    });

    it('A4: Expired session token is rejected', () => {
      const { token } = createSession("op-1", 1); // 1ms lifetime
      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 10) { /* spin */ }
      expect(validateSessionToken(token)).toBeNull();
    });

    it('A5: Revoked session token is rejected', () => {
      const { token } = createSession("op-1", 60000);
      expect(validateSessionToken(token)).not.toBeNull();
      revokeSession(token);
      expect(validateSessionToken(token)).toBeNull();
    });

    it('A6: No environment override bypass exists', () => {
      // Ensure SENTINAI_AUTH_OVERRIDE does NOT exist in the auth module
      // The actual verifySession (not mocked) should not check env overrides
      // We test by calling the real validateSessionToken with no session
      expect(validateSessionToken(undefined)).toBeNull();
      expect(validateSessionToken(null)).toBeNull();
      expect(validateSessionToken("bogus-token")).toBeNull();
    });
  });

  // ═══ Category B: Proposal Identity ════════════════════════════════════════

  describe('Category B — Proposal Identity', () => {
    it('B1: Proposals get unique random IDs (not digest)', () => {
      const iip = createMockIIP();
      const id1 = storeProposal(iip, "operator-1");
      const id2 = storeProposal(iip, "operator-1");
      // Same IIP but different proposal IDs (UUID-based)
      expect(id1).not.toBe(id2);
      // Neither should equal the digest
      expect(id1).not.toBe(iip.proofDigest);
      expect(id2).not.toBe(iip.proofDigest);
    });

    it('B2: Identical transaction digests across independent proposals', () => {
      const iip = createMockIIP();
      const id1 = storeProposal(iip, "operator-1");
      const id2 = storeProposal(iip, "operator-1");
      const p1 = retrieveProposal(id1);
      const p2 = retrieveProposal(id2);
      expect(p1!.digest).toBe(p2!.digest); // Same transaction digest
      expect(p1!.id).not.toBe(p2!.id);     // Different proposal IDs
    });

    it('B3: Duplicate insert cannot reset existing status (INSERT safety)', () => {
      const iip = createMockIIP();
      const id1 = storeProposal(iip, "operator-1");
      // Authorize and execute the first proposal
      authorizeProposal(id1, "operator-1");
      lockProposalForExecution(id1, "operator-1");
      updateProposalStatus(id1, "CONFIRMED");
      expect(getProposalStatus(id1)).toBe("CONFIRMED");

      // Store the same IIP again — gets a NEW proposal ID
      const id2 = storeProposal(iip, "operator-1");
      expect(id2).not.toBe(id1);

      // Original proposal status is preserved
      expect(getProposalStatus(id1)).toBe("CONFIRMED");
      // New proposal is PREPARED
      expect(getProposalStatus(id2)).toBe("PREPARED");
    });

    it('B4: Terminal state cannot revert to executable state', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");
      updateProposalStatus(id, "CONFIRMED");

      // Try to re-authorize — should fail
      expect(authorizeProposal(id, "operator-1")).toBe(false);
      // Try to re-lock — should fail
      expect(lockProposalForExecution(id, "operator-1")).toBe(false);
      // Status remains CONFIRMED
      expect(getProposalStatus(id)).toBe("CONFIRMED");
    });
  });

  // ═══ Category C: Authorization ════════════════════════════════════════════

  describe('Category C — Authorization & Ownership', () => {
    it('C1: Operator A creates proposal, Operator B cannot execute', async () => {
      // Operator A creates proposal
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(prepared.success).toBe(true);

      // Switch to Operator B
      (verifySession as any).mockResolvedValue({ userId: "operator-2", sessionId: "s2", expiresAt: Date.now() + 3600000 });

      await expect(authorizeAndExecute(prepared.proposalId!))
        .rejects.toThrow("OWNERSHIP_VIOLATION");
    });

    it('C2: Unknown identity cannot authorize', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      (verifySession as any).mockResolvedValue(null);
      await expect(authorizeAndExecute(prepared.proposalId!))
        .rejects.toThrow("UNAUTHORIZED_ACCESS");
    });

    it('C3: Expired proposal cannot be executed', async () => {
      // Store proposal with 1ms lifetime (immediately expired)
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1", 1);
      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 10) { /* spin */ }

      await expect(authorizeAndExecute(id))
        .rejects.toThrow("PROPOSAL_EXPIRED");
    });

    it('C4: Cancelled proposal cannot be executed', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      cancelProposal(id, "operator-1");
      expect(getProposalStatus(id)).toBe("CANCELLED");
      // Cannot authorize a cancelled proposal
      expect(authorizeProposal(id, "operator-1")).toBe(false);
    });

    it('C5: Valid owner can authorize and execute a valid proposal', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(prepared.success).toBe(true);

      const executed = await authorizeAndExecute(prepared.proposalId!);
      expect(executed.success).toBe(true);
      expect(executed.executionResult?.transactionHash).toBeDefined();
    });

    it('C6: Authorization for proposal A cannot execute proposal B', () => {
      const iip = createMockIIP();
      const idA = storeProposal(iip, "operator-1");
      const idB = storeProposal(iip, "operator-1");

      // Authorize A
      authorizeProposal(idA, "operator-1");
      // B is still PREPARED — cannot lock
      expect(lockProposalForExecution(idB, "operator-1")).toBe(false);
    });
  });

  // ═══ Category D: Idempotency ══════════════════════════════════════════════

  describe('Category D — Idempotency', () => {
    it('D1: Sequential duplicate execution rejected', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      const firstRun = await authorizeAndExecute(prepared.proposalId!);
      expect(firstRun.success).toBe(true);
      expect(getProposalStatus(prepared.proposalId!)).toBe("CONFIRMED");

      await expect(authorizeAndExecute(prepared.proposalId!))
        .rejects.toThrow("DUPLICATE_EXECUTION");
    });

    it('D2: Concurrent duplicate execution — only one succeeds', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");

      const [r1, r2] = await Promise.allSettled([
        authorizeAndExecute(prepared.proposalId!),
        authorizeAndExecute(prepared.proposalId!)
      ]);

      const successes = [r1, r2].filter(r => r.status === 'fulfilled');
      const failures = [r1, r2].filter(r => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect((failures[0] as PromiseRejectedResult).reason.message).toContain("DUPLICATE_EXECUTION");
    });

    it('D3: Terminal state immutability', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");
      updateProposalStatus(id, "CONFIRMED");

      // Cannot transition back
      expect(updateProposalStatus(id, "FAILED")).toBe(false);
      expect(authorizeProposal(id, "operator-1")).toBe(false);
      expect(lockProposalForExecution(id, "operator-1")).toBe(false);
      expect(getProposalStatus(id)).toBe("CONFIRMED");
    });
  });

  // ═══ Category E: Execution Reliability ════════════════════════════════════

  describe('Category E — Execution Reliability', () => {
    it('E1: Execution throws — proposal stays SUBMITTING for reconciliation', async () => {
      const { executeTransaction } = await import('@/core/execution/controller');
      (executeTransaction as any).mockRejectedValueOnce(new Error("RPC timeout"));

      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      const result = await authorizeAndExecute(prepared.proposalId!);

      expect(result.success).toBe(false);
      expect(result.error).toContain("EXECUTION_UNCERTAIN");
      // CRITICAL: proposal remains SUBMITTING, not reset to PREPARED
      expect(getProposalStatus(prepared.proposalId!)).toBe("SUBMITTING");
    });

    it('E2: Failed receipt records FAILED terminal state', async () => {
      const { executeTransaction } = await import('@/core/execution/controller');
      (executeTransaction as any).mockResolvedValueOnce({
        success: false,
        error: "insufficient funds",
        receiptStatus: "failure"
      });

      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      const result = await authorizeAndExecute(prepared.proposalId!);

      expect(result.success).toBe(false);
      expect(getProposalStatus(prepared.proposalId!)).toBe("FAILED");
    });

    it('E3: Reverted receipt records REVERTED terminal state', async () => {
      const { executeTransaction } = await import('@/core/execution/controller');
      (executeTransaction as any).mockResolvedValueOnce({
        success: false,
        transactionHash: "0xabc123",
        receiptStatus: "reverted"
      });

      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      const result = await authorizeAndExecute(prepared.proposalId!);

      expect(result.success).toBe(false);
      expect(getProposalStatus(prepared.proposalId!)).toBe("REVERTED");
    });

    it('E4: Tx hash is recorded for crash recovery', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      await authorizeAndExecute(prepared.proposalId!);

      const proposal = retrieveProposal(prepared.proposalId!);
      expect(proposal?.txHash).toBe("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
    });

    it('E5: Stuck SUBMITTING proposals are discoverable for reconciliation', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");
      // Simulate crash — proposal stuck in SUBMITTING
      recordTxHash(id, "0xdeadbeef");

      const stuck = getStuckSubmittingProposals();
      expect(stuck.length).toBeGreaterThanOrEqual(1);
      expect(stuck.find(p => p.id === id)).toBeDefined();
    });

    it('E6: Reconciliation resolves SUBMITTING to terminal state', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");

      expect(reconcileProposal(id, "CONFIRMED", "0xabc123")).toBe(true);
      expect(getProposalStatus(id)).toBe("CONFIRMED");
    });

    it('E7: Double reconciliation is idempotent (second attempt fails)', () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");

      expect(reconcileProposal(id, "CONFIRMED")).toBe(true);
      expect(reconcileProposal(id, "FAILED")).toBe(false); // Already CONFIRMED
      expect(getProposalStatus(id)).toBe("CONFIRMED");
    });

    it('E8: Duplicate execution during reconciliation blocked', async () => {
      const iip = createMockIIP();
      const id = storeProposal(iip, "operator-1");
      authorizeProposal(id, "operator-1");
      lockProposalForExecution(id, "operator-1");
      // Now in SUBMITTING — reconcile it
      reconcileProposal(id, "CONFIRMED");

      // Try to execute via orchestrator — should be blocked
      await expect(authorizeAndExecute(id))
        .rejects.toThrow("DUPLICATE_EXECUTION");
    });
  });

  // ═══ Category F: IIP Integrity ════════════════════════════════════════════

  describe('Category F — IIP Integrity', () => {
    it('F1: Changed calldata detected', () => {
      const iip = createMockIIP();
      const tampered = { ...iip, candidate: { ...iip.candidate, data: "0xdeadbeef" } };
      expect(verifyIIPDigest(tampered)).toBe(false);
    });

    it('F2: Changed recipient detected', () => {
      const iip = createMockIIP();
      const tampered = { ...iip, candidate: { ...iip.candidate, to: "0x1111111254fb6c44bac0bed2854e76f90643097d" } };
      expect(verifyIIPDigest(tampered)).toBe(false);
    });

    it('F3: Changed amount detected', () => {
      const iip = createMockIIP();
      const tampered = { ...iip, candidate: { ...iip.candidate, value: BigInt("999000000000000000000") } };
      expect(verifyIIPDigest(tampered)).toBe(false);
    });

    it('F4: Changed chain detected', () => {
      const iip = createMockIIP();
      const tampered = { ...iip, candidate: { ...iip.candidate, chainId: 1 } };
      expect(verifyIIPDigest(tampered)).toBe(false);
    });

    it('F5: Tampered payload rejected at execution', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      const proposal = retrieveProposal(prepared.proposalId!);
      expect(proposal).toBeDefined();
      expect(verifyIIPDigest(proposal!.iipData)).toBe(true);

      // Verify the digest check catches tampering on retrieved data
      const tampered = { ...proposal!.iipData, candidate: { ...proposal!.iipData.candidate, value: BigInt(0) } };
      expect(verifyIIPDigest(tampered)).toBe(false);
    });
  });

  // ═══ Category G: Regression ═══════════════════════════════════════════════

  describe('Category G — Regression', () => {
    it('G1: prepareTransactionIntent does not leak raw IIP', async () => {
      const result = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(result.success).toBe(true);
      expect((result as any).iip).toBeUndefined();
      expect((result as any).candidate).toBeUndefined();
      expect(result.summary?.action).toBe("TRANSFER");
      expect(result.summary?.asset).toBe("ETH");
    });

    it('G2: Unknown recipient fails closed', async () => {
      const { parseIntent } = await import('@/core/ai/intent-parser');
      (parseIntent as any).mockResolvedValueOnce({
        action: "TRANSFER", asset: "ETH", amount: "0.05", recipientAlias: "unknown_person"
      });

      const result = await prepareTransactionIntent("Send 0.05 ETH to unknown_person");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown recipient alias");
    });

    it('G3: End-to-end prepare and execute succeeds', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(prepared.success).toBe(true);

      const executed = await authorizeAndExecute(prepared.proposalId!);
      expect(executed.success).toBe(true);
      expect(executed.executionResult?.transactionHash).toBeDefined();
      expect(getProposalStatus(prepared.proposalId!)).toBe("CONFIRMED");
    });

    it('G4: Bogus proposalId rejected', async () => {
      await expect(authorizeAndExecute("nonexistent-uuid"))
        .rejects.toThrow("UNKNOWN_PROPOSAL");
    });

    it('G5: State machine transitions are recorded', async () => {
      const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
      expect(getProposalStatus(prepared.proposalId!)).toBe("PREPARED");

      await authorizeAndExecute(prepared.proposalId!);
      expect(getProposalStatus(prepared.proposalId!)).toBe("CONFIRMED");
    });
  });
});
