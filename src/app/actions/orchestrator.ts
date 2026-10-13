"use server";

import { parseIntent } from "@/core/ai/intent-parser";
import { evaluatePolicy, PolicyDecision } from "@/core/policy/engine";
import { buildTransaction, TransactionCandidate } from "@/core/transaction/builder";
import { simulateTransaction } from "@/core/security/simulator";
import { generateIIP, verifyIIPDigest } from "@/core/security/iip";
import { broadcastTransaction, waitForReceipt, ExecutionResult } from "@/core/execution/controller";
import { UserPolicy } from "@/core/domain/schemas";
import { verifySession } from "@/core/security/auth";
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
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d"
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

export type PrepareResult = {
  success: boolean;
  proposalId?: string;
  summary?: ProposalSummary;
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
 * Phase 1: Intent Preparation & Proposal Creation (R5D — Owner-Bound, Expiring)
 * Pipeline: Parse -> Resolve -> Build -> Simulate -> Policy -> IIP -> Store
 * Returns ONLY proposalId and sanitized summary. Never leaks raw IIP.
 */
export async function prepareTransactionIntent(command: string): Promise<PrepareResult> {
  // Authentication Barrier
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to prepare transaction intent.");
  }

  let currentStep = "INTENT_PARSING";

  try {
    // Step 1: Parse Intent (M2)
    const intent = await parseIntent(command);

    // Step 2: Resolve Recipient
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

    if (policyDecision.status !== "ALLOW") {
      const blockedIIP = generateIIP(
        intent, candidate, policyDecision,
        { success: false, revertReason: `Policy blocked: ${policyDecision.reason}`, timestamp: new Date().toISOString() }
      );
      const proposalId = storeProposal(blockedIIP, session.userId);

      return {
        success: false,
        error: `Policy Blocked: ${policyDecision.reason}`,
        step: "POLICY_EVALUATION",
        proposalId,
        summary: {
          action: intent.action, asset: intent.asset, amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: policyDecision.resolvedAddress || candidate.to,
          gasEstimated: simulation.gasEstimated?.toString(),
          proofDigest: blockedIIP.proofDigest
        }
      };
    }

    // Step 6: Generate IIP (M6 + Calldata Hashing)
    currentStep = "IIP_GENERATION";
    const iip = generateIIP(intent, candidate, policyDecision, simulation);

    // Step 7: Store Owner-Bound Proposal (R5D)
    const proposalId = storeProposal(iip, session.userId);

    if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
      return {
        success: false,
        error: simulation.revertReason || "Blocked by Intent Integrity Proof",
        step: simulation.success ? "IIP_GENERATION" : "SIMULATION",
        proposalId,
        summary: {
          action: intent.action, asset: intent.asset, amount: intent.amount,
          recipientAlias: intent.recipientAlias, recipientAddress: candidate.to,
          gasEstimated: simulation.gasEstimated?.toString(),
          proofDigest: iip.proofDigest
        }
      };
    }

    return {
      success: true,
      proposalId,
      summary: {
        action: intent.action, asset: intent.asset, amount: intent.amount,
        recipientAlias: intent.recipientAlias, recipientAddress: candidate.to,
        gasEstimated: simulation.gasEstimated?.toString(),
        proofDigest: iip.proofDigest
      }
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
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
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
