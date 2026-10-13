import { Address, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getPublicClient, verifySepoliaConnection, getNativeBalance } from './rpc-service';
import { SUPPORTED_TOKENS, TokenInfo } from '../transaction/builder';

export type TokenBalance = {
  symbol: string;
  address: string;
  decimals: number;
  rawBalance: bigint;
  formattedBalance: string;
  error?: string;
};

export type WalletOverview = {
  address: string;
  isConfigured: boolean;
  network: string;
  chainId: number;
  nativeBalance: {
    raw: bigint;
    formatted: string;
    symbol: 'ETH';
  };
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

// In-memory cache for wallet overview (10-second TTL)
let _cachedOverview: { data: WalletOverview; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

/**
 * Resolves the agent's wallet address from private key or environment without exposing the secret.
 */
export function getAgentWalletAddress(): { address: string; isConfigured: boolean } {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    return {
      address: '0x0000000000000000000000000000000000000000',
      isConfigured: false,
    };
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return {
      address: account.address,
      isConfigured: true,
    };
  } catch {
    return {
      address: '0x0000000000000000000000000000000000000000',
      isConfigured: false,
    };
  }
}

/**
 * Reads complete live wallet asset overview (ETH + supported ERC-20 tokens) on Sepolia.
 * Employs a 10-second cache to prevent redundant RPC calls during rapid dashboard renders.
 */
export async function getLiveWalletOverview(options?: {
  forceRefresh?: boolean;
  customRpcUrl?: string;
  customAddress?: string;
}): Promise<WalletOverview> {
  const now = Date.now();

  if (!options?.forceRefresh && _cachedOverview && now < _cachedOverview.expiresAt) {
    return _cachedOverview.data;
  }

  const { address, isConfigured } = options?.customAddress
    ? { address: options.customAddress, isConfigured: true }
    : getAgentWalletAddress();

  if (!isConfigured) {
    const unconfigured: WalletOverview = {
      address,
      isConfigured: false,
      network: 'Sepolia',
      chainId: 11155111,
      nativeBalance: { raw: BigInt(0), formatted: '0.0000', symbol: 'ETH' },
      tokens: Object.values(SUPPORTED_TOKENS).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        rawBalance: BigInt(0),
        formattedBalance: '0.0000',
      })),
      timestamp: new Date().toISOString(),
      rpcStatus: 'NOT_CONFIGURED',
      source: 'UNAVAILABLE',
      error: 'AGENT_PRIVATE_KEY is not configured in .env.local',
    };
    return unconfigured;
  }

  // Check network connectivity and chain ID
  const connection = await verifySepoliaConnection(options?.customRpcUrl);

  if (connection.status !== 'CONNECTED') {
    const rpcUnavailable: WalletOverview = {
      address,
      isConfigured: true,
      network: 'Sepolia',
      chainId: connection.chainId,
      nativeBalance: { raw: BigInt(0), formatted: '0.0000', symbol: 'ETH' },
      tokens: Object.values(SUPPORTED_TOKENS).map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        rawBalance: BigInt(0),
        formattedBalance: '0.0000',
      })),
      timestamp: new Date().toISOString(),
      rpcStatus: connection.status,
      source: 'UNAVAILABLE',
      error: connection.error || 'Sepolia RPC node is currently unreachable.',
    };
    return rpcUnavailable;
  }

  // 1. Fetch native ETH balance
  let nativeEth = { raw: BigInt(0), formatted: '0.0000' };
  try {
    nativeEth = await getNativeBalance(address, options?.customRpcUrl);
  } catch {
    // Native balance read failure handled
  }

  // 2. Fetch supported ERC-20 token balances concurrently
  const client = getPublicClient(options?.customRpcUrl);
  const tokenList: TokenInfo[] = Object.values(SUPPORTED_TOKENS);

  const tokenPromises = tokenList.map(async (token): Promise<TokenBalance> => {
    try {
      const rawBalance = await client.readContract({
        address: token.address as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address as Address],
      });

      const formatted = formatUnits(rawBalance, token.decimals);
      return {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        rawBalance,
        formattedBalance: Number(formatted).toFixed(token.decimals > 6 ? 4 : 2),
      };
    } catch (tokenErr) {
      return {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        rawBalance: BigInt(0),
        formattedBalance: '0.00',
        error: (tokenErr as Error).message,
      };
    }
  });

  const tokens = await Promise.all(tokenPromises);

  const result: WalletOverview = {
    address,
    isConfigured: true,
    network: 'Sepolia',
    chainId: 11155111,
    nativeBalance: {
      raw: nativeEth.raw,
      formatted: nativeEth.formatted,
      symbol: 'ETH',
    },
    tokens,
    latestBlock: connection.latestBlock,
    timestamp: new Date().toISOString(),
    rpcStatus: 'CONNECTED',
    source: 'LIVE_RPC',
  };

  _cachedOverview = {
    data: result,
    expiresAt: now + CACHE_TTL_MS,
  };

  return result;
}

/**
 * Test helper: clears the in-memory wallet overview cache.
 */
export function _resetWalletCacheForTesting(): void {
  _cachedOverview = null;
}
