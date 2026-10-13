import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareTransactionIntent,
  authorizeAndExecute,
  _resetExecutedDigestsForTesting
} from '../orchestrator';
import { _resetProposalsForTesting, retrieveProposal } from '@/core/security/proposal';
import { verifySession } from '@/core/security/auth';

// Mock dependencies
vi.mock('@/core/security/auth', () => ({
  verifySession: vi.fn(),
}));

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

describe('Orchestrator Two-Phase Authenticated Actions (R5A)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _resetExecutedDigestsForTesting();
    _resetProposalsForTesting();
    process.env.RPC_URL = "https://sepolia.mock.rpc";
    process.env.AGENT_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    
    // Default to authenticated session
    (verifySession as any).mockResolvedValue({ userId: "operator-1" });
  });

  it('Negative Test 1: should reject authorizeAndExecute with UNAUTHORIZED_ACCESS if session is invalid', async () => {
    // 1. Prepare intent with authenticated session
    const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
    expect(prepared.success).toBe(true);
    expect(prepared.proposalId).toBeDefined();

    // 2. Mock session to return null (unauthorized)
    (verifySession as any).mockResolvedValue(null);

    // 3. Attempt authorization
    await expect(authorizeAndExecute(prepared.proposalId!))
      .rejects
      .toThrow("UNAUTHORIZED_ACCESS");
  });

  it('Negative Test 2: should reject authorizeAndExecute with UNKNOWN_PROPOSAL if proposalId does not exist', async () => {
    const bogusProposalId = "0x9999999999999999999999999999999999999999999999999999999999999999";

    await expect(authorizeAndExecute(bogusProposalId))
      .rejects
      .toThrow("UNKNOWN_PROPOSAL");
  });

  it('Negative Test 3: prepareTransactionIntent must NOT leak raw IIP or candidate parameters', async () => {
    const result = await prepareTransactionIntent("Send 0.05 ETH to alice");

    expect(result.success).toBe(true);
    expect(result.proposalId).toBeDefined();
    expect(result.summary).toBeDefined();

    // Assert that raw candidate and raw IIP internals are NOT present in the client payload
    expect((result as any).iip).toBeUndefined();
    expect((result as any).candidate).toBeUndefined();

    // Summary contains only safe display fields
    expect(result.summary?.action).toBe("TRANSFER");
    expect(result.summary?.asset).toBe("ETH");
    expect(result.summary?.amount).toBe("0.05");
    expect(result.summary?.recipientAddress).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  });

  it('Positive Test 4: End-to-end two-phase preparation and execution with server-stored proposal', async () => {
    const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
    expect(prepared.success).toBe(true);
    expect(prepared.proposalId).toBeDefined();

    const executed = await authorizeAndExecute(prepared.proposalId!);
    expect(executed.success).toBe(true);
    expect(executed.proposalId).toBe(prepared.proposalId);
    expect(executed.executionResult?.transactionHash).toBeDefined();
  });

  it('Negative Test 5: authorizeAndExecute should reject tampered proposal payload (Security Gate 1)', async () => {
    const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");
    const stored = retrieveProposal(prepared.proposalId!);
    expect(stored).toBeDefined();

    // Tamper with the candidate value in the stored proposal
    stored!.candidate.value = BigInt("99990000000000000000");

    await expect(authorizeAndExecute(prepared.proposalId!))
      .rejects
      .toThrow("TAMPERED_PAYLOAD");
  });

  it('Negative Test 6: authorizeAndExecute must prevent duplicate execution on same proposal (Security Gate 2 Idempotency)', async () => {
    const prepared = await prepareTransactionIntent("Send 0.05 ETH to alice");

    // First execution succeeds
    const firstRun = await authorizeAndExecute(prepared.proposalId!);
    expect(firstRun.success).toBe(true);

    // Duplicate replay execution on same proposal throws DUPLICATE_EXECUTION
    await expect(authorizeAndExecute(prepared.proposalId!))
      .rejects
      .toThrow("DUPLICATE_EXECUTION");
  });
});
