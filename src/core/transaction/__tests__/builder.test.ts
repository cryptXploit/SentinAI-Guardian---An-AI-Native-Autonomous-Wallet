import { describe, it, expect } from 'vitest';
import { buildTransaction } from '../builder';
import { ParsedIntent } from '../../domain/schemas';

describe('Transaction Builder', () => {
  it('should build a valid native ETH transfer candidate', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.05",
      recipientAlias: "alice"
    };

    const resolvedAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const tx = buildTransaction(intent, resolvedAddress);

    expect(tx.to).toBe(resolvedAddress);
    expect(tx.chainId).toBe(11155111);
    expect(tx.value).toBe(BigInt("50000000000000000")); // 0.05 ETH in wei
  });

  it('should throw UNSUPPORTED_OPERATION for ERC-20 transfers', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "USDC",
      amount: "100",
      recipientAlias: "alice"
    };

    const resolvedAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    expect(() => buildTransaction(intent, resolvedAddress)).toThrow("UNSUPPORTED_OPERATION");
  });

  it('should throw UNSUPPORTED_OPERATION for APPROVE actions', () => {
    const intent: ParsedIntent = {
      action: "APPROVE",
      asset: "ETH",
      amount: "UNLIMITED",
      recipientAlias: "dex"
    };

    const resolvedAddress = "0x1111111254fb6c44bac0bed2854e76f90643097d";
    expect(() => buildTransaction(intent, resolvedAddress)).toThrow("UNSUPPORTED_OPERATION");
  });

  it('should throw on invalid resolved address', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.05",
      recipientAlias: "alice"
    };

    const invalidAddress = "0xNotAnAddress";
    expect(() => buildTransaction(intent, invalidAddress)).toThrow("Invalid or missing resolved address");
  });

  it('should throw if resolved address is missing', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.05",
      recipientAlias: "alice"
    };

    expect(() => buildTransaction(intent, "")).toThrow("Invalid or missing resolved address");
  });
});
