import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareTransactionIntent,
  authorizeAndExecute,
  _resetExecutedDigestsForTesting
} from '../orchestrator';
import { generateIIP, IntentIntegrityProof } from '@/core/security/iip';
import { ParsedIntent } from '@/core/domain/schemas';
import { TransactionCandidate } from '@/core/transaction/builder';
import { PolicyDecision } from '@/core/policy/engine';
import { SimulationResult } from '@/core/security/simulator';

// Mock dependencies
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

describe('Orchestrator Two-Phase Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetExecutedDigestsForTesting();
    process.env.RPC_URL = "https://sepolia.mock.rpc";
    process.env.AGENT_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  const dummyIntent: ParsedIntent = {
    action: "TRANSFER",
    asset: "ETH",
    amount: "0.05",
    recipientAlias: "alice"
  };

  const dummyCandidate: TransactionCandidate = {
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    value: BigInt("50000000000000000"),
    chainId: 11155111
  };

  const dummyPolicy: PolicyDecision = {
    status: "ALLOW",
    reason: "Policy requirements met",
    resolvedAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
  };

  const dummySimulation: SimulationResult = {
    success: true,
    gasEstimated: BigInt(21000),
    timestamp: "now"
  };

  it('Phase 1: prepareTransactionIntent should prepare IIP without executing', async () => {
    const { executeTransaction } = await import('@/core/execution/controller');

    const result = await prepareTransactionIntent("Send 0.05 ETH to alice");

    expect(result.success).toBe(true);
    expect(result.iip).toBeDefined();
    expect(result.iip?.finalDecision).toBe("ALLOW_FOR_AUTHORIZATION");
    expect(result.iip?.proofDigest).toMatch(/^0x[a-fA-F0-9]{64}$/);

    // Assert that Phase 1 DOES NOT execute transaction
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('Phase 2: authorizeAndExecute should reject tampered IIP (Security Gate 1)', async () => {
    const validIIP = generateIIP(dummyIntent, dummyCandidate, dummyPolicy, dummySimulation);

    // Tamper with value
    const tamperedIIP: IntentIntegrityProof = {
      ...validIIP,
      candidate: {
        ...validIIP.candidate,
        value: BigInt("99990000000000000000") // 99.99 ETH
      }
    };

    const result = await authorizeAndExecute(tamperedIIP);

    expect(result.success).toBe(false);
    expect(result.error).toContain("TAMPERED_PAYLOAD");
  });

  it('Phase 2: authorizeAndExecute should prevent duplicate execution on same digest (Security Gate 2 Idempotency)', async () => {
    const validIIP = generateIIP(dummyIntent, dummyCandidate, dummyPolicy, dummySimulation);

    // First execution: should succeed
    const firstAttempt = await authorizeAndExecute(validIIP);
    expect(firstAttempt.success).toBe(true);
    expect(firstAttempt.executionResult?.transactionHash).toBeDefined();

    // Duplicate replay execution: MUST fail with DUPLICATE_EXECUTION
    const secondAttempt = await authorizeAndExecute(validIIP);
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toContain("DUPLICATE_EXECUTION");
  });
});
