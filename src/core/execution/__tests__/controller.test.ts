import { describe, it, expect, vi } from 'vitest';
import { executeTransaction } from '../controller';
import { IntentIntegrityProof } from '../../security/iip';

// Mock viem clients
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('viem');
  return {
    ...actual,
    createWalletClient: vi.fn(),
    createPublicClient: vi.fn(),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({ address: "0xMockAccount" })
}));

describe('Execution Controller', () => {
  const dummyIIP: IntentIntegrityProof = {
    proofId: "1234",
    intent: { action: "TRANSFER", asset: "ETH", amount: "0.1", recipientAlias: "alice" },
    candidate: { to: "0x123", value: BigInt("100000"), chainId: 11155111 },
    policyDecision: { status: "ALLOW", reason: "Ok" },
    simulation: { success: true, timestamp: "now", gasEstimated: BigInt(21000) },
    timestamp: "now",
    finalDecision: "ALLOW_FOR_AUTHORIZATION"
  };

  it('should throw MISSING_CREDENTIALS if privateKey or rpcUrl are missing', async () => {
    await expect(executeTransaction(dummyIIP, "", ""))
      .rejects
      .toThrow("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");

    await expect(executeTransaction(dummyIIP, "0xPrivateKey", ""))
      .rejects
      .toThrow("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");

    await expect(executeTransaction(dummyIIP, "", "http://rpc.url"))
      .rejects
      .toThrow("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");
  });

  it('Critical Security Test: should throw UNAUTHORIZED_EXECUTION if IIP is BLOCKED', async () => {
    const blockedIIP: IntentIntegrityProof = {
      ...dummyIIP,
      finalDecision: "BLOCKED"
    };

    await expect(executeTransaction(blockedIIP, "0xPrivateKey", "http://rpc.url"))
      .rejects
      .toThrow("UNAUTHORIZED_EXECUTION");
  });

  it('should return valid execution result on successful viem broadcast', async () => {
    const { createWalletClient, createPublicClient } = await import('viem');
    
    (createWalletClient as any).mockReturnValueOnce({
      sendTransaction: vi.fn().mockResolvedValue("0xrealhash")
    });

    (createPublicClient as any).mockReturnValueOnce({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" })
    });

    const result = await executeTransaction(dummyIIP, "0xabc", "http://rpc.url");
    
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe("0xrealhash");
    expect(result.receiptStatus).toBe("success");
  });

  it('should catch broadcasting errors safely', async () => {
    const { createWalletClient, createPublicClient } = await import('viem');
    
    (createWalletClient as any).mockReturnValueOnce({
      sendTransaction: vi.fn().mockRejectedValue(new Error("nonce too low"))
    });

    (createPublicClient as any).mockReturnValueOnce({}); 

    const result = await executeTransaction(dummyIIP, "0xabc", "http://rpc.url");
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("nonce too low");
  });
});
