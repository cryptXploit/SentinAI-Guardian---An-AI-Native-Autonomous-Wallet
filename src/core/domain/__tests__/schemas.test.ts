import { describe, it, expect } from 'vitest';
import { ParsedIntentSchema, UserPolicySchema } from '../schemas';

describe('Domain Schemas', () => {
  describe('ParsedIntentSchema', () => {
    it('should pass valid intent JSON', () => {
      const validIntent = {
        action: "TRANSFER",
        asset: "ETH",
        amount: "1.5",
        recipientAlias: "alice"
      };
      const result = ParsedIntentSchema.safeParse(validIntent);
      expect(result.success).toBe(true);
    });

    it('should uppercase asset symbol automatically', () => {
      const validIntent = {
        action: "SWAP",
        asset: "usdc",
        amount: "100",
        recipientAlias: "bob"
      };
      const result = ParsedIntentSchema.safeParse(validIntent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.asset).toBe("USDC");
      }
    });

    it('should accept UNLIMITED amount', () => {
      const validIntent = {
        action: "APPROVE",
        asset: "DAI",
        amount: "UNLIMITED",
        recipientAlias: "dex"
      };
      const result = ParsedIntentSchema.safeParse(validIntent);
      expect(result.success).toBe(true);
    });

    it('should reject invalid action type', () => {
      const invalidIntent = {
        action: "STEAL", // Hallucinated action
        asset: "ETH",
        amount: "1.0",
        recipientAlias: "eve"
      };
      const result = ParsedIntentSchema.safeParse(invalidIntent);
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const invalidIntent = {
        action: "TRANSFER",
        asset: "ETH"
        // missing amount and recipientAlias
      };
      const result = ParsedIntentSchema.safeParse(invalidIntent);
      expect(result.success).toBe(false);
    });
  });

  describe('UserPolicySchema', () => {
    it('should pass valid policy JSON', () => {
      const validPolicy = {
        maxTransferAmountETH: "10.0",
        allowUnlimitedApproval: false,
        trustedContacts: {
          "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" // vitalik.eth
        }
      };
      const result = UserPolicySchema.safeParse(validPolicy);
      expect(result.success).toBe(true);
    });

    it('should reject invalid EVM addresses in trustedContacts', () => {
      const invalidPolicy = {
        maxTransferAmountETH: "10.0",
        allowUnlimitedApproval: false,
        trustedContacts: {
          "bob": "0xNotAnAddress"
        }
      };
      const result = UserPolicySchema.safeParse(invalidPolicy);
      expect(result.success).toBe(false);
    });
  });
});
