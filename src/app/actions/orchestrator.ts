"use server";

import { parseIntent } from "@/core/ai/intent-parser";
import { evaluatePolicy, PolicyDecision } from "@/core/policy/engine";
import { buildTransaction, TransactionCandidate } from "@/core/transaction/builder";
import { simulateTransaction } from "@/core/security/simulator";
import { generateIIP, verifyIIPDigest } from "@/core/security/iip";
import { broadcastTransaction, waitForReceipt, ExecutionResult } from "@/core/execution/controller";
import { UserPolicy, isReadOnlyAction } from "@/core/domain/schemas";
import { verifySession } from "@/core/security/auth";
import { getLiveWalletOverview, WalletOverview } from "@/core/web3/wallet-service";
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
  retrieveProposal,
  authorizeProposal,
  lockProposalForExecution,
  markSubmitted,
  updateProposalStatus,
  isProposalExpired,
  getProposalStatus,
} from "@/core/security/proposal";

const MOCK_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d",
    "uniswap": "0x1111111254fb6c44bac0bed2854e76f90643097d"
  }
};

export type ProposalSummary = {
  action: string;
  asset: string;
  amount: string;
  recipientAlias: string;
  recipientAddress: string;
  gasEstimated?: string;
  proofDigest: string;
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

/**
 * Phase 1: Intent Preparation & Proposal Creation (R5D/R6 — Query-Aware, Owner-Bound, Expiring)
 * Pipeline: Parse -> If Read-Only Query: Route Immediately -> Else: Resolve -> Build -> Simulate -> Policy -> IIP -> Store
 * Returns ONLY proposalId and sanitized summary for transactions, or queryResult for read-only actions.
 */
export async function prepareTransactionIntent(command: string): Promise<PrepareResult> {
  // Authentication Barrier
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to prepare transaction intent.");
  }

  let currentStep = "INTENT_PARSING";

  try {
    // Step 1: Parse Intent (M2/R6)
    const intent = await parseIntent(command);

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
          queryResult: {
            action: 'QUERY_NETWORK',
            summary: `Connected to Ethereum Sepolia Testnet [Chain ID: ${connection.chainId}]${blockInfo} - Status: ${connection.status}`,
            connection,
          },
        };
      }
    }

    // Step 2: Resolve Recipient (State-changing actions only)
    currentStep = "RECIPIENT_RESOLUTION";
    const resolvedAddress = MOCK_USER_POLICY.trustedContacts[intent.recipientAlias];
    if (!resolvedAddress) {
      const blockedDecision: PolicyDecision = {
        status: "BLOCKED",
        reason: `Unknown recipient alias: ${intent.recipientAlias}`
      };
      const fallbackCandidate: TransactionCandidate = {
        to: "0x0000000000000000000000000000000000000000",
        value: BigInt(0),
        chainId: 11155111
      };
      const blockedIIP = generateIIP(
        intent, fallbackCandidate, blockedDecision,
        { success: false, revertReason: `Policy blocked: ${blockedDecision.reason}`, timestamp: new Date().toISOString() }
      );

      const proposalId = storeProposal(blockedIIP, session.userId);

      return {
        success: false,
        error: `Policy Blocked: ${blockedDecision.reason}`,
        step: "POLICY_EVALUATION",
        proposalId,
        summary: {
          action: intent.action, asset: intent.asset, amount: intent.amount,
          recipientAlias: intent.recipientAlias, recipientAddress: "Blocked",
          proofDigest: blockedIIP.proofDigest
        }
      };
    }

    // Step 3: Build Candidate (M4)
    currentStep = "TRANSACTION_BUILDING";
    const candidate = buildTransaction(intent, resolvedAddress);

    // Step 4: Dry-run Simulation (M5)
    currentStep = "SIMULATION";
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("SIMULATION_UNAVAILABLE: Cannot dry-run transaction without RPC URL.");
    }
    const simulation = await simulateTransaction(candidate, rpcUrl);

    // Step 5: Deterministic Policy Evaluation against Candidate (R5B)
    currentStep = "POLICY_EVALUATION";
    const policyDecision = evaluatePolicy(intent, candidate, MOCK_USER_POLICY);

    // Step 6: Deterministic Semantic Analysis & Intent Mismatch Verification (R7)
    currentStep = "TRANSACTION_ANALYSIS";
    const analysis = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: resolvedAddress,
      candidate,
      policy: MOCK_USER_POLICY,
      simulationSuccess: simulation.success,
      simulationError: simulation.revertReason,
    });

    // Step 7: Approval Exposure Intelligence (if APPROVE) (R7)
    let exposure: ApprovalExposureAnalysis | undefined;
    if (analysis.operationType === 'ERC20_APPROVE') {
      exposure = analyzeApprovalExposure({
        tokenAddress: candidate.to,
        spenderAddress: analysis.decodedAction.recipientOrSpender,
        proposedAllowanceRaw: BigInt(analysis.decodedAction.rawAmount || '0'),
        policy: MOCK_USER_POLICY,
        knownContacts: MOCK_USER_POLICY.trustedContacts,
      });
    }

    // Step 8: Security Explanation (Grounded AI or Deterministic Rules) (R7)
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
          resolvedAddress: candidate.to,
        }
      : policyDecision;

    // Step 9: Generate IIP (M6 + Calldata Hashing)
    currentStep = "IIP_GENERATION";
    const iip = generateIIP(intent, candidate, effectivePolicyDecision, simulation);

    // Step 10: Store Owner-Bound Proposal (R5D)
    const proposalId = storeProposal(iip, session.userId);

    if (isSecurityBlocked || iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
      return {
        success: false,
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
        },
      };
    }

    return {
      success: true,
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
      },
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      step: currentStep
    };
  }
}

/**
 * Executes a controlled security demonstration fixture (Milestone R7 Section 17).
 * Tests the full transaction analysis pipeline on pre-defined security scenarios.
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

  const proposalId = storeProposal(iip, session.userId);

  return {
    success: !isBlocked,
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
 * Phase 2: Execution Authorization (R5D — Owner-Bound, Expiry-Checked, Atomic)
 *
 * Security gates:
 * 1. Authenticate request
 * 2. Retrieve proposal
 * 3. Verify ownership
 * 4. Verify expiration
 * 5. Authorize proposal (PREPARED -> AUTHORIZED)
 * 6. Verify IIP digest integrity
 * 7. Acquire atomic execution lock (AUTHORIZED -> SUBMITTING)
 * 8. Validate execution authorization
 * 9. Execute and record terminal state
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

  // Gate 3: Ownership Verification
  if (proposal.ownerId !== session.userId) {
    throw new Error("OWNERSHIP_VIOLATION: You are not the owner of this proposal.");
  }

  // Gate 4: Expiration Check
  if (isProposalExpired(proposalId)) {
    throw new Error("PROPOSAL_EXPIRED: This proposal has expired and can no longer be executed.");
  }

  // Gate 5: Authorization Transition (PREPARED -> AUTHORIZED)
  // This is a no-op if already AUTHORIZED (lock will handle it)
  const currentStatus = getProposalStatus(proposalId);
  if (currentStatus === 'PREPARED') {
    const authorized = authorizeProposal(proposalId, session.userId);
    if (!authorized) {
      throw new Error("AUTHORIZATION_FAILED: Could not authorize proposal. It may have expired or been modified.");
    }
  } else if (currentStatus !== 'AUTHORIZED') {
    // Already past AUTHORIZED state
    throw new Error("DUPLICATE_EXECUTION: Transaction is already processing or executed.");
  }

  // Gate 6: IIP Digest Integrity
  const iip = proposal.iipData;
  if (!verifyIIPDigest(iip)) {
    throw new Error("TAMPERED_PAYLOAD: The transaction payload has been illegally modified.");
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

  // Execute with crash-safe phased approach:
  // Phase B: Broadcast → Phase C: Persist hash & SUBMITTED state → Phase D: Wait receipt → Phase E: Final state
  try {
    // Phase B: Broadcast signed transaction
    const { hash } = await broadcastTransaction(iip, privateKey, rpcUrl);

    // Phase C: Persist hash & transition to SUBMITTED IMMEDIATELY (before waiting for receipt)
    markSubmitted(proposalId, hash);

    // Phase D: Wait for receipt confirmation
    try {
      const receipt = await waitForReceipt(hash, rpcUrl);

      // Phase E: Final verification — mark terminal state
      if (receipt.status === 'success') {
        updateProposalStatus(proposalId, "CONFIRMED");
        return {
          success: true,
          proposalId,
          executionResult: {
            success: true,
            transactionHash: hash,
            receiptStatus: 'success',
          }
        };
      } else {
        updateProposalStatus(proposalId, "REVERTED");
        return {
          success: false,
          proposalId,
          executionResult: {
            success: false,
            transactionHash: hash,
            receiptStatus: 'reverted',
          }
        };
      }
    } catch (receiptError) {
      // Hash exists and is persisted in SUBMITTED state, but receipt polling timed out.
      // Transition to RECONCILIATION_REQUIRED so it is explicitly tracked for reconciliation.
      updateProposalStatus(proposalId, "RECONCILIATION_REQUIRED");
      return {
        success: false,
        proposalId,
        error: `RECEIPT_PENDING: Transaction broadcast (${hash.slice(0, 10)}...) but receipt not yet confirmed. ` +
               `Proposal locked for reconciliation. Error: ${(receiptError as Error).message}`
      };
    }
  } catch (broadcastError) {
    // Broadcast itself failed — transaction was NOT sent to network
    updateProposalStatus(proposalId, "FAILED_BEFORE_BROADCAST");
    return {
      success: false,
      proposalId,
      error: `BROADCAST_FAILED: ${(broadcastError as Error).message}`
    };
  }
}
