import { formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getPublicClient, verifySepoliaConnection, getNativeBalance } from './rpc-service';
import { SUPPORTED_TOKENS, TokenInfo } from '../transaction/builder';

export type BalanceStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNSUPPORTED';

export type TokenBalance = {
  symbol: string;
  address: string;
  decimals: number;
  status: BalanceStatus;
  rawBalance?: bigint;
  formattedBalance: string;
  error?: string;
};

export type NativeBalance = {
  symbol: 'ETH';
  status: BalanceStatus;
  raw?: bigint;
  formatted: string;
  error?: string;
};

export type WalletOverview = {
  address: string;
  isConfigured: boolean;
  canSign: boolean;
  network: string;
  chainId: number;
  nativeBalance: NativeBalance;
  tokens: TokenBalance[];
  latestBlock?: bigint;
  timestamp: string;
  rpcStatus: 'CONNECTED' | 'UNAVAILABLE' | 'WRONG_CHAIN' | 'NOT_CONFIGURED';
  source: 'LIVE_RPC' | 'MOCK' | 'UNAVAILABLE';
  error?: string;
};

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Isolated in-memory cache for wallet overview (10-second TTL per address/rpc/chain)
interface CacheEntry {
  data: WalletOverview;
  expiresAt: number;
}

const _walletCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 20;

function getCacheKey(address: string, rpcUrl: string, chainId: number): string {
  // Strip sensitive query params from RPC url if present
  let safeRpc = rpcUrl;
  try {
    const parsed = new URL(rpcUrl);
    safeRpc = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // If not a full URL, use as-is
  }
  return `${address.toLowerCase()}:${safeRpc}:${chainId}`;
}

/**
 * Resolves the agent's wallet address from private key or environment without exposing the secret.
 * Also supports read-only public address configuration (AGENT_WALLET_ADDRESS / PUBLIC_WALLET_ADDRESS).
 */
export function getAgentWalletAddress(): { address: string; isConfigured: boolean; canSign: boolean } {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      return {
        address: account.address,
        isConfigured: true,
        canSign: true,
      };
    } catch {
      // Fall through to public address check
    }
  }

  // Check read-only public address (does not require custody of private key)
  const publicAddress = process.env.AGENT_WALLET_ADDRESS || process.env.PUBLIC_WALLET_ADDRESS;
  if (publicAddress && /^0x[0-9a-fA-F]{40}$/.test(publicAddress)) {
    return {
      address: publicAddress,
      isConfigured: true,
      canSign: false,
    };
  }

  return {
    address: '0x0000000000000000000000000000000000000000',
    isConfigured: false,
    canSign: false,
  };
}

/**
 * Reads complete live wallet asset overview (ETH + supported ERC-20 tokens) on Sepolia.
 * Employs isolated caching per address/rpc/chain to prevent cross-account cache contamination.
 */
export async function getLiveWalletOverview(options?: {
  forceRefresh?: boolean;
  customRpcUrl?: string;
  customAddress?: string;
}): Promise<WalletOverview> {
  const now = Date.now();

  const { address, isConfigured, canSign } = options?.customAddress
    ? { address: options.customAddress, isConfigured: true, canSign: false }
    : getAgentWalletAddress();

  const effectiveRpc = options?.customRpcUrl || process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const cacheKey = getCacheKey(address, effectiveRpc, 11155111);

  if (!options?.forceRefresh) {
    const cached = _walletCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  if (!isConfigured) {
    const unconfigured: WalletOverview = {
      address,
      isConfigured: false,
      canSign: false,
      network: 'Sepolia',
      chainId: 11155111,
      nativeBalance: {
        symbol: 'ETH',
        status: 'NOT_CONFIGURED',
        formatted: '—',
        error: 'Wallet address not configured',
      },
      tokens: Object.values(SUPPORTED_TOKENS).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        status: 'NOT_CONFIGURED',
        formattedBalance: '—',
        error: 'Wallet address not configured',
      })),
      timestamp: new Date().toISOString(),
      rpcStatus: 'NOT_CONFIGURED',
      source: 'UNAVAILABLE',
      error: 'AGENT_PRIVATE_KEY or AGENT_WALLET_ADDRESS is not configured in .env.local',
    };
    return unconfigured;
  }

  // Check network connectivity and chain ID
  const connection = await verifySepoliaConnection(options?.customRpcUrl);

  if (connection.status !== 'CONNECTED') {
    const rpcUnavailable: WalletOverview = {
      address,
      isConfigured: true,
      canSign,
      network: 'Sepolia',
      chainId: connection.chainId,
      nativeBalance: {
        symbol: 'ETH',
        status: 'UNAVAILABLE',
        formatted: '—',
        error: connection.error || 'Sepolia RPC node is currently unreachable.',
      },
      tokens: Object.values(SUPPORTED_TOKENS).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        status: 'UNAVAILABLE',
        formattedBalance: '—',
        error: connection.error || 'Sepolia RPC node unreachable',
      })),
      timestamp: new Date().toISOString(),
      rpcStatus: connection.status,
      source: 'UNAVAILABLE',
      error: connection.error || 'Sepolia RPC node is currently unreachable.',
    };
    return rpcUnavailable;
  }

  // 1. Fetch native ETH balance (do not confuse unavailable with zero)
  let nativeEth: NativeBalance;
  try {
    const res = await getNativeBalance(address, options?.customRpcUrl);
    nativeEth = {
      symbol: 'ETH',
      status: 'AVAILABLE',
      raw: res.raw,
      formatted: res.formatted,
    };
  } catch (nativeErr: unknown) {
    nativeEth = {
      symbol: 'ETH',
      status: 'UNAVAILABLE',
      formatted: '—',
      error: nativeErr instanceof Error ? nativeErr.message : 'Failed to read native ETH balance from RPC',
    };
  }

  // 2. Fetch supported ERC-20 token balances concurrently
  const client = getPublicClient(options?.customRpcUrl);
  const tokenList: TokenInfo[] = Object.values(SUPPORTED_TOKENS);

  const tokenPromises = tokenList.map(async (token): Promise<TokenBalance> => {
    try {
      const rawBalance = await client.readContract({
        address: getAddress(token.address),
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [getAddress(address)],
      });

      const formatted = formatUnits(rawBalance, token.decimals);
      return {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        status: 'AVAILABLE',
        rawBalance,
        formattedBalance: Number(formatted).toFixed(token.decimals > 6 ? 4 : 2),
      };
    } catch (tokenErr: unknown) {
      // RPC failure is NOT evidence of a zero balance
      return {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        status: 'UNAVAILABLE',
        formattedBalance: '—',
        error: tokenErr instanceof Error ? tokenErr.message : 'Failed to read token balance from RPC',
      };
    }
  });

  const tokens = await Promise.all(tokenPromises);

  const result: WalletOverview = {
    address,
    isConfigured: true,
    canSign,
    network: 'Sepolia',
    chainId: 11155111,
    nativeBalance: nativeEth,
    tokens,
    latestBlock: connection.latestBlock,
    timestamp: new Date().toISOString(),
    rpcStatus: 'CONNECTED',
    source: 'LIVE_RPC',
  };

  // Cache isolation & eviction if needed
  if (_walletCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = _walletCache.keys().next().value;
    if (firstKey) _walletCache.delete(firstKey);
  }

  _walletCache.set(cacheKey, {
    data: result,
    expiresAt: now + CACHE_TTL_MS,
  });

  return result;
}

/**
 * Test helper: clears the isolated wallet overview cache.
 */
export function _resetWalletCacheForTesting(): void {
  _walletCache.clear();
}
