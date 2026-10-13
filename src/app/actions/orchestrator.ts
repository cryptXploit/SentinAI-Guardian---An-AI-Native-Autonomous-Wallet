"use server";

import { parseIntent } from "@/core/ai/intent-parser";
import { evaluatePolicy, PolicyDecision } from "@/core/policy/engine";
import { buildTransaction, TransactionCandidate } from "@/core/transaction/builder";
import { simulateTransaction } from "@/core/security/simulator";
import { generateIIP, verifyIIPDigest } from "@/core/security/iip";
import { executeTransaction, ExecutionResult } from "@/core/execution/controller";
import { UserPolicy } from "@/core/domain/schemas";
import { verifySession } from "@/core/security/auth";
import { storeProposal, retrieveProposal } from "@/core/security/proposal";

const MOCK_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d"
  }
};

// Module-level idempotency store (Fix VULN-06)
const executedDigests = new Set<string>();

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
 * Phase 1: Intent Preparation & Proposal Creation (Server-Owned, R5B Pipeline)
 * Reordered execution:
 * 1. Parse Intent (AI NLP)
 * 2. Resolve Recipient Alias
 * 3. Build Transaction Candidate
 * 4. Dry-run Simulation via RPC
 * 5. Deterministic Policy Evaluation against Candidate (Calldata Inspection)
 * 6. Intent Integrity Proof (IIP) Generation with Calldata Hash
 * 7. Store Server-Owned Proposal and Return Sanitized Summary
 */
export async function prepareTransactionIntent(command: string): Promise<PrepareResult> {
  // Authentication Barrier (VULN-R5-01)
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
        intent,
        fallbackCandidate,
        blockedDecision,
        {
          success: false,
          revertReason: `Policy blocked execution: ${blockedDecision.reason}`,
          timestamp: new Date().toISOString()
        }
      );

      const proposalId = storeProposal(blockedIIP);

      return {
        success: false,
        error: `Policy Blocked: ${blockedDecision.reason}`,
        step: "POLICY_EVALUATION",
        proposalId,
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: "Blocked",
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

    // Step 5: Deterministic Policy Evaluation against Candidate (M3 + R5B Calldata Decoding)
    currentStep = "POLICY_EVALUATION";
    const policyDecision = evaluatePolicy(intent, candidate, MOCK_USER_POLICY);
    
    // Enforce fail-closed check on policy status (Fix VULN-07 & VULN-R5-05)
    if (policyDecision.status !== "ALLOW") {
      const blockedIIP = generateIIP(
        intent,
        candidate,
        policyDecision,
        {
          success: false,
          revertReason: `Policy blocked execution: ${policyDecision.reason}`,
          timestamp: new Date().toISOString()
        }
      );

      const proposalId = storeProposal(blockedIIP);

      return {
        success: false,
        error: `Policy Blocked: ${policyDecision.reason}`,
        step: "POLICY_EVALUATION",
        proposalId,
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
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

    // Step 7: Store Server-Owned Proposal (VULN-R5-02)
    const proposalId = storeProposal(iip);

    if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
      return {
        success: false,
        error: simulation.revertReason || "Blocked by Intent Integrity Proof",
        step: simulation.success ? "IIP_GENERATION" : "SIMULATION",
        proposalId,
        summary: {
          action: intent.action,
          asset: intent.asset,
          amount: intent.amount,
          recipientAlias: intent.recipientAlias,
          recipientAddress: candidate.to,
          gasEstimated: simulation.gasEstimated?.toString(),
          proofDigest: iip.proofDigest
        }
      };
    }

    return {
      success: true,
      proposalId,
      summary: {
        action: intent.action,
        asset: intent.asset,
        amount: intent.amount,
        recipientAlias: intent.recipientAlias,
        recipientAddress: candidate.to,
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
 * Phase 2: Execution Authorization
 * Requires authenticated session and valid server-stored proposalId.
 * Enforces cryptographic digest verification and idempotency locks before on-chain broadcast.
 */
export async function authorizeAndExecute(proposalId: string): Promise<AuthorizeResult> {
  // Authentication Barrier (VULN-R5-01)
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ACCESS: Authentication required to execute transaction proposal.");
  }

  // Server-Owned Proposal Retrieval (VULN-R5-02)
  const iip = retrieveProposal(proposalId);
  if (!iip) {
    throw new Error("UNKNOWN_PROPOSAL: Transaction proposal not found or expired.");
  }

  // Security Gate 1 (Tampering): Verify Keccak-256 digest
  if (!verifyIIPDigest(iip)) {
    throw new Error("TAMPERED_PAYLOAD: The transaction payload has been illegally modified.");
  }

  // Security Gate 2 (Idempotency): Prevent duplicate replay attacks
  if (executedDigests.has(iip.proofDigest)) {
    throw new Error("DUPLICATE_EXECUTION: This transaction digest has already been executed.");
  }

  // Security Gate 3 (Authorization Gate): Ensure proof authorized execution
  if (iip.finalDecision !== "ALLOW_FOR_AUTHORIZATION") {
    throw new Error("UNAUTHORIZED_EXECUTION: Intent Integrity Proof does not permit execution.");
  }

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  if (!privateKey || !rpcUrl) {
    throw new Error("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");
  }

  // Lock digest immediately to prevent race conditions
  executedDigests.add(iip.proofDigest);

  const executionResult = await executeTransaction(iip, privateKey, rpcUrl);

  return {
    success: executionResult.success,
    proposalId,
    executionResult
  };
}

/**
 * Test helper for resetting the module-level idempotency cache in unit tests
 */
export async function _resetExecutedDigestsForTesting() {
  executedDigests.clear();
}
