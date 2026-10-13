import { decodeFunctionData, Address } from 'viem';
import { ParsedIntent, UserPolicy } from '../domain/schemas';
import { parseTokenAmount } from '../utils/financial';
import { TransactionCandidate, ERC20_ABI, MAX_UINT256, SUPPORTED_TOKENS } from '../transaction/builder';

export type PolicyDecision = {
  status: "ALLOW" | "BLOCKED" | "NEEDS_CLARIFICATION";
  reason: string;
  resolvedAddress?: string;
};

/**
 * Deterministic Policy Engine (R5B)
 * Evaluates high-level user intent AND actual compiled EVM TransactionCandidate.
 * Decodes candidate calldata to detect approval amount mismatches and blast radius exploits.
 */
export function evaluatePolicy(
  intent: ParsedIntent,
  candidateOrPolicy: TransactionCandidate | UserPolicy,
  maybePolicy?: UserPolicy
): PolicyDecision {
  const isThreeArgs = maybePolicy !== undefined;
  const policy: UserPolicy = isThreeArgs ? maybePolicy : (candidateOrPolicy as UserPolicy);
  const candidate: TransactionCandidate | undefined = isThreeArgs ? (candidateOrPolicy as TransactionCandidate) : undefined;

  try {
    // 1. Recipient Validation
    const resolvedAddress = policy.trustedContacts[intent.recipientAlias];
    if (!resolvedAddress) {
      return {
        status: "BLOCKED",
        reason: `Unknown recipient alias: ${intent.recipientAlias}`
      };
    }

    // 2. Spending Limits (ETH)
    if (intent.action === "TRANSFER" && intent.asset === "ETH") {
      if (intent.amount === "UNLIMITED") {
        return {
          status: "BLOCKED",
          reason: "UNLIMITED transfers are not permitted",
          resolvedAddress
        };
      }
      
      const intentAmount = parseTokenAmount(intent.amount, 18);
      const maxAmount = parseTokenAmount(policy.maxTransferAmountETH, 18);
      
      if (intentAmount > maxAmount || (candidate && candidate.value > maxAmount)) {
        return {
          status: "BLOCKED",
          reason: `Amount exceeds maximum transfer limit of ${policy.maxTransferAmountETH} ETH`,
          resolvedAddress
        };
      }
    }

    // 3. Approval Blast Radius & Intent Policy Check
    if (intent.action === "APPROVE") {
      if (intent.amount === "UNLIMITED") {
        if (!policy.allowUnlimitedApproval) {
          return {
            status: "BLOCKED",
            reason: "Unlimited approvals are disabled in user policy",
            resolvedAddress
          };
        }
      }
    }

    // 4. EVM Calldata Decoding & Approval Mismatch Detection (Fix VULN-R5-05)
    if (candidate && candidate.data && candidate.data.startsWith("0x095ea7b3")) {
      try {
        const decoded = decodeFunctionData({
          abi: ERC20_ABI,
          data: candidate.data as `0x${string}`
        });

        if (decoded.functionName === 'approve') {
          const [spender, allowance] = decoded.args as [Address, bigint];

          // Check if candidate spender matches resolved address
          if (resolvedAddress.toLowerCase() !== spender.toLowerCase()) {
            return {
              status: "BLOCKED",
              reason: "APPROVAL_RECIPIENT_MISMATCH: Candidate spender does not match recipient alias",
              resolvedAddress
            };
          }

          // Check if unlimited approval is requested in candidate calldata
          const isUnlimitedInCalldata = allowance === MAX_UINT256;

          // If calldata requests UNLIMITED but policy forbids unlimited approvals
          if (isUnlimitedInCalldata && !policy.allowUnlimitedApproval) {
            return {
              status: "BLOCKED",
              reason: "APPROVAL_AMOUNT_MISMATCH: Unlimited approvals are disabled in user policy",
              resolvedAddress
            };
          }

          // If intent was for a finite amount, but candidate calldata requests more (e.g. MAX_UINT256)
          if (intent.amount !== "UNLIMITED") {
            const token = SUPPORTED_TOKENS[intent.asset];
            const tokenDecimals = token ? token.decimals : 18;
            const intendedAmount = parseTokenAmount(intent.amount, tokenDecimals);

            if (allowance > intendedAmount) {
              return {
                status: "BLOCKED",
                reason: "APPROVAL_AMOUNT_MISMATCH: Calldata allowance exceeds intended amount",
                resolvedAddress
              };
            }
          }
        }
      } catch (err) {
        return {
          status: "BLOCKED",
          reason: "APPROVAL_DECODE_ERROR: Failed to decode candidate calldata: " + (err as Error).message,
          resolvedAddress
        };
      }
    }

    return {
      status: "ALLOW",
      reason: "Policy requirements met",
      resolvedAddress
    };
  } catch (error) {
    return {
      status: "BLOCKED",
      reason: "Evaluation error: " + (error as Error).message
    };
  }
}
