import { createPublicClient, http, PublicClient, Address, formatEther, TransactionReceipt } from 'viem';
import { sepolia } from 'viem/chains';

export const EXPECTED_CHAIN_ID = 11155111;
export const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export type RpcConnectionStatus = {
  network: 'Sepolia';
  chainId: number;
  status: 'CONNECTED' | 'UNAVAILABLE' | 'WRONG_CHAIN' | 'NOT_CONFIGURED';
  latestBlock?: bigint;
  timestamp: string;
  rpcUrl: string;
  error?: string;
};

/**
 * Returns a configured Viem PublicClient for Sepolia testnet.
 */
export function getPublicClient(customRpcUrl?: string): PublicClient {
  const rpcUrl = customRpcUrl || process.env.RPC_URL || DEFAULT_SEPOLIA_RPC;
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 8_000 }),
  });
}

/**
 * Verifies RPC connectivity and asserts that the connected node is genuinely Ethereum Sepolia (11155111).
 * Fails closed if the provider is offline, unreachable, or connected to any other chain (e.g. mainnet).
 */
export async function verifySepoliaConnection(customRpcUrl?: string): Promise<RpcConnectionStatus> {
  const rpcUrl = customRpcUrl || process.env.RPC_URL || DEFAULT_SEPOLIA_RPC;

  try {
    const client = getPublicClient(rpcUrl);

    // Verify real chain ID from RPC
    const actualChainId = await client.getChainId();

    if (actualChainId !== EXPECTED_CHAIN_ID) {
      return {
        network: 'Sepolia',
        chainId: actualChainId,
        status: 'WRONG_CHAIN',
        timestamp: new Date().toISOString(),
        rpcUrl,
        error: `WRONG_CHAIN: Expected Sepolia (${EXPECTED_CHAIN_ID}) but RPC reported chain ID ${actualChainId}. Fallback to non-Sepolia network is strictly forbidden.`,
      };
    }

    const latestBlock = await client.getBlockNumber();

    return {
      network: 'Sepolia',
      chainId: EXPECTED_CHAIN_ID,
      status: 'CONNECTED',
      latestBlock,
      timestamp: new Date().toISOString(),
      rpcUrl,
    };
  } catch (error) {
    return {
      network: 'Sepolia',
      chainId: EXPECTED_CHAIN_ID,
      status: 'UNAVAILABLE',
      timestamp: new Date().toISOString(),
      rpcUrl,
      error: `RPC_UNAVAILABLE: ${(error as Error).message}`,
    };
  }
}

/**
 * Reads native ETH balance for a given EVM address.
 */
export async function getNativeBalance(address: string, customRpcUrl?: string): Promise<{ raw: bigint; formatted: string }> {
  const client = getPublicClient(customRpcUrl);
  const raw = await client.getBalance({ address: address as Address });
  return {
    raw,
    formatted: Number(formatEther(raw)).toFixed(4),
  };
}

/**
 * Reads transaction receipt for a given hash. Returns null if not yet mined.
 */
export async function getTransactionReceipt(
  hash: string,
  customRpcUrl?: string
): Promise<TransactionReceipt | null> {
  try {
    const client = getPublicClient(customRpcUrl);
    return await client.getTransactionReceipt({ hash: hash as `0x${string}` });
  } catch {
    return null;
  }
}
