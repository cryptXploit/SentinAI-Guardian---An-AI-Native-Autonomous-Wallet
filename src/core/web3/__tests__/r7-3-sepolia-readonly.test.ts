import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicClient } from 'viem';
import {
  verifySepoliaConnection,
  EXPECTED_CHAIN_ID,
} from '../rpc-service';
import {
  getLiveWalletOverview,
} from '../wallet-service';
import * as rpcService from '../rpc-service';

vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

describe('Milestone R7.3 — Phase 5: Read-Only Sepolia Integration Suite (9 Requirements)', () => {
  const testAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Req 1: RPC Endpoint Reachable & Sepolia Chain ID ─────────────────────
  it('SR1: Confirms configured Sepolia chain ID is exactly 11155111', () => {
    expect(EXPECTED_CHAIN_ID).toBe(11155111);
  });

  // ─── Req 2: Live or Mocked Connection to Sepolia ──────────────────────────
  it('SR2: Returns status=CONNECTED and chainId=11155111 on valid Sepolia RPC', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockResolvedValue(11155111),
      getBlockNumber: vi.fn().mockResolvedValue(11905000n),
    } as unknown as ReturnType<typeof createPublicClient>);

    const connection = await verifySepoliaConnection('https://eth-sepolia.test.com');
    expect(connection.status).toBe('CONNECTED');
    expect(connection.chainId).toBe(11155111);
    expect(connection.latestBlock).toBe(11905000n);
  });

  // ─── Req 3: Wrong-Chain Responses Rejected ────────────────────────────────
  it('SR3: Rejects wrong-chain response (e.g. mainnet chainId=1) with WRONG_CHAIN', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockResolvedValue(1), // Ethereum Mainnet
      getBlockNumber: vi.fn().mockResolvedValue(20000000n),
    } as unknown as ReturnType<typeof createPublicClient>);

    const connection = await verifySepoliaConnection('https://eth-mainnet.test.com');
    expect(connection.status).toBe('WRONG_CHAIN');
    expect(connection.chainId).toBe(1);
    expect(connection.error).toContain('WRONG_CHAIN');
    expect(connection.error).toContain('Fallback to non-Sepolia network is strictly forbidden');
  });

  // ─── Req 4: Truthful Error Messages on RPC Failure ────────────────────────
  it('SR4: RPC failures produce truthful error messages with status=UNAVAILABLE', async () => {
    vi.mocked(createPublicClient).mockReturnValueOnce({
      getChainId: vi.fn().mockRejectedValue(new Error('Connection timed out after 8000ms')),
    } as unknown as ReturnType<typeof createPublicClient>);

    const connection = await verifySepoliaConnection('https://unreachable.rpc.com');
    expect(connection.status).toBe('UNAVAILABLE');
    expect(connection.error).toContain('RPC_UNAVAILABLE');
    expect(connection.error).toContain('Connection timed out after 8000ms');
  });

  // ─── Req 5: Never Generates Fabricated Zero Balances on Failure ───────────
  it('SR5: Failed RPC response sets status=UNAVAILABLE and never fabricates 0 balance', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'UNAVAILABLE',
      timestamp: new Date().toISOString(),
      rpcUrl: 'https://test-rpc.com',
      error: 'RPC node down',
    });

    const overview = await getLiveWalletOverview({
      customAddress: testAddress,
      customRpcUrl: 'https://test-rpc.com',
      forceRefresh: true,
    });

    expect(overview.nativeBalance.status).toBe('UNAVAILABLE');
    expect(overview.nativeBalance.formatted).toBe('—');
    expect(overview.nativeBalance.formatted).not.toBe('0');
    expect(overview.nativeBalance.formatted).not.toBe('0.00');

    // All token balances must be UNAVAILABLE, not fabricated 0
    overview.tokens.forEach((t) => {
      expect(t.status).toBe('UNAVAILABLE');
      expect(t.formattedBalance).toBe('—');
      expect(t.formattedBalance).not.toBe('0');
    });
  });

  // ─── Req 6 & 7: Correct Formatting & Decimals Respected ───────────────────
  it('SR6 & SR7: Correctly formats balances respecting token decimals (USDC 6 vs DAI 18)', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: 11900000n,
      timestamp: new Date().toISOString(),
      rpcUrl: 'https://test-rpc.com',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValue({
      raw: 1500000000000000000n, // 1.5 ETH
      formatted: '1.5000',
    });

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockImplementation(async ({ address }) => {
        // USDC (6 decimals): 100 USDC = 100_000_000n
        if (address.toLowerCase() === '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'.toLowerCase()) {
          return 100000000n;
        }
        // USDT (6 decimals): 25.5 USDT = 25_500_000n
        if (address.toLowerCase() === '0x7169d38820dfd117c3fa1f22a697dba58d90ba06'.toLowerCase()) {
          return 25500000n;
        }
        // DAI (18 decimals): 50 DAI = 50 * 10^18n
        return 50000000000000000000n;
      }),
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({
      customAddress: testAddress,
      customRpcUrl: 'https://test-rpc.com',
      forceRefresh: true,
    });

    expect(overview.nativeBalance.formatted).toBe('1.5000');

    const usdc = overview.tokens.find((t) => t.symbol === 'USDC');
    expect(usdc?.status).toBe('AVAILABLE');
    expect(usdc?.formattedBalance).toBe('100.00');

    const usdt = overview.tokens.find((t) => t.symbol === 'USDT');
    expect(usdt?.status).toBe('AVAILABLE');
    expect(usdt?.formattedBalance).toBe('25.50');

    const dai = overview.tokens.find((t) => t.symbol === 'DAI');
    expect(dai?.status).toBe('AVAILABLE');
    expect(dai?.formattedBalance).toBe('50.0000');
  });

  // ─── Req 8: Missing Token Metadata / Contract Revert Handled Safely ───────
  it('SR8: Safely handles un-deployed or reverting token contract without crashing', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: 11900000n,
      timestamp: new Date().toISOString(),
      rpcUrl: 'https://test-rpc.com',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValue({
      raw: 50000000000000000n,
      formatted: '0.0500',
    });

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockRejectedValue(new Error('The contract function balanceOf returned no data ("0x")')),
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({
      customAddress: testAddress,
      customRpcUrl: 'https://test-rpc.com',
      forceRefresh: true,
    });

    // Native balance still succeeded
    expect(overview.nativeBalance.status).toBe('AVAILABLE');

    // Token with missing contract failed gracefully without crashing
    const tokens = overview.tokens;
    tokens.forEach((t) => {
      expect(t.status).toBe('UNAVAILABLE');
      expect(t.formattedBalance).toBe('—');
      expect(t.error).toBeDefined();
    });
  });

  // ─── Req 9: UI Distinguishes Live from Demo/Mock Sources ───────────────────
  it('SR9: Correctly tags source as LIVE_RPC when live connection succeeds', async () => {
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: 11900000n,
      timestamp: new Date().toISOString(),
      rpcUrl: 'https://test-rpc.com',
    });

    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValue({
      raw: 0n,
      formatted: '0.0000',
    });

    vi.mocked(createPublicClient).mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
    } as unknown as ReturnType<typeof createPublicClient>);

    const overview = await getLiveWalletOverview({
      customAddress: testAddress,
      customRpcUrl: 'https://test-rpc.com',
      forceRefresh: true,
    });

    expect(overview.source).toBe('LIVE_RPC');
    expect(overview.rpcStatus).toBe('CONNECTED');
  });
});
