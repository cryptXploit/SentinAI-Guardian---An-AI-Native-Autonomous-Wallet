import { describe, it, expect, vi } from 'vitest';
import { simulateTransaction } from '../simulator';
import { TransactionCandidate } from '../../transaction/builder';

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

describe('Transaction Simulation Engine', () => {
  const dummyCandidate: TransactionCandidate = {
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    value: BigInt("50000000000000000"),
    chainId: 11155111
  };

  it('should return deterministic fallback when no RPC URL is provided', async () => {
    const result = await simulateTransaction(dummyCandidate);
    expect(result.success).toBe(true);
    expect(result.gasEstimated).toBe(BigInt("21000"));
    expect(result.timestamp).toBeDefined();
  });

  it('should return success and gas on valid viem RPC simulation', async () => {
    const { createPublicClient } = await import('viem');
    (createPublicClient as any).mockReturnValueOnce({
      estimateGas: vi.fn().mockResolvedValue(BigInt("21000"))
    });

    const result = await simulateTransaction(dummyCandidate, "https://mock-rpc.com");
    
    expect(result.success).toBe(true);
    expect(result.gasEstimated).toBe(BigInt("21000"));
    expect(result.timestamp).toBeDefined();
  });

  it('should return success=false and catch revert reason on RPC error', async () => {
    const { createPublicClient } = await import('viem');
    (createPublicClient as any).mockReturnValueOnce({
      estimateGas: vi.fn().mockRejectedValue(new Error("execution reverted: insufficient funds"))
    });

    const result = await simulateTransaction(dummyCandidate, "https://mock-rpc.com");
    
    expect(result.success).toBe(false);
    expect(result.revertReason).toContain("execution reverted: insufficient funds");
    expect(result.timestamp).toBeDefined();
  });
});
