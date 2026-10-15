import { decodeFunctionData, Address } from 'viem';
import { ParsedIntent, UserPolicy, findTokenApprovalPolicy } from '../domain/schemas';
import { parseTokenAmount } from '../utils/financial';
import { TransactionCandidate, ERC20_ABI, MAX_UINT256, SUPPORTED_TOKENS } from '../transaction/builder';
import { resolveRecipientFromPolicy } from './user-policy';

export type PolicyDecision = {
  status: "ALLOW" | "BLOCKED" | "NEEDS_CLARIFICATION";
  reason: string;
  resolvedAddress?: string;
};

/**
 * Deterministic Policy Engine (R5B / R7.1)
 * Evaluates high-level user intent AND actual compiled EVM TransactionCandidate.
 * Enforces:
 * 1. Trusted contact address resolution
 * 2. Native ETH transfer caps (never applied to ERC-20 tokens)
 * 3. Token-specific approval policies (distinct allowance ceilings and allowed spenders per token)
 * 4. EVM calldata decoding and intent-vs-calldata mismatch detection
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
    // 1. Recipient Validation (Case-insensitive, disambiguated, and whitelisted 0x support)
    const resolution = resolveRecipientFromPolicy(intent.recipientAlias, policy);
    if (resolution.status !== 'RESOLVED') {
      return {
        status: "BLOCKED",
        reason: resolution.reason
      };
    }
    const resolvedAddress = resolution.address;

    // 2. Spending Limits (Native ETH ONLY)
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

    // 4. EVM Calldata Decoding & Approval Mismatch Detection
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

          // Token-Specific Policy Check (if configured in user policy)
          if (policy.tokenApprovalPolicies) {
            const tokenPolicy = findTokenApprovalPolicy(policy, candidate.chainId, candidate.to);
            if (!tokenPolicy) {
              return {
                status: "BLOCKED",
                reason: `NO_TOKEN_APPROVAL_POLICY: No approval policy configured for token ${candidate.to} on chain ${candidate.chainId}. Approvals fail closed by default.`,
                resolvedAddress
              };
            }

            const isAllowedSpender = tokenPolicy.allowedSpenders.some(
              (s) => s.toLowerCase() === spender.toLowerCase()
            );
            if (!isAllowedSpender) {
              return {
                status: "BLOCKED",
                reason: `UNAUTHORIZED_SPENDER: Spender ${spender} is not authorized in token approval policy for ${candidate.to}.`,
                resolvedAddress
              };
            }

            const tokenCap = BigInt(tokenPolicy.maxApprovalAmountBaseUnits);
            if (allowance === MAX_UINT256 && !tokenPolicy.allowUnlimited && !policy.allowUnlimitedApproval) {
              return {
                status: "BLOCKED",
                reason: `UNLIMITED_APPROVAL_DISALLOWED: Unlimited approvals are prohibited for token ${candidate.to}.`,
                resolvedAddress
              };
            }
            if (allowance > tokenCap) {
              return {
                status: "BLOCKED",
                reason: `APPROVAL_POLICY_CAP_EXCEEDED: Requested allowance of ${allowance} base units exceeds token policy cap of ${tokenPolicy.maxApprovalAmountBaseUnits}.`,
                resolvedAddress
              };
            }
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
