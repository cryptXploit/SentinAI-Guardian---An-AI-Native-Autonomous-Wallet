import { createPublicClient, http, Address } from 'viem';
import { sepolia } from 'viem/chains';
import { TransactionCandidate } from '../transaction/builder';

export type SimulationResult = {
  success: boolean;
  gasEstimated?: bigint;
  revertReason?: string;
  timestamp: string;
};

export async function simulateTransaction(
  candidate: TransactionCandidate,
  rpcUrl?: string
): Promise<SimulationResult> {
  const timestamp = new Date().toISOString();

  if (!rpcUrl) {
    throw new Error("SIMULATION_UNAVAILABLE: Cannot dry-run transaction without RPC URL.");
  }

  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl)
    });

    const gasEstimated = await publicClient.estimateGas({
      to: candidate.to as Address,
      value: candidate.value,
      data: (candidate.data as `0x${string}`) || '0x'
    });

    return {
      success: true,
      gasEstimated,
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      revertReason: (error as Error).message,
      timestamp
    };
  }
}
