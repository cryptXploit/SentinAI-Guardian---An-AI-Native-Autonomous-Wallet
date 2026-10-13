import { describe, it, expect } from 'vitest';
import { generateIIP, verifyIIPDigest } from '../iip';
import { ParsedIntent } from '../../domain/schemas';
import { TransactionCandidate } from '../../transaction/builder';
import { PolicyDecision } from '../../policy/engine';
import { SimulationResult } from '../simulator';

describe('Intent Integrity Proof (IIP) Generator & Verifier', () => {
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
    expect(iip.proofDigest).toBeDefined();
    expect(iip.proofDigest).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(iip.proofId).toBe(iip.proofDigest);
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

  describe('Cryptographic Tamper-Evidence Tests', () => {
    it('1. should successfully verify an untampered IIP digest', () => {
      const policyDecision: PolicyDecision = { status: "ALLOW", reason: "Ok" };
      const simulation: SimulationResult = { success: true, timestamp: "now", gasEstimated: BigInt(21000) };

      const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);

      expect(verifyIIPDigest(iip)).toBe(true);
    });

    it('2. Tamper Recipient: should detect tampering when candidate.to is mutated', () => {
      const policyDecision: PolicyDecision = { status: "ALLOW", reason: "Ok" };
      const simulation: SimulationResult = { success: true, timestamp: "now", gasEstimated: BigInt(21000) };

      const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);
      expect(verifyIIPDigest(iip)).toBe(true);

      // Mutate recipient to hacker's address
      const tamperedIIP = {
        ...iip,
        candidate: {
          ...iip.candidate,
          to: "0x9999999999999999999999999999999999999999"
        }
      };

      expect(verifyIIPDigest(tamperedIIP)).toBe(false);
    });

    it('3. Tamper Value: should detect tampering when candidate.value is mutated', () => {
      const policyDecision: PolicyDecision = { status: "ALLOW", reason: "Ok" };
      const simulation: SimulationResult = { success: true, timestamp: "now", gasEstimated: BigInt(21000) };

      const iip = generateIIP(dummyIntent, dummyCandidate, policyDecision, simulation);
      expect(verifyIIPDigest(iip)).toBe(true);

      // Mutate value to drain extra funds
      const tamperedIIP = {
        ...iip,
        candidate: {
          ...iip.candidate,
          value: BigInt("100000000000000000000") // 100 ETH
        }
      };

      expect(verifyIIPDigest(tamperedIIP)).toBe(false);
    });

    it('4. Tamper Policy: should detect tampering when policyDecision.status is mutated', () => {
      const blockedPolicy: PolicyDecision = { status: "BLOCKED", reason: "Exceeds transfer limit" };
      const simulation: SimulationResult = { success: false, timestamp: "now", revertReason: "Blocked" };

      const blockedIIP = generateIIP(dummyIntent, dummyCandidate, blockedPolicy, simulation);
      expect(verifyIIPDigest(blockedIIP)).toBe(true);

      // Mutate blocked status to ALLOW
      const tamperedIIP = {
        ...blockedIIP,
        policyDecision: {
          ...blockedIIP.policyDecision,
          status: "ALLOW" as const
        }
      };

      expect(verifyIIPDigest(tamperedIIP)).toBe(false);
    });
  });
});
