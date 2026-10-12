import { ParsedIntent, UserPolicy } from '../domain/schemas';
import { parseTokenAmount } from '../utils/financial';

export type PolicyDecision = {
  status: "ALLOW" | "BLOCKED" | "NEEDS_CLARIFICATION";
  reason: string;
  resolvedAddress?: string;
};

export function evaluatePolicy(intent: ParsedIntent, policy: UserPolicy): PolicyDecision {
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
      
      if (intentAmount > maxAmount) {
        return {
          status: "BLOCKED",
          reason: `Amount exceeds maximum transfer limit of ${policy.maxTransferAmountETH} ETH`,
          resolvedAddress
        };
      }
    }

    // 3. Approval Blast Radius
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
