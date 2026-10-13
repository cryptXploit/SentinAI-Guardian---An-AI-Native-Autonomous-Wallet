"use server";

import { parseIntent } from "@/core/ai/intent-parser";
import { evaluatePolicy } from "@/core/policy/engine";
import { buildTransaction } from "@/core/transaction/builder";
import { simulateTransaction } from "@/core/security/simulator";
import { generateIIP } from "@/core/security/iip";
import { executeTransaction } from "@/core/execution/controller";
import { UserPolicy } from "@/core/domain/schemas";

const MOCK_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d"
  }
};

export async function processAgentCommand(command: string) {
  let currentStep = "INTENT_PARSING";
  
  try {
    // Step 1: Parse (M2)
    const intent = await parseIntent(command);
    
    // Step 2: Policy (M3)
    currentStep = "POLICY_EVALUATION";
    const policyDecision = evaluatePolicy(intent, MOCK_USER_POLICY);
    
    // Explicitly enforce fail-closed check on policy status (Fix VULN-07)
    if (policyDecision.status !== "ALLOW") {
      const blockedIIP = generateIIP(
        intent,
        {
          to: policyDecision.resolvedAddress || "0x0000000000000000000000000000000000000000",
          value: BigInt(0),
          chainId: 11155111
        },
        policyDecision,
        {
          success: false,
          revertReason: `Policy blocked execution: ${policyDecision.reason}`,
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: false,
        error: `Policy Blocked: ${policyDecision.reason}`,
        step: "POLICY_EVALUATION",
        iip: blockedIIP,
        executionResult: {
          success: false,
          error: `Policy Blocked: ${policyDecision.reason}`
        }
      };
    }

    if (!policyDecision.resolvedAddress) {
      throw new Error(`Policy Blocked: ${policyDecision.reason}`);
    }

    // Step 3: Build (M4)
    currentStep = "TRANSACTION_BUILDING";
    const candidate = buildTransaction(intent, policyDecision.resolvedAddress);

    // Step 4: Simulate (M5)
    currentStep = "SIMULATION";
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("SIMULATION_UNAVAILABLE: Cannot dry-run transaction without RPC URL.");
    }
    const simulation = await simulateTransaction(candidate, rpcUrl);

    // Step 5: IIP (M6)
    currentStep = "IIP_GENERATION";
    const iip = generateIIP(intent, candidate, policyDecision, simulation);

    // Step 6: Execute (M7)
    currentStep = "EXECUTION";
    let executionResult = null;
    if (iip.finalDecision === "ALLOW_FOR_AUTHORIZATION") {
      const privateKey = process.env.AGENT_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL.");
      }
      executionResult = await executeTransaction(iip, privateKey, rpcUrl);
      return {
        success: executionResult.success,
        iip,
        executionResult
      };
    } else {
      return {
        success: false,
        error: simulation.revertReason || "Blocked by Intent Integrity Proof",
        step: simulation.success ? "IIP_GENERATION" : "SIMULATION",
        iip,
        executionResult: {
          success: false,
          error: simulation.revertReason || "Blocked by Intent Integrity Proof",
        }
      };
    }

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      step: currentStep
    };
  }
}
