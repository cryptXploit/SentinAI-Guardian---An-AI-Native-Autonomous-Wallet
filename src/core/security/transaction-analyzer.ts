import {
  decodeFunctionData,
  parseAbi,
  parseUnits,
  formatUnits,
  isAddressEqual,
  Address,
} from 'viem';
import { ParsedIntent, UserPolicy, findTokenApprovalPolicy } from '../domain/schemas';
import { TransactionCandidate, SUPPORTED_TOKENS, TokenInfo } from '../transaction/builder';

export type FindingSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingCategory =
  | 'INTENT_MISMATCH'
  | 'POLICY_VIOLATION'
  | 'EXPOSURE_RISK'
  | 'SIMULATION'
  | 'CHAIN_SAFETY'
  | 'UNSUPPORTED_OPERATION';

export interface SecurityFinding {
  code: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  source: 'DETERMINISTIC_ANALYZER' | 'POLICY_ENGINE' | 'SIMULATOR';
  affectsExecution: boolean;
}

export type SemanticOperationType =
  | 'NATIVE_TRANSFER'
  | 'ERC20_TRANSFER'
  | 'ERC20_APPROVE'
  | 'UNSUPPORTED_CALL'
  | 'UNKNOWN';

export type SecurityAnalysisStatus =
  | 'POLICY_COMPLIANT'
  | 'BLOCKED'
  | 'SUSPICIOUS'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNSUPPORTED';

export interface DecodedTransactionAction {
  method: string;
  targetContract: string;
  recipientOrSpender: string;
  rawAmount: string;
  formattedAmount: string;
  nativeValueWei: string;
  tokenSymbol: string;
  tokenDecimals?: number;
  isUnlimitedApproval?: boolean;
}

export interface ExpectedTransactionAction {
  action: string;
  asset: string;
  amount: string;
  resolvedRecipient: string;
  rawExpectedAmount?: string;
}

export interface TransactionAnalysisResult {
  status: SecurityAnalysisStatus;
  operationType: SemanticOperationType;
  decodedAction: DecodedTransactionAction;
  expectedAction: ExpectedTransactionAction;
  mismatches: string[];
  findings: SecurityFinding[];
  canExecute: boolean;
  timestamp: string;
}

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const EXACT_MAX_UINT256 = (1n << 256n) - 1n; // 2^256 - 1
export const EXTREMELY_LARGE_FINITE_THRESHOLD = 1n << 255n; // 2^255

/**
 * Deterministically analyzes transaction semantics and compares requested intent
 * against actual compiled EVM transaction payload.
 *
 * Guaranteed Properties:
 * 1. Independent decoding of candidate.data via viem parseAbi.
 * 2. Strict mismatch detection across 10 distinct security vectors.
 * 3. Fail-closed on unsupported calldata or unknown selectors.
 * 4. Pure deterministic logic with zero external AI dependency.
 */
export function analyzeTransaction(params: {
  intent: ParsedIntent;
  resolvedRecipientOrSpender?: string;
  candidate: TransactionCandidate;
  policy: UserPolicy;
  tokenRegistry?: Record<string, TokenInfo>;
  simulationSuccess?: boolean;
  simulationError?: string;
}): TransactionAnalysisResult {
  const {
    intent,
    resolvedRecipientOrSpender = '',
    candidate,
    policy,
    tokenRegistry = SUPPORTED_TOKENS,
    simulationSuccess,
    simulationError,
  } = params;

  const findings: SecurityFinding[] = [];
  const mismatches: string[] = [];

  // 1. Identify token registry info if applicable
  const candidateTarget = candidate.to.toLowerCase();
  const knownTokenByAddress = Object.values(tokenRegistry).find(
    (t) => t.address.toLowerCase() === candidateTarget
  );
  const requestedToken = tokenRegistry[intent.asset.toUpperCase()];

  // 2. Decode EVM calldata & classify operation
  let operationType: SemanticOperationType = 'UNKNOWN';
  let decodedMethod = 'none';
  let decodedRecipientOrSpender = '';
  let decodedRawAmount = 0n;
  let isUnlimited = false;

  const calldata = candidate.data || '0x';

  if (calldata === '0x' || calldata === '') {
    operationType = 'NATIVE_TRANSFER';
    decodedMethod = 'native_transfer';
    decodedRecipientOrSpender = candidate.to;
    decodedRawAmount = candidate.value;
  } else {
    try {
      const decoded = decodeFunctionData({
        abi: ERC20_ABI,
        data: calldata as `0x${string}`,
      });

      if (decoded.functionName === 'transfer') {
        operationType = 'ERC20_TRANSFER';
        decodedMethod = 'transfer(address,uint256)';
        decodedRecipientOrSpender = (decoded.args?.[0] as string) || '';
        decodedRawAmount = (decoded.args?.[1] as bigint) || 0n;
      } else if (decoded.functionName === 'approve') {
        operationType = 'ERC20_APPROVE';
        decodedMethod = 'approve(address,uint256)';
        decodedRecipientOrSpender = (decoded.args?.[0] as string) || '';
        decodedRawAmount = (decoded.args?.[1] as bigint) || 0n;
        isUnlimited = decodedRawAmount === EXACT_MAX_UINT256;
      }
    } catch {
      operationType = 'UNSUPPORTED_CALL';
      decodedMethod = 'unknown_calldata';
    }
  }

  // 3. Format decoded amount for human inspection
  let tokenDecimals = 18;
  let tokenSymbol = 'ETH';

  if (operationType === 'ERC20_TRANSFER' || operationType === 'ERC20_APPROVE') {
    if (knownTokenByAddress) {
      tokenDecimals = knownTokenByAddress.decimals;
      tokenSymbol = knownTokenByAddress.symbol;
    } else if (requestedToken) {
      tokenDecimals = requestedToken.decimals;
      tokenSymbol = requestedToken.symbol;
    }
  }

  let formattedDecodedAmount = '0';
  if (decodedRawAmount === EXACT_MAX_UINT256) {
    formattedDecodedAmount = 'EXACT UNLIMITED (2^256-1)';
  } else if (decodedRawAmount >= EXTREMELY_LARGE_FINITE_THRESHOLD) {
    try {
      formattedDecodedAmount = `${formatUnits(decodedRawAmount, tokenDecimals)} (EXTREMELY LARGE FINITE)`;
    } catch {
      formattedDecodedAmount = `${decodedRawAmount.toString()} (EXTREMELY LARGE FINITE)`;
    }
  } else {
    try {
      formattedDecodedAmount = formatUnits(decodedRawAmount, tokenDecimals);
    } catch {
      formattedDecodedAmount = decodedRawAmount.toString();
    }
  }

  // Calculate expected raw amount from intent
  let expectedRawAmount: bigint | undefined;
  if (intent.amount === 'UNLIMITED') {
    expectedRawAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  } else if (intent.amount && !isNaN(Number(intent.amount))) {
    try {
      expectedRawAmount = parseUnits(intent.amount, tokenDecimals);
    } catch {
      // Amount parse failure
    }
  }

  // --- RULE 8.9: WRONG NETWORK ---
  if (candidate.chainId !== 11155111) {
    mismatches.push('WRONG_CHAIN');
    findings.push({
      code: 'WRONG_CHAIN',
      severity: 'CRITICAL',
      category: 'CHAIN_SAFETY',
      title: 'Unauthorized Blockchain Network',
      explanation: `Transaction targets chainId ${candidate.chainId}, but the autonomous wallet strictly enforces Sepolia Testnet (11155111).`,
      evidence: { targetChainId: candidate.chainId, requiredChainId: 11155111 },
      source: 'DETERMINISTIC_ANALYZER',
      affectsExecution: true,
    });
  }

  // --- RULE 8.10: UNSUPPORTED CALLDATA ---
  if (operationType === 'UNSUPPORTED_CALL' || operationType === 'UNKNOWN') {
    mismatches.push('UNSUPPORTED_CALLDATA');
    findings.push({
      code: 'UNSUPPORTED_CALLDATA',
      severity: 'CRITICAL',
      category: 'UNSUPPORTED_OPERATION',
      title: 'Unsupported Contract Interaction',
      explanation: `Transaction calldata contains an unrecognized function selector. Arbitrary contract interactions fail closed.`,
      evidence: { calldataPrefix: calldata.slice(0, 10) },
      source: 'DETERMINISTIC_ANALYZER',
      affectsExecution: true,
    });
  }

  // --- RULE 8.7: WRONG METHOD / TRANSACTION METHOD MISMATCH ---
  if (intent.action === 'TRANSFER') {
    if (operationType === 'ERC20_APPROVE') {
      mismatches.push('TRANSACTION_METHOD_MISMATCH');
      findings.push({
        code: 'TRANSACTION_METHOD_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Transaction Method Mismatch (Phishing Vector)',
        explanation: `User requested a TRANSFER, but the compiled transaction contains approve() calldata. This pattern is characteristic of approval phishing.`,
        evidence: { requestedAction: 'TRANSFER', compiledMethod: decodedMethod },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    }
  } else if (intent.action === 'APPROVE') {
    if (operationType === 'ERC20_TRANSFER' || operationType === 'NATIVE_TRANSFER') {
      mismatches.push('TRANSACTION_METHOD_MISMATCH');
      findings.push({
        code: 'TRANSACTION_METHOD_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Transaction Method Mismatch',
        explanation: `User requested an APPROVE action, but the compiled transaction executes a direct transfer of funds.`,
        evidence: { requestedAction: 'APPROVE', compiledMethod: decodedMethod },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    }
  }

  // --- RULE 8.8: UNEXPECTED NATIVE VALUE ---
  if (operationType === 'ERC20_TRANSFER' || operationType === 'ERC20_APPROVE') {
    if (candidate.value > 0n) {
      mismatches.push('UNEXPECTED_NATIVE_VALUE');
      findings.push({
        code: 'UNEXPECTED_NATIVE_VALUE',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Unexpected Native ETH Value on Contract Call',
        explanation: `ERC-20 operation includes an unexpected native ETH transfer of ${formatUnits(candidate.value, 18)} ETH.`,
        evidence: { nativeValueWei: candidate.value.toString() },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    }
  }

  // --- RULE 8.2: TOKEN CONTRACT MISMATCH ---
  if (operationType === 'ERC20_TRANSFER' || operationType === 'ERC20_APPROVE') {
    if (!knownTokenByAddress) {
      mismatches.push('TOKEN_CONTRACT_MISMATCH');
      findings.push({
        code: 'TOKEN_CONTRACT_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Unrecognized Token Contract',
        explanation: `Transaction targets contract ${candidate.to}, which is not in the verified Sepolia token registry.`,
        evidence: { targetAddress: candidate.to, requestedAsset: intent.asset },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    } else if (requestedToken && !isAddressEqual(candidate.to as Address, requestedToken.address as Address)) {
      mismatches.push('TOKEN_CONTRACT_MISMATCH');
      findings.push({
        code: 'TOKEN_CONTRACT_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Token Contract Mismatch',
        explanation: `User requested ${intent.asset} (${requestedToken.address}), but compiled transaction targets ${knownTokenByAddress.symbol} (${candidate.to}).`,
        evidence: {
          requestedToken: requestedToken.address,
          actualTarget: candidate.to,
        },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    }
  }

  // --- RULE 8.1 & 8.6: RECIPIENT & SPENDER MISMATCH ---
  if (resolvedRecipientOrSpender && resolvedRecipientOrSpender.startsWith('0x')) {
    let addressMismatch = false;

    if (operationType === 'NATIVE_TRANSFER') {
      try {
        addressMismatch = !isAddressEqual(
          candidate.to as Address,
          resolvedRecipientOrSpender as Address
        );
      } catch {
        addressMismatch = true;
      }

      if (addressMismatch) {
        mismatches.push('RECIPIENT_MISMATCH');
        findings.push({
          code: 'RECIPIENT_MISMATCH',
          severity: 'CRITICAL',
          category: 'INTENT_MISMATCH',
          title: 'Recipient Address Mismatch',
          explanation: `Transaction destination address (${candidate.to}) does not match authorized recipient (${resolvedRecipientOrSpender}).`,
          evidence: {
            expectedRecipient: resolvedRecipientOrSpender,
            actualDestination: candidate.to,
          },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: true,
        });
      }
    } else if (operationType === 'ERC20_TRANSFER') {
      try {
        addressMismatch = !isAddressEqual(
          decodedRecipientOrSpender as Address,
          resolvedRecipientOrSpender as Address
        );
      } catch {
        addressMismatch = true;
      }

      if (addressMismatch) {
        mismatches.push('RECIPIENT_MISMATCH');
        findings.push({
          code: 'RECIPIENT_MISMATCH',
          severity: 'CRITICAL',
          category: 'INTENT_MISMATCH',
          title: 'Token Recipient Address Mismatch',
          explanation: `Decoded ERC-20 transfer recipient (${decodedRecipientOrSpender}) does not match authorized recipient (${resolvedRecipientOrSpender}).`,
          evidence: {
            expectedRecipient: resolvedRecipientOrSpender,
            actualRecipient: decodedRecipientOrSpender,
          },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: true,
        });
      }
    } else if (operationType === 'ERC20_APPROVE') {
      try {
        addressMismatch = !isAddressEqual(
          decodedRecipientOrSpender as Address,
          resolvedRecipientOrSpender as Address
        );
      } catch {
        addressMismatch = true;
      }

      if (addressMismatch) {
        mismatches.push('SPENDER_MISMATCH');
        findings.push({
          code: 'SPENDER_MISMATCH',
          severity: 'CRITICAL',
          category: 'INTENT_MISMATCH',
          title: 'Approval Spender Mismatch',
          explanation: `Decoded approval spender (${decodedRecipientOrSpender}) does not match authorized spender (${resolvedRecipientOrSpender}).`,
          evidence: {
            expectedSpender: resolvedRecipientOrSpender,
            actualSpender: decodedRecipientOrSpender,
          },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: true,
        });
      }
    }
  }

  // --- RULE 8.3: TRANSFER AMOUNT MISMATCH ---
  if (operationType === 'NATIVE_TRANSFER' || operationType === 'ERC20_TRANSFER') {
    if (expectedRawAmount !== undefined && expectedRawAmount !== decodedRawAmount) {
      mismatches.push('TRANSFER_AMOUNT_MISMATCH');
      findings.push({
        code: 'TRANSFER_AMOUNT_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Transfer Amount Mismatch',
        explanation: `Requested transfer amount of ${intent.amount} ${tokenSymbol} does not match actual transaction payload of ${formattedDecodedAmount} ${tokenSymbol}.`,
        evidence: {
          expectedAmountRaw: expectedRawAmount.toString(),
          actualAmountRaw: decodedRawAmount.toString(),
        },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      });
    }
  }

  // --- RULE 8.4: APPROVAL AMOUNT MISMATCH ---
  if (operationType === 'ERC20_APPROVE') {
    if (intent.amount !== 'UNLIMITED' && expectedRawAmount !== undefined) {
      if (expectedRawAmount !== decodedRawAmount) {
        mismatches.push('APPROVAL_AMOUNT_MISMATCH');
        findings.push({
          code: 'APPROVAL_AMOUNT_MISMATCH',
          severity: 'CRITICAL',
          category: 'INTENT_MISMATCH',
          title: 'Approval Amount Mismatch (Excessive Allowance)',
          explanation: `Authorized allowance was ${intent.amount} ${tokenSymbol}, but the compiled contract call requests an allowance of ${formattedDecodedAmount} ${tokenSymbol}.`,
          evidence: {
            expectedAllowanceRaw: expectedRawAmount.toString(),
            requestedAllowanceRaw: decodedRawAmount.toString(),
          },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: true,
        });
      }
    }
  }

  // --- RULE 8.5: UNLIMITED & EXTREMELY LARGE APPROVAL CHECKS ---
  if (operationType === 'ERC20_APPROVE') {
    if (decodedRawAmount === EXACT_MAX_UINT256) {
      if (!policy.allowUnlimitedApproval) {
        mismatches.push('UNLIMITED_APPROVAL_REQUEST');
        findings.push({
          code: 'UNLIMITED_APPROVAL_REQUEST',
          severity: 'HIGH',
          category: 'POLICY_VIOLATION',
          title: 'Unlimited Approval Blocked by Policy',
          explanation: `Transaction requests an exact unlimited allowance (2^256-1) for ${tokenSymbol}, which violates the user risk policy prohibiting unlimited approvals.`,
          evidence: { requestedAllowanceRaw: decodedRawAmount.toString() },
          source: 'POLICY_ENGINE',
          affectsExecution: true,
        });
      } else if (intent.amount !== 'UNLIMITED') {
        mismatches.push('UNLIMITED_APPROVAL_MISMATCH');
        findings.push({
          code: 'UNLIMITED_APPROVAL_MISMATCH',
          severity: 'CRITICAL',
          category: 'INTENT_MISMATCH',
          title: 'Unauthorized Unlimited Approval Request',
          explanation: `User requested a bounded approval of ${intent.amount} ${tokenSymbol}, but transaction calldata requests an exact unlimited (2^256-1) allowance.`,
          evidence: {
            expectedAmount: intent.amount,
            requestedAllowanceRaw: decodedRawAmount.toString(),
          },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: true,
        });
      } else {
        findings.push({
          code: 'UNLIMITED_APPROVAL_REQUEST',
          severity: 'MEDIUM',
          category: 'EXPOSURE_RISK',
          title: 'Unlimited Token Allowance Warning',
          explanation: `This transaction grants the spender complete permission to transfer all current and future ${tokenSymbol} tokens in this wallet.`,
          evidence: { requestedAllowanceRaw: decodedRawAmount.toString() },
          source: 'DETERMINISTIC_ANALYZER',
          affectsExecution: false,
        });
      }
    } else if (decodedRawAmount >= EXTREMELY_LARGE_FINITE_THRESHOLD) {
      findings.push({
        code: 'EXTREMELY_LARGE_FINITE_ALLOWANCE',
        severity: 'HIGH',
        category: 'EXPOSURE_RISK',
        title: 'Extremely Large Finite Allowance Warning',
        explanation: `Transaction requests an extraordinarily large finite allowance of ${formattedDecodedAmount} ${tokenSymbol}. While finite, this represents severe blast radius exposure.`,
        evidence: { requestedAllowanceRaw: decodedRawAmount.toString() },
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: false,
      });
    }
  }

  // --- RULE 8.11: TOKEN-SPECIFIC APPROVAL POLICY ENFORCEMENT ---
  if (operationType === 'ERC20_APPROVE' && policy.tokenApprovalPolicies) {
    const tokenPolicy = findTokenApprovalPolicy(policy, candidate.chainId, candidate.to);
    if (!tokenPolicy) {
      mismatches.push('NO_TOKEN_APPROVAL_POLICY');
      findings.push({
        code: 'NO_TOKEN_APPROVAL_POLICY',
        severity: 'CRITICAL',
        category: 'POLICY_VIOLATION',
        title: 'No Token Approval Policy Configured',
        explanation: `No approval policy exists for token ${candidate.to} on chain ${candidate.chainId}. Unconfigured token approvals fail closed.`,
        evidence: { tokenAddress: candidate.to, chainId: candidate.chainId },
        source: 'POLICY_ENGINE',
        affectsExecution: true,
      });
    } else {
      const isAllowedSpender = tokenPolicy.allowedSpenders.some(
        (s) => s.toLowerCase() === decodedRecipientOrSpender.toLowerCase()
      );
      if (!isAllowedSpender) {
        mismatches.push('UNAUTHORIZED_SPENDER');
        findings.push({
          code: 'UNAUTHORIZED_SPENDER',
          severity: 'CRITICAL',
          category: 'POLICY_VIOLATION',
          title: 'Unauthorized Approval Spender',
          explanation: `Spender ${decodedRecipientOrSpender} is not authorized in token approval policy for ${tokenSymbol}.`,
          evidence: { spender: decodedRecipientOrSpender, allowedSpenders: tokenPolicy.allowedSpenders },
          source: 'POLICY_ENGINE',
          affectsExecution: true,
        });
      }

      const tokenCap = BigInt(tokenPolicy.maxApprovalAmountBaseUnits);
      if (decodedRawAmount === EXACT_MAX_UINT256 && !tokenPolicy.allowUnlimited && !policy.allowUnlimitedApproval) {
        // already handled by Rule 8.5
      } else if (decodedRawAmount > tokenCap) {
        mismatches.push('APPROVAL_POLICY_CAP_EXCEEDED');
        findings.push({
          code: 'APPROVAL_POLICY_CAP_EXCEEDED',
          severity: 'CRITICAL',
          category: 'POLICY_VIOLATION',
          title: 'Token Approval Ceiling Exceeded',
          explanation: `Proposed allowance (${formattedDecodedAmount} ${tokenSymbol}) exceeds token-specific spending ceiling of ${formatUnits(tokenCap, tokenPolicy.tokenDecimals)} ${tokenSymbol}.`,
          evidence: {
            proposedAllowanceRaw: decodedRawAmount.toString(),
            policyCapRaw: tokenCap.toString(),
          },
          source: 'POLICY_ENGINE',
          affectsExecution: true,
        });
      }
    }
  }

  // Simulation checks if provided
  if (simulationSuccess === false) {
    findings.push({
      code: 'SIMULATION_REVERTED',
      severity: 'CRITICAL',
      category: 'SIMULATION',
      title: 'EVM Simulation Failed / Reverted',
      explanation: `Transaction dry-run on Sepolia RPC failed: ${simulationError || 'Contract execution reverted.'}.`,
      evidence: { error: simulationError },
      source: 'SIMULATOR',
      affectsExecution: true,
    });
  }

  // 4. Determine final analysis status & execution eligibility
  const blockingFindings = findings.filter((f) => f.affectsExecution);
  const canExecute = blockingFindings.length === 0;

  let status: SecurityAnalysisStatus = 'POLICY_COMPLIANT';
  if (!canExecute) {
    status = 'BLOCKED';
  } else if (findings.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')) {
    status = 'SUSPICIOUS';
  }

  const decodedAction: DecodedTransactionAction = {
    method: decodedMethod,
    targetContract: candidate.to,
    recipientOrSpender: decodedRecipientOrSpender,
    rawAmount: decodedRawAmount.toString(),
    formattedAmount: formattedDecodedAmount,
    nativeValueWei: candidate.value.toString(),
    tokenSymbol,
    tokenDecimals,
    isUnlimitedApproval: isUnlimited,
  };

  const expectedAction: ExpectedTransactionAction = {
    action: intent.action,
    asset: intent.asset,
    amount: intent.amount,
    resolvedRecipient: resolvedRecipientOrSpender,
    rawExpectedAmount: expectedRawAmount?.toString(),
  };

  return {
    status,
    operationType,
    decodedAction,
    expectedAction,
    mismatches,
    findings,
    canExecute,
    timestamp: new Date().toISOString(),
  };
}
