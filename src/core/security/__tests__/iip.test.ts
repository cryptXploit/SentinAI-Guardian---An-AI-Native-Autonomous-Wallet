import { describe, it, expect } from 'vitest';
import { generateIIP } from '../iip';
import { ParsedIntent } from '../../domain/schemas';
import { TransactionCandidate } from '../../transaction/builder';
import { PolicyDecision } from '../../policy/engine';
import { SimulationResult } from '../simulator';

describe('Intent Integrity Proof (IIP) Generator', () => {
  const dummyIntent: ParsedIntent = {
    action: "TRANSFER",
    asset: "ETH",
    amount: "0.05",
    recipientAlias: "alice"
  };

  const dummyCandidate: TransactionCandidate = {
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    value: BigInt("50000000000000000"),
    chainId: 11155111
  };

  it('should result in ALLOW_FOR_AUTHORIZATION when both policy and simulation pass', () => {
    const policyDecision: PolicyDecision = { status: "ALLOW", reason: "Ok" };
    const simulation: SimulationResult = { success: true, timestamp: "now", gasEstimated: BigInt(21000) };

    const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);

    expect(iip.finalDecision).toBe("ALLOW_FOR_AUTHORIZATION");
    expect(iip.proofId).toBeDefined();
    expect(iip.timestamp).toBeDefined();
  });

  it('should result in BLOCKED when policy fails but simulation passes', () => {
    const policyDecision: PolicyDecision = { status: "BLOCKED", reason: "Exceeds limit" };
    const simulation: SimulationResult = { success: true, timestamp: "now", gasEstimated: BigInt(21000) };

    const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);

    expect(iip.finalDecision).toBe("BLOCKED");
  });

  it('should result in BLOCKED when policy passes but simulation fails', () => {
    const policyDecision: PolicyDecision = { status: "ALLOW", reason: "Ok" };
    const simulation: SimulationResult = { success: false, timestamp: "now", revertReason: "Out of gas" };

    const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);

    expect(iip.finalDecision).toBe("BLOCKED");
  });
  
  it('should result in BLOCKED when both fail', () => {
    const policyDecision: PolicyDecision = { status: "BLOCKED", reason: "No" };
    const simulation: SimulationResult = { success: false, timestamp: "now", revertReason: "Failed" };

    const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);

    expect(iip.finalDecision).toBe("BLOCKED");
  });
});
