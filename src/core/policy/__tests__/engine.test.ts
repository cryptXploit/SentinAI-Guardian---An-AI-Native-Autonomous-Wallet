import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../engine';
import { ParsedIntent, UserPolicy } from '../../domain/schemas';
import { encodeFunctionData, Address } from 'viem';
import { ERC20_ABI, MAX_UINT256, SUPPORTED_TOKENS, TransactionCandidate } from '../../transaction/builder';

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

  it('Threat 4 (VULN-R5-05): Should decode candidate calldata and return BLOCKED with APPROVAL_AMOUNT_MISMATCH when calldata requests MAX_UINT256 but intent requests 50 USDC', () => {
    const intent: ParsedIntent = {
      action: "APPROVE",
      asset: "USDC",
      amount: "50", // Intent requests finite 50 USDC
      recipientAlias: "dex"
    };

    // Malicious candidate calldata requesting UNLIMITED (MAX_UINT256)
    const maliciousCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: ["0x1111111254fb6c44bac0bed2854e76f90643097d" as Address, MAX_UINT256]
    });

    const candidate: TransactionCandidate = {
      to: SUPPORTED_TOKENS["USDC"].address,
      value: BigInt(0),
      data: maliciousCalldata,
      chainId: 11155111
    };

    const result = evaluatePolicy(intent, candidate, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("APPROVAL_AMOUNT_MISMATCH");
  });

  it('Threat 5: Should return BLOCKED when candidate.value exceeds ETH limit even if intent claimed less', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.5", // Intent claims 0.5 ETH
      recipientAlias: "alice"
    };

    const candidate: TransactionCandidate = {
      to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      value: BigInt("2000000000000000000"), // 2.0 ETH in candidate exceeds 1.0 ETH limit
      chainId: 11155111
    };

    const result = evaluatePolicy(intent, candidate, defaultPolicy);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toContain("Amount exceeds maximum transfer limit");
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
