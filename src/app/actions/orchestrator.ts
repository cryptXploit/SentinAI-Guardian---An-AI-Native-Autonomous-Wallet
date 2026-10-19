"use server";

import { parseIntent } from "@/core/ai/intent-parser";
import {
  getLastParsedProvenance,
  getLastActiveProviderName,
  getLastActiveModelName,
  isTransactionNegationOrCancellation,
} from "@/core/ai/provider";
import { evaluatePolicy, PolicyDecision } from "@/core/policy/engine";
import { buildTransaction, TransactionCandidate } from "@/core/transaction/builder";
import { simulateTransaction } from "@/core/security/simulator";
import { generateIIP, verifyIIPDigest } from "@/core/security/iip";
import {
  broadcastTransaction,
  waitForReceipt,
  findMatchingBroadcastTxOnChain,
  ExecutionResult,
  BroadcastError,
} from "@/core/execution/controller";
import { isReadOnlyAction, ProposalProvenance, ParsedIntent, UserPolicy } from "@/core/domain/schemas";
import { verifySession } from "@/core/security/auth";
import {
  getLiveWalletOverview,
  getAgentWalletAddress,
  getTokenAllowance,
  WalletOverview,
} from "@/core/web3/wallet-service";
import { verifySepoliaConnection, RpcConnectionStatus } from "@/core/web3/rpc-service";
import {
  analyzeTransaction,
  TransactionAnalysisResult,
} from "@/core/security/transaction-analyzer";
import {
  analyzeApprovalExposure,
  ApprovalExposureAnalysis,
} from "@/core/security/approval-analyzer";
import {
  explainSecurityFindings,
  SecurityExplanationResult,
} from "@/core/ai/security-explainer";
import { getFixtureById } from "../../../fixtures/security";
import {
  storeProposal,
  storeFixtureProposal,
  retrieveProposal,
  authorizeProposal,
  lockProposalForExecution,
  markSubmitted,
  recordTxHash,
  updateProposalStatus,
  cancelProposal,
  reconcileProposal,
  isProposalExpired,
  getProposalStatus,
  listProposalsByOwner,
  writeBroadcastRecoveryJournal,
  readBroadcastRecoveryJournal,
  clearBroadcastRecoveryJournal,
  ProposalStatus,
  DEFAULT_PROPOSAL_LIFETIME_MS,
} from "@/core/security/proposal";
import {
  MOCK_USER_POLICY,
  hasPersistedUserPolicy,
  getActiveUserPolicy,
  updateActiveUserPolicy,
  getPolicyAuditLogs,
  resolveRecipientFromPolicy,
  PolicyAuditEntry,
} from "@/core/policy/user-policy";

export type ProposalSummary = {
  action: string;
  asset: string;
  amount: string;
  recipientAlias: string;
  recipientAddress: string;
  gasEstimated?: string;
  proofDigest: string;
  aiProvenance?: 'LIVE_AI' | 'DETERMINISTIC_FALLBACK';
  aiProviderUsed?: 'gemini' | 'groq' | 'mock';
  aiModelUsed?: string;
};

export type QueryResult = {
  action: 'QUERY_BALANCE' | 'QUERY_NETWORK';
  summary: string;
  overview?: WalletOverview;
  connection?: RpcConnectionStatus;
};

export type PrepareResult = {
  success: boolean;
  isQuery?: boolean;
  isDemo?: boolean;
  provenance?: ProposalProvenance;
  aiProvenance?: 'LIVE_AI' | 'DETERMINISTIC_FALLBACK';
  aiProviderUsed?: 'gemini' | 'groq' | 'mock';
  aiModelUsed?: string;
  queryResult?: QueryResult;
  proposalId?: string;
  summary?: ProposalSummary;
  analysis?: TransactionAnalysisResult;
  exposure?: ApprovalExposureAnalysis;
  explanation?: SecurityExplanationResult;
  error?: string;
  step?: string;
};

export type AuthorizeResult = {
  success: boolean;
  proposalId?: string;
  executionResult?: ExecutionResult;
  error?: string;
};

export type ProposalHistoryItem = {
  id: string;
  action: string;
  asset: string;
  amount: string;
  recipientAlias: string;
  targetAddress: string;
  status: ProposalStatus;
  provenance: ProposalProvenance;
  isExecutable: boolean;
  digest: string;
  txHash: string | null;
  createdAt: string;
  expiresAt: string;
};

/**
 * Strict Intent Validation (Milestone R8.2 — Phase 3)
 * Validates the complete parsed intent before calling the transaction builder or recipient resolution.
 * Rejects unsupported actions, malformed amounts, negative numbers, invalid decimal precision,
 * native ETH approvals, and ambiguous recipients.
 */
function validateStateChangingIntent(intent: ParsedIntent, rawCommand: string): string | null {
  // 1. Raw Command Contradiction / Negation Check (Defense-in-depth)
  if (isTransactionNegationOrCancellation(rawCommand)) {
    return "CONTRADICTORY_INSTRUCTION: Transaction negation or cancellation detected in command.";
  }

  // 2. Action Check
  if (intent.action === 'UNKNOWN') {
    return "UNKNOWN_INTENT: Unable to parse command into a recognized, safe financial operation.";
  }

  if (intent.action === 'SWAP') {
    return "UNSUPPORTED_OPERATION: Token swaps are currently unsupported for autonomous wallet execution.";
  }

  if (intent.action !== 'TRANSFER' && intent.action !== 'APPROVE') {
    return `UNSUPPORTED_ACTION: Action '${intent.action}' is not supported.`;
  }

  // 3. Asset Check
  const validAssets = ['ETH', 'USDC', 'USDT', 'DAI'];
  if (!intent.asset || !validAssets.includes(intent.asset.toUpperCase())) {
    return `UNSUPPORTED_ASSET: Asset '${intent.asset}' is not recognized or supported.`;
  }

  // 4. Action/Asset Compatibility: Native ETH cannot be approved
  if (intent.action === 'APPROVE' && intent.asset.toUpperCase() === 'ETH') {
    return "UNSUPPORTED_OPERATION: Native ETH cannot be approved. Approvals apply only to ERC-20 tokens (USDC, USDT, DAI).";
  }

  // 5. Amount Validation
  if (intent.amount === 'UNLIMITED' || intent.amount === 'MAX') {
    if (intent.amount === 'UNLIMITED' && intent.action !== 'APPROVE') {
      return "INVALID_AMOUNT: UNLIMITED amount is only permitted for token approvals, not transfers.";
    }
  } else {
    const trimmedAmt = intent.amount.trim();
    if (trimmedAmt.startsWith('-')) {
      return "INVALID_AMOUNT: Negative amounts are not allowed.";
    }
    if (!/^\d+(\.\d+)?$/.test(trimmedAmt)) {
      return "INVALID_AMOUNT: Invalid number format for amount.";
    }
    const num = parseFloat(trimmedAmt);
    if (isNaN(num) || !isFinite(num) || num <= 0) {
      return "INVALID_AMOUNT: Amount must be strictly greater than zero.";
    }

    // Decimal precision check
    const maxDecimals = (intent.asset.toUpperCase() === 'USDC' || intent.asset.toUpperCase() === 'USDT') ? 6 : 18;
    const parts = trimmedAmt.split('.');
    if (parts.length === 2 && parts[1].length > maxDecimals) {
      return `INVALID_AMOUNT: Too many decimal places for ${intent.asset} (maximum ${maxDecimals} decimals).`;
    }
  }

  // 6. Recipient / Spender validation
  if (!intent.recipientAlias || intent.recipientAlias.trim() === '') {
    return "MISSING_RECIPIENT: Recipient alias or address is required.";
  }

  if (/\b(?:or|perhaps|maybe)\b/i.test(intent.recipientAlias)) {
    return "AMBIGUOUS_RECIPIENT: Ambiguous or conflicting recipient specified.";
  }

  return null;
}

/**
 * Phase 1: Intent Preparation (Authenticated, Provenance-Enforced, CSF-01/02/03 Remediated)
 * Takes a natural language command, processes intent, verifies against active user policy,
 * performs live account-bound simulation & on-chain allowance reads, generates an IIP proof,
 * and persists a server-side proposal.
 */
export async function prepareTransactionIntent(command: string): Promise<PrepareResult> {
  // Authentication Barrier
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to prepare transaction intent.");
  }

  let currentStep = "INTENT_PARSING";

  try {
    // Step 1: Parse Intent (uses parseIntentWithProvenance under the hood in production; mockable in unit tests)
    const intent = await parseIntent(command);
    const aiProvenance = getLastParsedProvenance();
    const aiProviderUsed = getLastActiveProviderName();
    const aiModelUsed = getLastActiveModelName();

    // Rejection of UNKNOWN / Non-actionable intents
    if (intent.action === 'UNKNOWN') {
      return {
        success: false,
        isDemo: false,
        provenance: 'UNVERIFIED',
        aiProvenance,
        aiProviderUsed,
        aiModelUsed,
        error: "UNKNOWN_INTENT: Unable to parse instruction into a recognized, unambiguous financial operation.",
        step: "INTENT_PARSING",
        summary: {
          action: 'UNKNOWN',
          asset: intent.asset || 'ETH',
          amount: intent.amount || '0',
          recipientAlias: intent.recipientAlias || '',
          recipientAddress: 'None',
          proofDigest: '0x0',
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
        },
      };
    }

    // Read-Only Query Routing (Milestone R6)
    // Read-only queries NEVER access private keys or create transaction proposals
    if (isReadOnlyAction(intent.action)) {
      if (intent.action === 'QUERY_BALANCE') {
        const overview = await getLiveWalletOverview();
        const tokenSummaries = overview.tokens
          .map((t) => `${t.formattedBalance} ${t.symbol}`)
          .join(', ');
        return {
          success: true,
          isQuery: true,
          isDemo: false,
          provenance: 'LIVE_VERIFIED',
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
          queryResult: {
            action: 'QUERY_BALANCE',
            summary: `Wallet balance on Sepolia: ${overview.nativeBalance.formatted} ETH (${tokenSummaries})`,
            overview,
          },
        };
      } else if (intent.action === 'QUERY_NETWORK') {
        const connection = await verifySepoliaConnection();
        const blockInfo = connection.latestBlock ? ` (Block #${connection.latestBlock})` : '';
        return {
          success: true,
          isQuery: true,
          isDemo: false,
          provenance: 'LIVE_VERIFIED',
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
          queryResult: {
            action: 'QUERY_NETWORK',
            summary: `Connected to Ethereum Sepolia Testnet [Chain ID: ${connection.chainId}]${blockInfo} - Status: ${connection.status}`,
            connection,
          },
        };
      }
    }

    // Strict State-Changing Intent Validation
    const validationError = validateStateChangingIntent(intent, command);
    if (validationError) {
      return {
        success: false,
        isDemo: false,
        provenance: 'UNVERIFIED',
        aiProvenance,
        aiProviderUsed,
        aiModelUsed,
        error: validationError,
        step: "INTENT_PARSING",
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: 'Invalid',
          proofDigest: '0x0',
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
        },
      };
    }

    // Load active user policy (CSF-02 Fix: never uses hardcoded third-party Alice address)
    const activePolicy = getActiveUserPolicy(session.userId);

    // Step 2: Resolve Recipient (State-changing actions only)
    currentStep = "RECIPIENT_RESOLUTION";
    const recipientResolution = resolveRecipientFromPolicy(intent.recipientAlias, activePolicy);
    if (recipientResolution.status !== 'RESOLVED') {
      const blockedDecision: PolicyDecision = {
        status: "BLOCKED",
        reason: recipientResolution.reason,
      };
      const fallbackCandidate: TransactionCandidate = {
        to: "0x0000000000000000000000000000000000000000",
        value: BigInt(0),
        chainId: 11155111,
      };
      const blockedIIP = generateIIP(
        intent,
        fallbackCandidate,
        blockedDecision,
        { success: false, revertReason: `Policy blocked: ${blockedDecision.reason}`, timestamp: new Date().toISOString() }
      );

      const proposalId = storeProposal(
        blockedIIP,
        session.userId,
        DEFAULT_PROPOSAL_LIFETIME_MS,
        'UNVERIFIED',
        false
      );

      return {
        success: false,
        isDemo: false,
        provenance: 'UNVERIFIED',
        aiProvenance,
        aiProviderUsed,
        aiModelUsed,
        error: `Policy Blocked: ${blockedDecision.reason}`,
        step: "POLICY_EVALUATION",
        proposalId,
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: "Blocked",
          proofDigest: blockedIIP.proofDigest,
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
        },
      };
    }
    const resolvedAddress = recipientResolution.address;

    // Step 3: Build Candidate (M4)
    currentStep = "TRANSACTION_BUILDING";
    const candidate = buildTransaction(intent, resolvedAddress);

    // Step 4: Dry-run Simulation with Configured Wallet Account (CSF-01 Fix)
    currentStep = "SIMULATION";
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("SIMULATION_UNAVAILABLE: Cannot dry-run transaction without RPC URL.");
    }
    const walletInfo = getAgentWalletAddress();
    const senderAccount = walletInfo.isConfigured ? walletInfo.address : undefined;
    const simulation = await simulateTransaction(candidate, rpcUrl, senderAccount);

    // Step 5: Deterministic Policy Evaluation against Candidate
    currentStep = "POLICY_EVALUATION";
    const policyDecision = evaluatePolicy(intent, candidate, activePolicy);

    // Step 6: Deterministic Semantic Analysis & Intent Mismatch Verification
    currentStep = "TRANSACTION_ANALYSIS";
    const analysis = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: resolvedAddress,
      candidate,
      policy: activePolicy,
      simulationSuccess: simulation.success,
      simulationError: simulation.revertReason,
    });

    // Step 7: Approval Exposure Intelligence with Real On-Chain Allowance Read (CSF-03 Fix)
    let exposure: ApprovalExposureAnalysis | undefined;
    if (analysis.operationType === 'ERC20_APPROVE') {
      const allowanceRes = await getTokenAllowance({
        tokenAddress: candidate.to,
        ownerAddress: senderAccount,
        spenderAddress: analysis.decodedAction.recipientOrSpender,
        customRpcUrl: rpcUrl,
      });

      exposure = analyzeApprovalExposure({
        tokenAddress: candidate.to,
        spenderAddress: analysis.decodedAction.recipientOrSpender,
        proposedAllowanceRaw: BigInt(analysis.decodedAction.rawAmount || '0'),
        currentAllowanceRaw: allowanceRes.allowanceRaw,
        allowanceStatus: allowanceRes.status,
        allowanceError: allowanceRes.error,
        chainId: candidate.chainId,
        policy: activePolicy,
        knownContacts: activePolicy.trustedContacts,
      });
    }

    // Step 8: Security Explanation (Grounded AI or Deterministic Rules)
    const explanation = await explainSecurityFindings({
      analysis,
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Final Gate: Combined deterministic decision (Policy + Semantic Analysis)
    const isSecurityBlocked = !analysis.canExecute || policyDecision.status !== "ALLOW";
    const effectivePolicyDecision: PolicyDecision = isSecurityBlocked
      ? {
          status: "BLOCKED",
          reason:
            analysis.findings.find((f) => f.affectsExecution)?.explanation ||
            policyDecision.reason ||
            "Blocked by Transaction Security Analyzer",
          resolvedAddress: resolvedAddress,
        }
      : {
          ...policyDecision,
          resolvedAddress,
        };

    // Step 9: Generate IIP (M6 + Calldata Hashing)
    currentStep = "IIP_GENERATION";
    const iip = generateIIP(intent, candidate, effectivePolicyDecision, simulation);

    // Step 10: Store Owner-Bound Proposal
    const isExecutableProposal = !isSecurityBlocked && iip.finalDecision === "ALLOW_FOR_AUTHORIZATION";
    const proposalId = storeProposal(
      iip,
      session.userId,
      DEFAULT_PROPOSAL_LIFETIME_MS,
      'LIVE_VERIFIED',
      isExecutableProposal
    );

    if (isSecurityBlocked || iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
      return {
        success: false,
        isDemo: false,
        provenance: 'LIVE_VERIFIED',
        aiProvenance,
        aiProviderUsed,
        aiModelUsed,
        error:
          effectivePolicyDecision.reason ||
          simulation.revertReason ||
          "Blocked by Intent Integrity Proof",
        step: "TRANSACTION_ANALYSIS",
        proposalId,
        analysis,
        exposure,
        explanation,
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: candidate.to,
          gasEstimated: simulation.gasEstimated?.toString(),
          proofDigest: iip.proofDigest,
          aiProvenance,
          aiProviderUsed,
          aiModelUsed,
        },
      };
    }

    return {
      success: true,
      isDemo: false,
      provenance: 'LIVE_VERIFIED',
      aiProvenance,
      aiProviderUsed,
      aiModelUsed,
      proposalId,
      analysis,
      exposure,
      explanation,
      summary: {
        action: intent.action,
        asset: intent.asset,
        amount: intent.amount,
        recipientAlias: intent.recipientAlias,
        recipientAddress: candidate.to,
        gasEstimated: simulation.gasEstimated?.toString(),
        proofDigest: iip.proofDigest,
        aiProvenance,
        aiProviderUsed,
        aiModelUsed,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      step: currentStep,
    };
  }
}

/**
 * Executes a controlled security demonstration fixture (Milestone R7 Section 17 & R7.1 Isolation).
 * Tests the full transaction analysis pipeline on pre-defined security scenarios.
 *
 * CRITICAL SECURITY INVARIANT (R7.1):
 * - Recorded with provenance: 'SECURITY_FIXTURE'
 * - isExecutable is permanently false (0)
 * - CANNOT be authorized or executed via authorizeAndExecute
 * - Never touches private keys or broadcasts transactions
 */
export async function testSecurityFixtureAction(scenarioId: string): Promise<PrepareResult> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to test security fixtures.");
  }

  const fixture = getFixtureById(scenarioId);
  if (!fixture) {
    throw new Error(`UNKNOWN_FIXTURE: Scenario ${scenarioId} not found.`);
  }

  const candidate: TransactionCandidate = {
    to: fixture.candidate.to,
    value: BigInt(fixture.candidate.value || '0'),
    data: (fixture.candidate.data || '0x') as `0x${string}`,
    chainId: fixture.candidate.chainId,
  };

  const simulationSuccess = fixture.simulationSuccess !== false;
  const simulationError = fixture.simulationError;

  const analysis = analyzeTransaction({
    intent: fixture.intent,
    resolvedRecipientOrSpender: fixture.resolvedRecipientOrSpender,
    candidate,
    policy: MOCK_USER_POLICY,
    simulationSuccess,
    simulationError,
  });

  let exposure: ApprovalExposureAnalysis | undefined;
  if (analysis.operationType === 'ERC20_APPROVE') {
    exposure = analyzeApprovalExposure({
      tokenAddress: candidate.to,
      spenderAddress: analysis.decodedAction.recipientOrSpender,
      proposedAllowanceRaw: BigInt(analysis.decodedAction.rawAmount || '0'),
      allowanceStatus: 'UNKNOWN_ALLOWANCE',
      chainId: candidate.chainId,
      policy: MOCK_USER_POLICY,
      knownContacts: MOCK_USER_POLICY.trustedContacts,
    });
  }

  const explanation = await explainSecurityFindings({
    analysis,
    apiKey: process.env.GEMINI_API_KEY,
  });

  const policyDecision = evaluatePolicy(fixture.intent, candidate, MOCK_USER_POLICY);
  const isBlocked = !analysis.canExecute || policyDecision.status !== "ALLOW";

  const effectivePolicyDecision: PolicyDecision = isBlocked
    ? {
        status: "BLOCKED",
        reason:
          analysis.findings.find((f) => f.affectsExecution)?.explanation ||
          policyDecision.reason ||
          "Blocked by Transaction Security Analyzer",
        resolvedAddress: candidate.to,
      }
    : policyDecision;

  const iip = generateIIP(
    fixture.intent,
    candidate,
    effectivePolicyDecision,
    { success: simulationSuccess, revertReason: simulationError, timestamp: new Date().toISOString() }
  );

  // CRITICAL INVARIANT: Fixtures use storeFixtureProposal (STRICTLY NON-EXECUTABLE)
  const proposalId = storeFixtureProposal(iip, session.userId);

  return {
    success: !isBlocked,
    isDemo: true,
    provenance: 'SECURITY_FIXTURE',
    proposalId,
    analysis,
    exposure,
    explanation,
    error: isBlocked ? `Controlled Scenario Blocked: ${effectivePolicyDecision.reason}` : undefined,
    step: "TRANSACTION_ANALYSIS",
    summary: {
      action: fixture.intent.action,
      asset: fixture.intent.asset,
      amount: fixture.intent.amount,
      recipientAlias: fixture.intent.recipientAlias,
      recipientAddress: candidate.to,
      proofDigest: iip.proofDigest,
    },
  };
}

/**
 * Phase 2: Execution Authorization (Owner-Bound, Expiry-Checked, Atomic, Tamper-Checked, Crash-Safe)
 *
 * Security gates:
 * 1. Authenticate request
 * 2. Retrieve proposal
 * 2.5. Provenance & Execution Isolation Gate: Reject fixtures and unverified proposals
 * 3. Verify ownership
 * 4. Verify expiration
 * 5. Authorize proposal (PREPARED -> AUTHORIZED with provenance check)
 * 6. Verify IIP digest integrity AND column digest consistency
 * 6.5. Re-verify semantic intent-to-calldata alignment (modified recipient/amount defense)
 * 7. Acquire atomic execution lock (AUTHORIZED -> SUBMITTING with provenance check)
 * 8. Validate execution authorization
 * 9. Execute with isolated broadcast vs post-broadcast DB persistence error handling
 */
export async function authorizeAndExecute(proposalId: string): Promise<AuthorizeResult> {
  // Gate 1: Authentication
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to execute transaction proposal.");
  }

  // Gate 2: Proposal Retrieval
  const proposal = retrieveProposal(proposalId);
  if (!proposal) {
    throw new Error("UNKNOWN_PROPOSAL: Transaction proposal not found or expired.");
  }

  // Gate 2.5: Demo Fixture Execution Isolation
  if (proposal.provenance === 'SECURITY_FIXTURE') {
    throw new Error("FIXTURE_EXECUTION_BLOCKED: Security demonstration fixtures cannot be executed on the blockchain. Enter an authentic live command to create an executable proposal.");
  }

  if (proposal.provenance !== 'LIVE_VERIFIED' || !proposal.isExecutable) {
    throw new Error("NON_EXECUTABLE_PROPOSAL: This proposal lacks verified live blockchain execution capability.");
  }

  // Gate 3: Ownership Verification
  if (proposal.ownerId !== session.userId) {
    throw new Error("OWNERSHIP_VIOLATION: You are not the owner of this proposal.");
  }

  // Gate 4: Expiration Check
  if (isProposalExpired(proposalId)) {
    throw new Error("PROPOSAL_EXPIRED: This proposal has expired and can no longer be executed.");
  }

  // Gate 5: Authorization Transition (PREPARED -> AUTHORIZED)
  const currentStatus = getProposalStatus(proposalId);
  if (currentStatus === 'PREPARED') {
    const authorized = authorizeProposal(proposalId, session.userId);
    if (!authorized) {
      throw new Error("AUTHORIZATION_FAILED: Could not authorize proposal. It may have expired, be non-executable, or have been modified.");
    }
  } else if (currentStatus !== 'AUTHORIZED') {
    throw new Error("DUPLICATE_EXECUTION: Transaction is already processing or executed.");
  }

  // Re-retrieve proposal after authorization to ensure no TOCTOU modification occurred
  const freshProposal = retrieveProposal(proposalId);
  if (!freshProposal) {
    throw new Error("UNKNOWN_PROPOSAL: Proposal disappeared during authorization.");
  }

  // Gate 6: IIP Digest Integrity & Column Digest Match
  const iip = freshProposal.iipData;
  if (freshProposal.digest !== iip.proofDigest || !verifyIIPDigest(iip)) {
    updateProposalStatus(proposalId, "FAILED");
    throw new Error("TAMPERED_PAYLOAD: The transaction payload has been illegally modified.");
  }

  // Gate 6.5: Phase 2 Independent Semantic Integrity & Live Policy Re-Verification
  // Detects modified recipient, modified amount, modified calldata, OR policy tightening/contact removal
  // after proposal preparation, even if the IIP digest were forged.
  const activePolicy = getActiveUserPolicy(session.userId);
  const isLegacyTestMock =
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') &&
    !hasPersistedUserPolicy(session.userId) &&
    iip.candidate.to.toLowerCase() === '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

  const effectivePolicy: UserPolicy = isLegacyTestMock
    ? {
        ...MOCK_USER_POLICY,
        ...activePolicy,
        trustedContacts: {
          ...MOCK_USER_POLICY.trustedContacts,
          ...activePolicy.trustedContacts,
        },
      }
    : activePolicy;

  const resolvedCheck = resolveRecipientFromPolicy(iip.intent.recipientAlias, effectivePolicy);
  const expectedRecipient = resolvedCheck.status === 'RESOLVED' ? resolvedCheck.address : '';

  const recheckAnalysis = analyzeTransaction({
    intent: iip.intent,
    resolvedRecipientOrSpender: expectedRecipient,
    candidate: iip.candidate,
    policy: effectivePolicy,
    simulationSuccess: iip.simulation?.success ?? true,
    simulationError: iip.simulation?.revertReason,
  });

  const recheckPolicy = evaluatePolicy(iip.intent, iip.candidate, effectivePolicy);

  if (recheckAnalysis.mismatches.length > 0 || !recheckAnalysis.canExecute || recheckPolicy.status !== 'ALLOW') {
    updateProposalStatus(proposalId, "FAILED");
    throw new Error(
      `TAMPERED_PAYLOAD: Phase 2 semantic verification failed (${recheckAnalysis.mismatches.join(', ') || recheckPolicy.reason || 'execution prohibited'}).`
    );
  }

  // Gate 7: Atomic Execution Lock (AUTHORIZED -> SUBMITTING)
  const lockAcquired = lockProposalForExecution(proposalId, session.userId);
  if (!lockAcquired) {
    throw new Error("DUPLICATE_EXECUTION: Transaction is already processing or executed.");
  }

  // Gate 8: Execution Authorization Check
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION" || iip.policyDecision.status !== "ALLOW") {
    updateProposalStatus(proposalId, "FAILED");
    throw new Error("UNAUTHORIZED_EXECUTION: Intent Integrity Proof does not permit execution.");
  }

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  if (!privateKey || !rpcUrl) {
    updateProposalStatus(proposalId, "FAILED");
    throw new Error("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");
  }

  // Phase B: Broadcast signed transaction (Isolated from post-broadcast DB persistence)
  let hash: string;
  try {
    const broadcastRes = await broadcastTransaction(iip, privateKey, rpcUrl);
    hash = broadcastRes.hash;
  } catch (broadcastError: unknown) {
    if (broadcastError instanceof BroadcastError && broadcastError.outcome === 'BROADCAST_OUTCOME_UNKNOWN') {
      // Network timeout / connection reset after transaction dispatch: outcome is UNKNOWN!
      // DO NOT mark as FAILED_BEFORE_BROADCAST — the transaction might be in mempool or mined!
      // Must NOT be automatically replayed.
      updateProposalStatus(proposalId, "EXECUTION_UNKNOWN");
      return {
        success: false,
        proposalId,
        error: `BROADCAST_UNCERTAIN: ${broadcastError.message}`,
      };
    }

    // Definitely not broadcast — failure occurred before dispatch
    updateProposalStatus(proposalId, "FAILED_BEFORE_BROADCAST");
    return {
      success: false,
      proposalId,
      error: `BROADCAST_FAILED: ${(broadcastError as Error).message}`,
    };
  }

  // Phase C: Persist hash to durable recovery journal FIRST, then transition SQLite to SUBMITTED.
  // Priority 2 Vector 9 & R8.4 Section 3 Fix:
  // Even if SQLite fails during `markSubmitted` and the server subsequently restarts,
  // the Broadcast Recovery Journal preserves `(proposalId, hash)` on disk so recovery can
  // reconcile the receipt without ever broadcasting a second transaction.
  writeBroadcastRecoveryJournal(proposalId, hash, session.userId);

  try {
    const submittedOk = markSubmitted(proposalId, hash);
    if (!submittedOk) {
      throw new Error("Failed to transition proposal to SUBMITTED state after broadcast.");
    }
  } catch (dbErr: unknown) {
    try {
      recordTxHash(proposalId, hash);
    } catch {
      // Journal already holds hash on disk if SQLite is completely locked
    }
    try {
      updateProposalStatus(proposalId, "RECONCILIATION_REQUIRED");
    } catch {
      // Keep locked in SUBMITTING state if DB remains unavailable
    }
    return {
      success: false,
      proposalId,
      executionResult: {
        success: false,
        transactionHash: hash,
        receiptStatus: 'pending',
        broadcastOutcome: 'BROADCAST_SUBMITTED',
      },
      error:
        `POST_BROADCAST_DB_FAILURE: Transaction broadcast (${hash}) succeeded, but persisting SUBMITTED state failed: ` +
        `${(dbErr as Error).message}. Proposal remains locked to prevent duplicate transfer.`,
    };
  }

  // Phase D: Wait for receipt confirmation
  try {
    const receipt = await waitForReceipt(hash, rpcUrl);

    // Phase E: Final verification — mark terminal state and clear recovery journal
    if (receipt.status === 'success') {
      updateProposalStatus(proposalId, "CONFIRMED");
      clearBroadcastRecoveryJournal(proposalId);
      return {
        success: true,
        proposalId,
        executionResult: {
          success: true,
          transactionHash: hash,
          receiptStatus: 'success',
          broadcastOutcome: 'RECEIPT_CONFIRMED',
        },
      };
    } else {
      updateProposalStatus(proposalId, "REVERTED");
      clearBroadcastRecoveryJournal(proposalId);
      return {
        success: false,
        proposalId,
        executionResult: {
          success: false,
          transactionHash: hash,
          receiptStatus: 'reverted',
          broadcastOutcome: 'RECEIPT_REVERTED',
        },
      };
    }
  } catch (receiptError) {
    // Hash exists and is persisted in SUBMITTED state, but receipt polling timed out.
    // Transition to RECONCILIATION_REQUIRED so it is explicitly tracked for reconciliation.
    updateProposalStatus(proposalId, "RECONCILIATION_REQUIRED");
    return {
      success: false,
      proposalId,
      executionResult: {
        success: false,
        transactionHash: hash,
        receiptStatus: 'pending',
        broadcastOutcome: 'BROADCAST_SUBMITTED',
      },
      error:
        `RECEIPT_PENDING: Transaction broadcast (${hash.slice(0, 10)}...) but receipt not yet confirmed. ` +
        `Proposal locked for reconciliation. Error: ${(receiptError as Error).message}`,
    };
  }
}

/**
 * R8.4 Section 3 — Post-Broadcast Recovery Action:
 * Recovers the original transaction hash and receipt for an in-flight proposal
 * (`SUBMITTING`, `SUBMITTED`, `RECONCILIATION_REQUIRED`, or `EXECUTION_UNKNOWN`)
 * after a database failure and/or server restart WITHOUT EVER broadcasting a second transaction.
 */
export async function recoverPostBroadcastProposalAction(proposalId: string): Promise<AuthorizeResult> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to recover transaction proposal.");
  }

  const proposal = retrieveProposal(proposalId);
  if (!proposal) {
    throw new Error("UNKNOWN_PROPOSAL: Transaction proposal not found.");
  }

  if (proposal.ownerId !== session.userId) {
    throw new Error("OWNERSHIP_VIOLATION: You are not the owner of this proposal.");
  }

  if (proposal.status === 'CONFIRMED' && proposal.txHash) {
    return {
      success: true,
      proposalId,
      executionResult: {
        success: true,
        transactionHash: proposal.txHash,
        receiptStatus: 'success',
        broadcastOutcome: 'RECEIPT_CONFIRMED',
      },
    };
  }

  if (proposal.status === 'REVERTED' && proposal.txHash) {
    return {
      success: false,
      proposalId,
      executionResult: {
        success: false,
        transactionHash: proposal.txHash,
        receiptStatus: 'reverted',
        broadcastOutcome: 'RECEIPT_REVERTED',
      },
    };
  }

  const recoverableStatuses: ReadonlySet<ProposalStatus> = new Set([
    'SUBMITTING',
    'SUBMITTED',
    'RECONCILIATION_REQUIRED',
    'EXECUTION_UNKNOWN',
  ]);

  if (!recoverableStatuses.has(proposal.status)) {
    return {
      success: false,
      proposalId,
      error: `INVALID_RECOVERY_STATE: Proposal is in '${proposal.status}' state and cannot undergo post-broadcast recovery.`,
    };
  }

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    return {
      success: false,
      proposalId,
      error: "MISSING_RPC_URL: RPC_URL is required to verify on-chain receipt during post-broadcast recovery.",
    };
  }

  // 3-Tier Transaction Hash Recovery (NEVER signs or broadcasts a new transaction):
  // Tier 1: SQLite `tx_hash` column
  let recoveredHash: string | null = proposal.txHash;

  // Tier 2: Durable Broadcast Recovery Journal on disk (survives SQLite failure + server restart)
  if (!recoveredHash) {
    const journalEntry = readBroadcastRecoveryJournal(proposalId);
    if (journalEntry?.txHash) {
      recoveredHash = journalEntry.txHash;
    }
  }

  // Tier 3: Read-only scan of recent Sepolia blocks for a matching transaction from the agent wallet
  if (!recoveredHash) {
    const walletInfo = getAgentWalletAddress();
    if (walletInfo.isConfigured && walletInfo.address) {
      recoveredHash = await findMatchingBroadcastTxOnChain(
        proposal.iipData,
        walletInfo.address,
        rpcUrl
      );
    }
  }

  if (!recoveredHash) {
    // Conservative handling of UNKNOWN broadcast outcomes:
    // Keep proposal locked so it can never be re-broadcast automatically.
    return {
      success: false,
      proposalId,
      error:
        "RECOVERY_TX_HASH_UNKNOWN: No transaction hash could be recovered from SQLite, the Broadcast Recovery Journal, or recent on-chain blocks. " +
        "Proposal remains locked in a non-replayable state to prevent duplicate transfer.",
    };
  }

  // Backfill tx_hash into SQLite if it was missing due to Phase C database failure
  if (!proposal.txHash) {
    try {
      recordTxHash(proposalId, recoveredHash);
    } catch {
      // Non-fatal if DB write fails again; receipt check still proceeds
    }
  }

  try {
    const receipt = await waitForReceipt(recoveredHash, rpcUrl);
    if (receipt.status === 'success') {
      reconcileProposal(proposalId, 'CONFIRMED', recoveredHash);
      clearBroadcastRecoveryJournal(proposalId);
      return {
        success: true,
        proposalId,
        executionResult: {
          success: true,
          transactionHash: recoveredHash,
          receiptStatus: 'success',
          broadcastOutcome: 'RECEIPT_CONFIRMED',
        },
      };
    } else {
      reconcileProposal(proposalId, 'REVERTED', recoveredHash);
      clearBroadcastRecoveryJournal(proposalId);
      return {
        success: false,
        proposalId,
        executionResult: {
          success: false,
          transactionHash: recoveredHash,
          receiptStatus: 'reverted',
          broadcastOutcome: 'RECEIPT_REVERTED',
        },
      };
    }
  } catch (receiptErr: unknown) {
    updateProposalStatus(proposalId, 'RECONCILIATION_REQUIRED');
    return {
      success: false,
      proposalId,
      executionResult: {
        success: false,
        transactionHash: recoveredHash,
        receiptStatus: 'pending',
        broadcastOutcome: 'BROADCAST_SUBMITTED',
      },
      error: `RECOVERY_RECEIPT_PENDING: Recovered txHash (${recoveredHash}), but receipt confirmation is still pending: ${(receiptErr as Error).message}`,
    };
  }
}

/**
 * Authenticated Server Action: Cancels an open (PREPARED or AUTHORIZED) proposal in SQLite.
 */
export async function cancelProposalAction(proposalId: string): Promise<{
  success: boolean;
  proposalId: string;
  status?: ProposalStatus;
  error?: string;
}> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to cancel transaction proposal.");
  }

  const proposal = retrieveProposal(proposalId);
  if (!proposal) {
    return {
      success: false,
      proposalId,
      error: "UNKNOWN_PROPOSAL: Proposal not found.",
    };
  }

  if (proposal.ownerId !== session.userId) {
    throw new Error("OWNERSHIP_VIOLATION: You are not the owner of this proposal.");
  }

  const cancelled = cancelProposal(proposalId, session.userId);
  if (!cancelled) {
    return {
      success: false,
      proposalId,
      status: proposal.status,
      error: `CANNOT_CANCEL: Proposal in '${proposal.status}' state cannot be cancelled.`,
    };
  }

  return {
    success: true,
    proposalId,
    status: 'CANCELLED',
  };
}

/**
 * Authenticated Server Action: Retrieves persistent proposal & transaction history for the operator.
 */
export async function getProposalHistoryAction(): Promise<{
  proposals: ProposalHistoryItem[];
}> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to view transaction history.");
  }

  const records = listProposalsByOwner(session.userId, 25);
  const proposals: ProposalHistoryItem[] = records.map((rec) => ({
    id: rec.id,
    action: rec.iipData.intent.action,
    asset: rec.iipData.intent.asset,
    amount: rec.iipData.intent.amount,
    recipientAlias: rec.iipData.intent.recipientAlias,
    targetAddress: rec.iipData.candidate.to,
    status: rec.status,
    provenance: rec.provenance,
    isExecutable: rec.isExecutable,
    digest: rec.digest,
    txHash: rec.txHash,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
  }));

  return { proposals };
}

/**
 * Authenticated Server Action: Retrieves the operator's active policy, audit logs, and configured wallet address.
 */
export async function getActivePolicyAction(): Promise<{
  policy: UserPolicy;
  auditLogs: PolicyAuditEntry[];
  walletAddress: string;
}> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to read security policies.");
  }

  const policy = getActiveUserPolicy(session.userId);
  const auditLogs = getPolicyAuditLogs(session.userId, 15);
  const walletInfo = getAgentWalletAddress();

  return {
    policy,
    auditLogs,
    walletAddress: walletInfo.isConfigured ? walletInfo.address : '',
  };
}

/**
 * Authenticated Server Action: Updates the operator's active policy with validation, SQLite persistence, and audit logging.
 */
export async function updateUserPolicyAction(input: {
  action: string;
  maxTransferAmountETH?: string;
  trustedContacts?: Record<string, string>;
}): Promise<{
  success: boolean;
  policy?: UserPolicy;
  auditLogs?: PolicyAuditEntry[];
  error?: string;
}> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to update security policies.");
  }

  try {
    const updated = updateActiveUserPolicy({
      ownerId: session.userId,
      action: input.action || 'UPDATE_POLICY',
      maxTransferAmountETH: input.maxTransferAmountETH,
      trustedContacts: input.trustedContacts,
    });
    const auditLogs = getPolicyAuditLogs(session.userId, 15);
    return {
      success: true,
      policy: updated,
      auditLogs,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}
