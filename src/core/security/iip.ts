import { ParsedIntent } from '../domain/schemas';
import { TransactionCandidate } from '../transaction/builder';
import { PolicyDecision } from '../policy/engine';
import { SimulationResult } from './simulator';

export type IntentIntegrityProof = {
  proofId: string;
  intent: ParsedIntent;
  candidate: TransactionCandidate;
  policyDecision: PolicyDecision;
  simulation: SimulationResult;
  timestamp: string;
  finalDecision: "ALLOW_FOR_AUTHORIZATION" | "BLOCKED";
};

export function generateIIP(
  intent: ParsedIntent,
  candidate: TransactionCandidate,
  policyDecision: PolicyDecision,
  simulation: SimulationResult
): IntentIntegrityProof {
  
  const isPolicyAllowed = policyDecision.status === "ALLOW";
  const isSimulationSuccessful = simulation.success === true;

  const finalDecision = (isPolicyAllowed && isSimulationSuccessful)
    ? "ALLOW_FOR_AUTHORIZATION"
    : "BLOCKED";

  return {
    proofId: crypto.randomUUID(),
    intent,
    candidate,
    policyDecision,
    simulation,
    timestamp: new Date().toISOString(),
    finalDecision
  };
}
