import { ParsedIntent } from '../domain/schemas';
import { parseTokenAmount } from '../utils/financial';
import { isValidEvmAddress } from '../utils/address';

export type TransactionCandidate = {
  to: string;
  value: bigint;
  data?: string;
  chainId: number;
};

export function buildTransaction(intent: ParsedIntent, resolvedAddress: string): TransactionCandidate {
  if (!resolvedAddress || !isValidEvmAddress(resolvedAddress)) {
    throw new Error("Invalid or missing resolved address");
  }

  if (intent.action === "TRANSFER" && intent.asset === "ETH") {
    if (intent.amount === "UNLIMITED") {
      throw new Error("UNLIMITED amount not supported for ETH transfers");
    }

    const value = parseTokenAmount(intent.amount, 18);

    return {
      to: resolvedAddress,
      value,
      chainId: 11155111
    };
  }

  throw new Error("UNSUPPORTED_OPERATION");
}
