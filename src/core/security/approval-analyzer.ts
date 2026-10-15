import { formatUnits } from 'viem';
import { TokenInfo, SUPPORTED_TOKENS } from '../transaction/builder';
import { UserPolicy, findTokenApprovalPolicy } from '../domain/schemas';
import { AllowanceReadStatus } from '../web3/wallet-service';

export type { AllowanceReadStatus };

export const EXACT_MAX_UINT256 = (1n << 256n) - 1n; // 2^256 - 1
export const EXTREMELY_LARGE_FINITE_THRESHOLD = 1n << 255n; // 2^255

export type AllowanceClassification =
  | 'EXACT_UNLIMITED_ALLOWANCE'
  | 'EXTREMELY_LARGE_FINITE_ALLOWANCE'
  | 'BOUNDED_ALLOWANCE';

export function classifyAllowance(allowanceRaw: bigint): AllowanceClassification {
  if (allowanceRaw === EXACT_MAX_UINT256) {
    return 'EXACT_UNLIMITED_ALLOWANCE';
  }
  if (allowanceRaw >= EXTREMELY_LARGE_FINITE_THRESHOLD) {
    return 'EXTREMELY_LARGE_FINITE_ALLOWANCE';
  }
  return 'BOUNDED_ALLOWANCE';
}

export interface ApprovalExposureAnalysis {
  tokenSymbol: string;
  tokenAddress: string;
  spender: string;
  spenderName?: string;
  allowanceStatus: AllowanceReadStatus;
  allowanceError?: string;
  currentAllowanceRaw?: bigint;
  currentAllowanceFormatted: string;
  proposedAllowanceRaw: bigint;
  proposedAllowanceFormatted: string;
  deltaRaw?: bigint;
  deltaFormatted: string;
  isUnlimited: boolean;
  classification: AllowanceClassification;
  policySpendingCapRaw?: bigint;
  policySpendingCapFormatted?: string;
  hasTokenPolicy: boolean;
  isSpenderAllowed: boolean;
  exceedsPolicyCap: boolean;
  permissionExplanation: string;
  riskSummary: string;
}

/**
 * Analyzes the exposure impact of an ERC-20 approval with exact uint256 classification,
 * token-specific approval policy enforcement, and truthful on-chain allowance provenance (CSF-03 Fix).
 *
 * Guaranteed Properties:
 * 1. Exact MaxUint256 (2^256-1) is distinguished from extremely large finite allowances (>= 2^255).
 * 2. Native ETH transfer limits are NEVER reused as ERC-20 approval caps.
 * 3. Token policies are identified by (chainId, contractAddress) with token-specific base units.
 * 4. Missing token policy fails closed by default.
 * 5. Unknown, RPC-failed, or unsupported allowances are NEVER presented as verified zero (0n).
 */
export function analyzeApprovalExposure(params: {
  tokenAddress: string;
  spenderAddress: string;
  proposedAllowanceRaw: bigint;
  currentAllowanceRaw?: bigint;
  allowanceStatus?: AllowanceReadStatus;
  allowanceError?: string;
  chainId?: number;
  policy?: UserPolicy;
  tokenRegistry?: Record<string, TokenInfo>;
  knownContacts?: Record<string, string>;
}): ApprovalExposureAnalysis {
  const {
    tokenAddress,
    spenderAddress,
    proposedAllowanceRaw,
    currentAllowanceRaw,
    allowanceStatus,
    allowanceError,
    chainId = 11155111,
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

  // Determine truthful allowance read status (never fabricate 0n when unverified)
  let effectiveAllowanceStatus: AllowanceReadStatus;
  if (allowanceStatus) {
    effectiveAllowanceStatus = allowanceStatus;
  } else if (!token) {
    effectiveAllowanceStatus = 'UNSUPPORTED_TOKEN';
  } else if (currentAllowanceRaw !== undefined) {
    effectiveAllowanceStatus = 'REAL_ALLOWANCE';
  } else {
    effectiveAllowanceStatus = 'UNKNOWN_ALLOWANCE';
  }

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

  // 3. Exact allowance classification
  const classification = classifyAllowance(proposedAllowanceRaw);
  const isUnlimited = classification === 'EXACT_UNLIMITED_ALLOWANCE';

  let proposedFormatted = '0';
  if (classification === 'EXACT_UNLIMITED_ALLOWANCE') {
    proposedFormatted = 'EXACT UNLIMITED (2^256-1)';
  } else if (classification === 'EXTREMELY_LARGE_FINITE_ALLOWANCE') {
    try {
      proposedFormatted = `${formatUnits(proposedAllowanceRaw, decimals)} (EXTREMELY LARGE FINITE)`;
    } catch {
      proposedFormatted = `${proposedAllowanceRaw.toString()} (EXTREMELY LARGE FINITE)`;
    }
  } else {
    try {
      proposedFormatted = formatUnits(proposedAllowanceRaw, decimals);
    } catch {
      proposedFormatted = proposedAllowanceRaw.toString();
    }
  }

  let currentFormatted: string;
  let deltaRaw: bigint | undefined;
  let deltaFormatted: string;

  if (effectiveAllowanceStatus === 'REAL_ALLOWANCE' && currentAllowanceRaw !== undefined) {
    try {
      currentFormatted = formatUnits(currentAllowanceRaw, decimals);
    } catch {
      currentFormatted = currentAllowanceRaw.toString();
    }

    deltaRaw = proposedAllowanceRaw - currentAllowanceRaw;
    if (classification === 'EXACT_UNLIMITED_ALLOWANCE') {
      deltaFormatted = '+UNLIMITED';
    } else if (deltaRaw >= 0n) {
      try {
        deltaFormatted = `+${formatUnits(deltaRaw, decimals)}`;
      } catch {
        deltaFormatted = `+${deltaRaw.toString()}`;
      }
    } else {
      try {
        deltaFormatted = `-${formatUnits(-deltaRaw, decimals)}`;
      } catch {
        deltaFormatted = `-${(-deltaRaw).toString()}`;
      }
    }
  } else {
    // CSF-03 Invariant: Never present unknown, RPC-failed, or unsupported allowance as verified zero
    if (effectiveAllowanceStatus === 'RPC_FAILURE') {
      currentFormatted = 'Unavailable (RPC Error)';
    } else if (effectiveAllowanceStatus === 'UNSUPPORTED_TOKEN') {
      currentFormatted = 'Unsupported Token';
    } else {
      currentFormatted = 'Unknown (Unverified)';
    }

    deltaRaw = undefined;
    deltaFormatted =
      classification === 'EXACT_UNLIMITED_ALLOWANCE'
        ? '+UNLIMITED'
        : 'Unknown (Allowance Unverified)';
  }

  // 4. Token-Specific Policy Evaluation (NEVER reuse maxTransferAmountETH)
  let policySpendingCapRaw: bigint | undefined;
  let policySpendingCapFormatted: string | undefined;
  let hasTokenPolicy = false;
  let isSpenderAllowed = false;
  let exceedsPolicyCap = false;

  const tokenPolicy = policy ? findTokenApprovalPolicy(policy, chainId, tokenAddress) : undefined;

  if (tokenPolicy) {
    hasTokenPolicy = true;
    policySpendingCapRaw = BigInt(tokenPolicy.maxApprovalAmountBaseUnits);
    try {
      policySpendingCapFormatted = `${formatUnits(policySpendingCapRaw, tokenPolicy.tokenDecimals)} ${tokenSymbol}`;
    } catch {
      policySpendingCapFormatted = `${policySpendingCapRaw.toString()} base units`;
    }

    // Check spender authorization
    isSpenderAllowed = tokenPolicy.allowedSpenders.some(
      (addr) => addr.toLowerCase() === spenderAddress.toLowerCase()
    );
    if (!isSpenderAllowed) {
      exceedsPolicyCap = true;
    }

    // Check amount against token approval cap
    if (classification === 'EXACT_UNLIMITED_ALLOWANCE') {
      if (!tokenPolicy.allowUnlimited && !(policy && policy.allowUnlimitedApproval)) {
        exceedsPolicyCap = true;
      }
    } else if (proposedAllowanceRaw > policySpendingCapRaw) {
      exceedsPolicyCap = true;
    }
  } else if (policy) {
    // Documented fail-closed behavior: If token approval policy is missing,
    // do NOT invent one using maxTransferAmountETH. Fail closed.
    hasTokenPolicy = false;
    isSpenderAllowed = false;
    exceedsPolicyCap = true;
    policySpendingCapFormatted = 'No token approval policy configured (Fail-Closed)';
  }

  // 5. Plain-language financial permission explanation
  const spenderDisplay = spenderName ? `${spenderName} (${spenderAddress.slice(0, 8)}...)` : spenderAddress;

  let permissionExplanation: string;
  if (classification === 'EXACT_UNLIMITED_ALLOWANCE') {
    permissionExplanation = `You are granting ${spenderDisplay} continuous, permanent permission to withdraw any amount of ${tokenSymbol} (exact 2^256-1) from your wallet without requiring any further signature.`;
  } else if (classification === 'EXTREMELY_LARGE_FINITE_ALLOWANCE') {
    permissionExplanation = `You are authorizing ${spenderDisplay} to withdraw an extraordinarily large finite allowance of ${proposedFormatted} ${tokenSymbol}. While mathematically finite, this exposure severely exceeds normal operating limits.`;
  } else {
    permissionExplanation = `You are authorizing ${spenderDisplay} to withdraw up to ${proposedFormatted} ${tokenSymbol} from your wallet as needed for its protocol interactions. No tokens will leave your wallet until the contract executes a transaction on your behalf.`;
  }

  let riskSummary = 'Normal bounded allowance within standard risk parameters.';
  if (!hasTokenPolicy && policy) {
    riskSummary = `POLICY MISSING: No approval policy configured for ${tokenSymbol} on Sepolia. Approvals fail closed by default.`;
  } else if (!isSpenderAllowed && hasTokenPolicy) {
    riskSummary = `UNAUTHORIZED SPENDER: Spender (${spenderAddress}) is not on the approved spender list for ${tokenSymbol}.`;
  } else if (classification === 'EXACT_UNLIMITED_ALLOWANCE') {
    riskSummary = exceedsPolicyCap
      ? 'CRITICAL EXPOSURE: Exact unlimited allowance (2^256-1) violates policy prohibiting unlimited approvals.'
      : 'CRITICAL EXPOSURE: Exact unlimited allowance grants unrestricted token withdrawal rights.';
  } else if (classification === 'EXTREMELY_LARGE_FINITE_ALLOWANCE') {
    riskSummary = `HIGH EXPOSURE: Extremely large finite allowance (${proposedFormatted}) exceeds standard risk parameters.`;
  } else if (exceedsPolicyCap) {
    riskSummary = `HIGH EXPOSURE: Proposed allowance (${proposedFormatted} ${tokenSymbol}) exceeds configured token ceiling (${policySpendingCapFormatted}).`;
  } else if (effectiveAllowanceStatus === 'REAL_ALLOWANCE' && currentAllowanceRaw !== undefined) {
    if (proposedAllowanceRaw > currentAllowanceRaw) {
      riskSummary = `Increasing spender exposure by ${deltaFormatted} ${tokenSymbol}.`;
    } else if (proposedAllowanceRaw < currentAllowanceRaw) {
      riskSummary = `Decreasing existing allowance from ${currentFormatted} to ${proposedFormatted} ${tokenSymbol}.`;
    }
  } else if (effectiveAllowanceStatus === 'RPC_FAILURE') {
    riskSummary = `Current on-chain allowance could not be verified due to RPC error (${allowanceError || 'unreachable'}). Proposed bounded allowance is ${proposedFormatted} ${tokenSymbol}.`;
  } else if (effectiveAllowanceStatus === 'UNSUPPORTED_TOKEN') {
    riskSummary = `UNSUPPORTED TOKEN: Contract ${tokenAddress} is not a supported Sepolia token.`;
  }

  return {
    tokenSymbol,
    tokenAddress,
    spender: spenderAddress,
    spenderName,
    allowanceStatus: effectiveAllowanceStatus,
    allowanceError,
    currentAllowanceRaw: effectiveAllowanceStatus === 'REAL_ALLOWANCE' ? currentAllowanceRaw : undefined,
    currentAllowanceFormatted: currentFormatted,
    proposedAllowanceRaw,
    proposedAllowanceFormatted: proposedFormatted,
    deltaRaw,
    deltaFormatted,
    isUnlimited,
    classification,
    policySpendingCapRaw,
    policySpendingCapFormatted,
    hasTokenPolicy,
    isSpenderAllowed,
    exceedsPolicyCap,
    permissionExplanation,
    riskSummary,
  };
}
