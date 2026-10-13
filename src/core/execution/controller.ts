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
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(rpcUrl)
    });

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl)
    });

    const hash = await walletClient.sendTransaction({
      to: iip.candidate.to as Address,
      value: iip.candidate.value,
      data: (iip.candidate.data as `0x${string}`) || '0x'
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      success: receipt.status === 'success',
      transactionHash: hash,
      receiptStatus: receipt.status
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
