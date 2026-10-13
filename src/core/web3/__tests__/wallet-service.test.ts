import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLiveWalletOverview,
  getAgentWalletAddress,
  _resetWalletCacheForTesting,
} from '../wallet-service';
import * as rpcService from '../rpc-service';
import { createPublicClient } from 'viem';

vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

describe('R6 Live Wallet Intelligence Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWalletCacheForTesting();
    process.env.AGENT_PRIVATE_KEY =
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('W1: Extracts agent address cleanly without exposing secret key', () => {
    const { address, isConfigured } = getAgentWalletAddress();
    expect(isConfigured).toBe(true);
    expect(address.startsWith('0x')).toBe(true);
    expect(address).not.toBe(process.env.AGENT_PRIVATE_KEY);
  });

  it('W2: Reports NOT_CONFIGURED when AGENT_PRIVATE_KEY is missing', async () => {
    delete process.env.AGENT_PRIVATE_KEY;
    const overview = await getLiveWalletOverview({ forceRefresh: true });
    expect(overview.isConfigured).toBe(false);
    expect(overview.rpcStatus).toBe('NOT_CONFIGURED');
  });

  it('W3: Retrieves real wallet state with native ETH and supported token balances', async () => {
    // Mock connection
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValueOnce({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: BigInt(5600000),
      timestamp: '2026-10-13T11:00:00.000Z',
      rpcUrl: 'https://sepolia.rpc',
    });

    // Mock native balance
    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValueOnce({
      raw: BigInt('2500000000000000000'), // 2.5 ETH
      formatted: '2.5000',
    });

    // Mock ERC-20 readContract calls
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockResolvedValue(BigInt('100000000')), // 100 USDC (6 decimals)
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({ forceRefresh: true });

    expect(overview.isConfigured).toBe(true);
    expect(overview.rpcStatus).toBe('CONNECTED');
    expect(overview.nativeBalance.formatted).toBe('2.5000');
    expect(overview.tokens.length).toBe(3); // USDC, USDT, DAI
    expect(overview.tokens.find((t) => t.symbol === 'USDC')?.formattedBalance).toBe('100.00');
    expect(overview.latestBlock).toBe(BigInt(5600000));
  });

  it('W4: Caches overview within 10s TTL to prevent duplicate RPC calls', async () => {
    const connectionSpy = vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: BigInt(5600000),
      timestamp: '2026-10-13T11:00:00.000Z',
      rpcUrl: 'https://sepolia.rpc',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValue({
      raw: BigInt(0),
      formatted: '0.0000',
    });

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
    } as unknown as ReturnType<typeof createPublicClient>);

    // Call 1
    await getLiveWalletOverview();
    expect(connectionSpy).toHaveBeenCalledTimes(1);

    // Call 2 within TTL
    await getLiveWalletOverview();
    expect(connectionSpy).toHaveBeenCalledTimes(1); // Served from cache!
  });
});
