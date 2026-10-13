import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySepoliaConnection, getNativeBalance, EXPECTED_CHAIN_ID } from '../rpc-service';
import { createPublicClient } from 'viem';

vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

describe('R6 Sepolia RPC Connectivity Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('R1: Successfully connects to Sepolia (11155111) and reads latest block', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockResolvedValue(EXPECTED_CHAIN_ID),
      getBlockNumber: vi.fn().mockResolvedValue(BigInt(5500000)),
    } as unknown as ReturnType<typeof createPublicClient>);

    const status = await verifySepoliaConnection('https://mock-sepolia.rpc');
    expect(status.status).toBe('CONNECTED');
    expect(status.chainId).toBe(11155111);
    expect(status.latestBlock).toBe(BigInt(5500000));
  });

  it('R2: Rejects non-Sepolia network (e.g. Mainnet 1) and fails closed with WRONG_CHAIN', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockResolvedValue(1), // Mainnet!
    } as unknown as ReturnType<typeof createPublicClient>);

    const status = await verifySepoliaConnection('https://mainnet-by-mistake.rpc');
    expect(status.status).toBe('WRONG_CHAIN');
    expect(status.error).toContain('WRONG_CHAIN');
    expect(status.error).toContain('Fallback to non-Sepolia network is strictly forbidden');
  });

  it('R3: Handles RPC network outage gracefully with UNAVAILABLE status', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as unknown as ReturnType<typeof createPublicClient>);

    const status = await verifySepoliaConnection('https://broken-rpc.com');
    expect(status.status).toBe('UNAVAILABLE');
    expect(status.error).toContain('RPC_UNAVAILABLE');
  });

  it('R4: Reads native balance with accurate BigInt precision', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getBalance: vi.fn().mockResolvedValue(BigInt('1500000000000000000')), // 1.5 ETH
    } as unknown as ReturnType<typeof createPublicClient>);

    const balance = await getNativeBalance('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(balance.raw).toBe(BigInt('1500000000000000000'));
    expect(balance.formatted).toBe('1.5000');
  });
});
