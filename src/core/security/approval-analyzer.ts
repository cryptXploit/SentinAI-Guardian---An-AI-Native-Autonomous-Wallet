import { formatUnits, parseUnits } from 'viem';
import { TokenInfo, SUPPORTED_TOKENS } from '../transaction/builder';
import { UserPolicy } from '../domain/schemas';

export interface ApprovalExposureAnalysis {
  tokenSymbol: string;
  tokenAddress: string;
  spender: string;
  spenderName?: string;
  currentAllowanceRaw: bigint;
  currentAllowanceFormatted: string;
  proposedAllowanceRaw: bigint;
  proposedAllowanceFormatted: string;
  deltaRaw: bigint;
  deltaFormatted: string;
  isUnlimited: boolean;
  policySpendingCapRaw?: bigint;
  policySpendingCapFormatted?: string;
  exceedsPolicyCap: boolean;
  permissionExplanation: string;
  riskSummary: string;
}

const MAX_UINT256_THRESHOLD = BigInt(
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

/**
 * Analyzes the exposure impact of an ERC-20 approval.
 * Evaluates the proposed allowance relative to current on-chain allowance and policy limits.
 *
 * Emphasizes the fundamental distinction:
 * An allowance is a spending permission granted to a smart contract, NOT an immediate transfer of funds.
 */
export function analyzeApprovalExposure(params: {
  tokenAddress: string;
  spenderAddress: string;
  proposedAllowanceRaw: bigint;
  currentAllowanceRaw?: bigint;
  policy?: UserPolicy;
  tokenRegistry?: Record<string, TokenInfo>;
  knownContacts?: Record<string, string>;
}): ApprovalExposureAnalysis {
  const {
    tokenAddress,
    spenderAddress,
    proposedAllowanceRaw,
    currentAllowanceRaw = 0n,
    policy,
    tokenRegistry = SUPPORTED_TOKENS,
    knownContacts,
  } = params;

  // 1. Identify token information
  const token = Object.values(tokenRegistry).find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  const decimals = token?.decimals ?? 18;
  const tokenSymbol = token?.symbol ?? 'TOKEN';

  // 2. Resolve spender name/alias
  let spenderName: string | undefined;
  if (knownContacts) {
    for (const [alias, addr] of Object.entries(knownContacts)) {
      if (addr.toLowerCase() === spenderAddress.toLowerCase()) {
        spenderName = alias;
        break;
      }
    }
  }

  // 3. Allowance metrics
  const isUnlimited = proposedAllowanceRaw >= MAX_UINT256_THRESHOLD;

  let proposedFormatted = '0';
  if (isUnlimited) {
    proposedFormatted = 'UNLIMITED (2^256-1)';
  } else {
    try {
      proposedFormatted = formatUnits(proposedAllowanceRaw, decimals);
    } catch {
      proposedFormatted = proposedAllowanceRaw.toString();
    }
  }

  let currentFormatted = '0';
  try {
    currentFormatted = formatUnits(currentAllowanceRaw, decimals);
  } catch {
    currentFormatted = currentAllowanceRaw.toString();
  }

  // Delta calculation
  const deltaRaw = proposedAllowanceRaw - currentAllowanceRaw;
  let deltaFormatted = '0';
  if (isUnlimited) {
    deltaFormatted = '+UNLIMITED';
  } else if (deltaRaw >= 0n) {
    deltaFormatted = `+${formatUnits(deltaRaw, decimals)}`;
  } else {
    deltaFormatted = `-${formatUnits(-deltaRaw, decimals)}`;
  }

  // 4. Policy cap comparison (e.g. from maxTransferAmountETH or custom policy cap)
  let policySpendingCapRaw: bigint | undefined;
  let policySpendingCapFormatted: string | undefined;
  let exceedsPolicyCap = false;

  if (policy?.maxTransferAmountETH) {
    try {
      policySpendingCapRaw = parseUnits(policy.maxTransferAmountETH, decimals);
      policySpendingCapFormatted = `${policy.maxTransferAmountETH} ${tokenSymbol}`;
      if (proposedAllowanceRaw > policySpendingCapRaw) {
        exceedsPolicyCap = true;
      }
    } catch {
      // Policy cap parse fallback
    }
  }

  if (isUnlimited && policy && !policy.allowUnlimitedApproval) {
    exceedsPolicyCap = true;
  }

  // 5. Plain-language financial permission explanation
  const spenderDisplay = spenderName ? `${spenderName} (${spenderAddress.slice(0, 8)}...)` : spenderAddress;

  const permissionExplanation = isUnlimited
    ? `You are granting ${spenderDisplay} continuous, permanent permission to withdraw any amount of ${tokenSymbol} from your wallet without requiring any further signature.`
    : `You are authorizing ${spenderDisplay} to withdraw up to ${proposedFormatted} ${tokenSymbol} from your wallet as needed for its protocol interactions. No tokens will leave your wallet until the contract executes a transaction on your behalf.`;

  let riskSummary = 'Normal bounded allowance within standard risk parameters.';
  if (isUnlimited) {
    riskSummary = 'CRITICAL EXPOSURE: Unlimited allowance grants unrestricted token withdrawal rights.';
  } else if (exceedsPolicyCap) {
    riskSummary = `HIGH EXPOSURE: Proposed allowance (${proposedFormatted} ${tokenSymbol}) exceeds configured spending ceiling (${policySpendingCapFormatted}).`;
  } else if (proposedAllowanceRaw > currentAllowanceRaw) {
    riskSummary = `Increasing spender exposure by ${deltaFormatted} ${tokenSymbol}.`;
  } else if (proposedAllowanceRaw < currentAllowanceRaw) {
    riskSummary = `Decreasing existing allowance from ${currentFormatted} to ${proposedFormatted} ${tokenSymbol}.`;
  }

  return {
    tokenSymbol,
    tokenAddress,
    spender: spenderAddress,
    spenderName,
    currentAllowanceRaw,
    currentAllowanceFormatted: currentFormatted,
    proposedAllowanceRaw,
    proposedAllowanceFormatted: proposedFormatted,
    deltaRaw,
    deltaFormatted,
    isUnlimited,
    policySpendingCapRaw,
    policySpendingCapFormatted,
    exceedsPolicyCap,
    permissionExplanation,
    riskSummary,
  };
}
