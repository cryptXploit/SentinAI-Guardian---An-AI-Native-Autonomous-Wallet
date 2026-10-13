import { createWalletClient, createPublicClient, http, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { IntentIntegrityProof } from '../security/iip';

export type ExecutionResult = {
  success: boolean;
  transactionHash?: string;
  error?: string;
  receiptStatus?: string;
};

/**
 * Phase B: Broadcast a signed transaction to the network.
 * Returns the transaction hash immediately without waiting for confirmation.
 * The hash must be persisted BEFORE calling waitForReceipt.
 */
export async function broadcastTransaction(
  iip: IntentIntegrityProof,
  privateKey: string,
  rpcUrl: string
): Promise<{ hash: string }> {
  // CRITICAL SECURITY GATE
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
    throw new Error("UNAUTHORIZED_EXECUTION");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const hash = await walletClient.sendTransaction({
    to: iip.candidate.to as Address,
    value: iip.candidate.value,
    data: (iip.candidate.data as `0x${string}`) || '0x'
  });

  return { hash };
}

/**
 * Phase D: Wait for transaction receipt confirmation.
 * Call ONLY after the hash has been durably persisted.
 * Returns the receipt status or throws on timeout/error.
 */
export async function waitForReceipt(
  hash: string,
  rpcUrl: string
): Promise<{ status: 'success' | 'reverted'; blockNumber: bigint }> {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    timeout: 120_000, // 2 minutes max wait
  });

  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Combined execution for backward compatibility.
 * Broadcasts, then waits for receipt. Returns unified result.
 *
 * WARNING: Crash between broadcast and receipt persistence leaves
 * the transaction in SUBMITTING state. Use broadcastTransaction +
 * recordTxHash + waitForReceipt for crash-safe execution.
 */
export async function executeTransaction(
  iip: IntentIntegrityProof,
  privateKey?: string,
  rpcUrl?: string
): Promise<ExecutionResult> {
  // CRITICAL SECURITY GATE
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
    throw new Error("UNAUTHORIZED_EXECUTION");
  }

  if (!privateKey || !rpcUrl) {
    throw new Error("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");
  }

  try {
    const { hash } = await broadcastTransaction(iip, privateKey, rpcUrl);

    try {
      const receipt = await waitForReceipt(hash, rpcUrl);

      return {
        success: receipt.status === 'success',
        transactionHash: hash,
        receiptStatus: receipt.status
      };
    } catch (receiptError) {
      // Hash exists but receipt failed — transaction may be pending
      return {
        success: false,
        transactionHash: hash,
        error: `RECEIPT_TIMEOUT: ${(receiptError as Error).message}`,
        receiptStatus: 'pending'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
