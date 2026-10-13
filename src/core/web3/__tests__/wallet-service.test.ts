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

describe('R7 Live Wallet Intelligence Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWalletCacheForTesting();
    delete process.env.AGENT_WALLET_ADDRESS;
    delete process.env.PUBLIC_WALLET_ADDRESS;
    process.env.AGENT_PRIVATE_KEY =
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('W1: Extracts agent address cleanly without exposing secret key', () => {
    const { address, isConfigured, canSign } = getAgentWalletAddress();
    expect(isConfigured).toBe(true);
    expect(canSign).toBe(true);
    expect(address.startsWith('0x')).toBe(true);
    expect(address).not.toBe(process.env.AGENT_PRIVATE_KEY);
  });

  it('W2: Supports read-only public address configuration without private key', () => {
    delete process.env.AGENT_PRIVATE_KEY;
    process.env.AGENT_WALLET_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    const { address, isConfigured, canSign } = getAgentWalletAddress();
    expect(isConfigured).toBe(true);
    expect(canSign).toBe(false);
    expect(address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('W3: Reports NOT_CONFIGURED when both private key and public address are missing', async () => {
    delete process.env.AGENT_PRIVATE_KEY;
    delete process.env.AGENT_WALLET_ADDRESS;
    const overview = await getLiveWalletOverview({ forceRefresh: true });
    expect(overview.isConfigured).toBe(false);
    expect(overview.rpcStatus).toBe('NOT_CONFIGURED');
    expect(overview.nativeBalance.status).toBe('NOT_CONFIGURED');
    expect(overview.nativeBalance.formatted).toBe('—');
  });

  it('W4: Retrieves real wallet state with native ETH and supported token balances', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValueOnce({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: BigInt(5600000),
      timestamp: '2026-10-13T11:00:00.000Z',
      rpcUrl: 'https://sepolia.rpc',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValueOnce({
      raw: BigInt('2500000000000000000'), // 2.5 ETH
      formatted: '2.5000',
    });

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockResolvedValue(BigInt('100000000')), // 100 USDC (6 decimals)
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({ forceRefresh: true });

    expect(overview.isConfigured).toBe(true);
    expect(overview.rpcStatus).toBe('CONNECTED');
    expect(overview.nativeBalance.status).toBe('AVAILABLE');
    expect(overview.nativeBalance.formatted).toBe('2.5000');
    expect(overview.tokens.length).toBe(3); // USDC, USDT, DAI
    const usdc = overview.tokens.find((t) => t.symbol === 'USDC');
    expect(usdc?.status).toBe('AVAILABLE');
    expect(usdc?.formattedBalance).toBe('100.00');
    expect(overview.latestBlock).toBe(BigInt(5600000));
  });

  it('W5: RPC failure is marked as UNAVAILABLE with dash, not fabricated zero', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValueOnce({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: BigInt(5600000),
      timestamp: '2026-10-13T11:00:00.000Z',
      rpcUrl: 'https://sepolia.rpc',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockRejectedValueOnce(
      new Error('RPC rate limit exceeded')
    );

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockRejectedValue(new Error('RPC read error')),
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({ forceRefresh: true });

    expect(overview.nativeBalance.status).toBe('UNAVAILABLE');
    expect(overview.nativeBalance.formatted).toBe('—');
    expect(overview.nativeBalance.error).toContain('rate limit');

    const usdc = overview.tokens.find((t) => t.symbol === 'USDC');
    expect(usdc?.status).toBe('UNAVAILABLE');
    expect(usdc?.formattedBalance).toBe('—');
    expect(usdc?.error).toContain('RPC read error');
  });

  it('W6: Cache is isolated across different wallet addresses to prevent cross-contamination', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: BigInt(5600000),
      timestamp: '2026-10-13T11:00:00.000Z',
      rpcUrl: 'https://sepolia.rpc',
    });

    const getNativeSpy = vi.spyOn(rpcService, 'getNativeBalance')
      .mockResolvedValueOnce({ raw: BigInt('1000000000000000000'), formatted: '1.0000' }) // Alice
      .mockResolvedValueOnce({ raw: BigInt('5000000000000000000'), formatted: '5.0000' }); // Bob

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
    } as unknown as ReturnType<typeof createPublicClient>);

    // Query 1: Alice
    const alice = await getLiveWalletOverview({
      customAddress: '0x1111111111111111111111111111111111111111',
    });
    expect(alice.address).toBe('0x1111111111111111111111111111111111111111');
    expect(alice.nativeBalance.formatted).toBe('1.0000');

    // Query 2: Bob (different address) must NOT get Alice's cached data!
    const bob = await getLiveWalletOverview({
      customAddress: '0x2222222222222222222222222222222222222222',
    });
    expect(bob.address).toBe('0x2222222222222222222222222222222222222222');
    expect(bob.nativeBalance.formatted).toBe('5.0000');

    expect(getNativeSpy).toHaveBeenCalledTimes(2);
  });
});
