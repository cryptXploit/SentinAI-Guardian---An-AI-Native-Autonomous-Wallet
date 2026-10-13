import { keccak256, encodePacked, Address } from 'viem';
import { ParsedIntent } from '../domain/schemas';
import { TransactionCandidate } from '../transaction/builder';
import { PolicyDecision } from '../policy/engine';
import { SimulationResult } from './simulator';
import { isValidEvmAddress } from '../utils/address';

export type IntentIntegrityProof = {
  proofDigest: string;
  proofId?: string; // Backwards-compatible alias
  intent: ParsedIntent;
  candidate: TransactionCandidate;
  policyDecision: PolicyDecision;
  simulation: SimulationResult;
  timestamp: string;
  finalDecision: "ALLOW_FOR_AUTHORIZATION" | "BLOCKED";
};

export function computeIIPDigest(
  intent: ParsedIntent,
  candidate: TransactionCandidate,
  policyDecision: PolicyDecision
): `0x${string}` {
  const isAddr = isValidEvmAddress(candidate.to);
  if (isAddr) {
    return keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256', 'string', 'string', 'string'],
        [
          candidate.to as Address,
          candidate.value,
          BigInt(candidate.chainId),
          intent.action,
          intent.asset,
          policyDecision.status
        ]
      )
    );
  }

  return keccak256(
    encodePacked(
      ['string', 'uint256', 'uint256', 'string', 'string', 'string'],
      [
        candidate.to,
        candidate.value,
        BigInt(candidate.chainId),
        intent.action,
        intent.asset,
        policyDecision.status
      ]
    )
  );
}

export function verifyIIPDigest(iip: IntentIntegrityProof): boolean {
  try {
    const expectedDigest = computeIIPDigest(iip.intent, iip.candidate, iip.policyDecision);
    return expectedDigest.toLowerCase() === iip.proofDigest.toLowerCase();
  } catch {
    return false;
  }
}

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

  const proofDigest = computeIIPDigest(intent, candidate, policyDecision);

  return {
    proofDigest,
    proofId: proofDigest,
    intent,
    candidate,
    policyDecision,
    simulation,
    timestamp: new Date().toISOString(),
    finalDecision
  };
}
