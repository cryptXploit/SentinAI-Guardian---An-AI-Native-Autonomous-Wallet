import { describe, it, expect } from 'vitest';
import { buildTransaction, SUPPORTED_TOKENS } from '../builder';
import { ParsedIntent } from '../../domain/schemas';

describe('Transaction Builder', () => {
  const aliceAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const dexSpender = "0x1111111254fb6c44bac0bed2854e76f90643097d";

  it('should build a valid native ETH transfer candidate', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.05",
      recipientAlias: "alice"
    };

    const tx = buildTransaction(intent, aliceAddress);

    expect(tx.to).toBe(aliceAddress);
    expect(tx.chainId).toBe(11155111);
    expect(tx.value).toBe(BigInt("50000000000000000")); // 0.05 ETH in wei
    expect(tx.data).toBeUndefined();
  });

  it('should encode ERC-20 TRANSFER intents with contract address and calldata', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "USDC",
      amount: "50",
      recipientAlias: "alice"
    };

    const tx = buildTransaction(intent, aliceAddress);

    expect(tx.to).toBe(SUPPORTED_TOKENS["USDC"].address);
    expect(tx.value).toBe(BigInt(0));
    expect(tx.chainId).toBe(11155111);
    expect(tx.data).toBeDefined();
    // Standard ERC-20 transfer function selector is 0xa9059cbb
    expect(tx.data?.startsWith("0xa9059cbb")).toBe(true);
  });

  it('should encode ERC-20 APPROVE intents with finite amount', () => {
    const intent: ParsedIntent = {
      action: "APPROVE",
      asset: "USDC",
      amount: "100",
      recipientAlias: "dex"
    };

    const tx = buildTransaction(intent, dexSpender);

    expect(tx.to).toBe(SUPPORTED_TOKENS["USDC"].address);
    expect(tx.value).toBe(BigInt(0));
    expect(tx.chainId).toBe(11155111);
    expect(tx.data).toBeDefined();
    // Standard ERC-20 approve function selector is 0x095ea7b3
    expect(tx.data?.startsWith("0x095ea7b3")).toBe(true);
  });

  it('should encode ERC-20 APPROVE intents with UNLIMITED (MAX_UINT256)', () => {
    const intent: ParsedIntent = {
      action: "APPROVE",
      asset: "USDC",
      amount: "UNLIMITED",
      recipientAlias: "dex"
    };

    const tx = buildTransaction(intent, dexSpender);

    expect(tx.to).toBe(SUPPORTED_TOKENS["USDC"].address);
    expect(tx.value).toBe(BigInt(0));
    expect(tx.chainId).toBe(11155111);
    expect(tx.data).toBeDefined();
    // Approve function selector followed by spender and 64 f's
    expect(tx.data?.startsWith("0x095ea7b3")).toBe(true);
    expect(tx.data?.toLowerCase()).toContain("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  });

  it('should throw UNSUPPORTED_ASSET for unknown tokens', () => {
    const intent: ParsedIntent = {
      action: "TRANSFER",
      asset: "SHIBA_INU",
      amount: "1000",
      recipientAlias: "alice"
    };

    expect(() => buildTransaction(intent, aliceAddress))
      .toThrow("UNSUPPORTED_ASSET: Token SHIBA_INU is not supported.");
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
