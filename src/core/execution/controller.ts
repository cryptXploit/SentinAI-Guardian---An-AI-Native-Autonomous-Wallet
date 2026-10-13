import { createWalletClient, createPublicClient, http, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { IntentIntegrityProof } from '../security/iip';

export type BroadcastOutcome =
  | 'DEFINITELY_NOT_BROADCAST'
  | 'BROADCAST_SUBMITTED'
  | 'BROADCAST_OUTCOME_UNKNOWN'
  | 'RECEIPT_CONFIRMED'
  | 'RECEIPT_REVERTED';

export class BroadcastError extends Error {
  readonly outcome: 'DEFINITELY_NOT_BROADCAST' | 'BROADCAST_OUTCOME_UNKNOWN';
  readonly originalError?: unknown;

  constructor(
    message: string,
    outcome: 'DEFINITELY_NOT_BROADCAST' | 'BROADCAST_OUTCOME_UNKNOWN',
    originalError?: unknown
  ) {
    super(message);
    this.name = 'BroadcastError';
    this.outcome = outcome;
    this.originalError = originalError;
  }
}

export type ExecutionResult = {
  success: boolean;
  transactionHash?: string;
  error?: string;
  receiptStatus?: string;
  broadcastOutcome?: BroadcastOutcome;
};

/**
 * Checks whether an error during broadcast represents an ambiguous network outcome
 * where the signed transaction may already have reached the node or mempool.
 */
export function isAmbiguousBroadcastError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('socket closed') ||
    lower.includes('connection reset') ||
    lower.includes('econnreset') ||
    lower.includes('504') ||
    lower.includes('gateway') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  );
}

/**
 * Phase B: Broadcast a signed transaction to the network.
 * Returns the transaction hash immediately without waiting for confirmation.
 * The hash must be persisted BEFORE calling waitForReceipt.
 *
 * Invariant: Throws BroadcastError distinguishing DEFINITELY_NOT_BROADCAST
 * from BROADCAST_OUTCOME_UNKNOWN.
 */
export async function broadcastTransaction(
  iip: IntentIntegrityProof,
  privateKey: string,
  rpcUrl: string
): Promise<{ hash: string; outcome: 'BROADCAST_SUBMITTED' }> {
  // CRITICAL SECURITY GATE: Invariant checking before signing
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
    throw new BroadcastError("UNAUTHORIZED_EXECUTION: Intent Integrity Proof prohibits execution.", 'DEFINITELY_NOT_BROADCAST');
  }

  if (!privateKey || !rpcUrl) {
    throw new BroadcastError("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.", 'DEFINITELY_NOT_BROADCAST');
  }

  let account;
  try {
    account = privateKeyToAccount(privateKey as `0x${string}`);
  } catch (keyErr) {
    throw new BroadcastError(
      `INVALID_KEY: Failed to parse signing private key: ${(keyErr as Error).message}`,
      'DEFINITELY_NOT_BROADCAST',
      keyErr
    );
  }

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl)
  });

  try {
    const hash = await walletClient.sendTransaction({
      to: iip.candidate.to as Address,
      value: iip.candidate.value,
      data: (iip.candidate.data as `0x${string}`) || '0x'
    });

    return { hash, outcome: 'BROADCAST_SUBMITTED' };
  } catch (error: unknown) {
    if (isAmbiguousBroadcastError(error)) {
      throw new BroadcastError(
        `AMBIGUOUS_NETWORK_TIMEOUT: Request timed out or network disconnected during transaction broadcast. ` +
        `The transaction may have reached the node or mempool. Automatic replay is strictly forbidden. ` +
        `Error: ${(error as Error).message}`,
        'BROADCAST_OUTCOME_UNKNOWN',
        error
      );
    }

    throw new BroadcastError(
      `DEFINITELY_NOT_BROADCAST: ${(error as Error).message}`,
      'DEFINITELY_NOT_BROADCAST',
      error
    );
  }
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
        receiptStatus: receipt.status,
        broadcastOutcome: receipt.status === 'success' ? 'RECEIPT_CONFIRMED' : 'RECEIPT_REVERTED',
      };
    } catch (receiptError) {
      // Hash exists but receipt failed — transaction may be pending
      return {
        success: false,
        transactionHash: hash,
        error: `RECEIPT_TIMEOUT: ${(receiptError as Error).message}`,
        receiptStatus: 'pending',
        broadcastOutcome: 'BROADCAST_SUBMITTED',
      };
    }
  } catch (error: unknown) {
    const outcome = error instanceof BroadcastError ? error.outcome : 'DEFINITELY_NOT_BROADCAST';
    return {
      success: false,
      error: (error as Error).message,
      broadcastOutcome: outcome,
    };
  }
}
