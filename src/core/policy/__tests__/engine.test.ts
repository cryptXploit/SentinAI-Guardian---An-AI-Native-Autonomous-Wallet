import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../engine';
import { ParsedIntent, UserPolicy } from '../../domain/schemas';

describe('Deterministic Policy Engine', () => {
  const defaultPolicy: UserPolicy = {
    maxTransferAmountETH: "1.0",
    allowUnlimitedApproval: false,
    trustedContacts: {
      "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "dex": "0x1111111254fb6c44bac0bed2854e76f90643097d"
    }
  };

  it('Happy Path: Valid transfer to a trusted contact under limit', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.5",
      recipientAlias: "alice"
    };

    const result = evaluatePolicy(intent, defaultPolicy);
    expect(result.status).toBe("ALLOW");
    expect(result.resolvedAddress).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  });

  it('Threat 1: Transfer to an alias not in trusted list returns BLOCKED', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.1",
      recipientAlias: "eve" // Not in trustedContacts
    };

    const result = evaluatePolicy(intent, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Unknown recipient alias");
  });

  it('Threat 2: Transfer amount exceeds limit returns BLOCKED', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "1.1", // Exceeds 1.0 limit
      recipientAlias: "alice"
    };

    const result = evaluatePolicy(intent, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Amount exceeds maximum transfer limit");
  });

  it('Threat 3: Requesting UNLIMITED approval when disabled returns BLOCKED', () => {
    const intent: ParsedIntent = {
      action: "APPROVE",
      asset: "USDC",
      amount: "UNLIMITED",
      recipientAlias: "dex"
    };

    const result = evaluatePolicy(intent, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Unlimited approvals are disabled");
  });

  it('Should fail-close on negative amount parsing errors', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "-0.5",
      recipientAlias: "alice"
    };

    const result = evaluatePolicy(intent, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Evaluation error: Negative amounts are not allowed");
  });
});
