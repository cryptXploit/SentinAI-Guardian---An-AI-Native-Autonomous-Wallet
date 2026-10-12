import { describe, it, expect } from 'vitest';
import { parseTokenAmount } from '../financial';

describe('Financial Utils', () => {
  describe('parseTokenAmount', () => {
    it('should correctly parse valid amounts', () => {
      expect(parseTokenAmount("0.05")).toBe(BigInt("50000000000000000"));
      expect(parseTokenAmount("1")).toBe(BigInt("1000000000000000000"));
      expect(parseTokenAmount("1.0")).toBe(BigInt("1000000000000000000"));
      expect(parseTokenAmount(".5")).toBe(BigInt("500000000000000000"));
    });

    it('should correctly parse with custom decimals', () => {
      // 6 decimals for USDC/USDT
      expect(parseTokenAmount("0.05", 6)).toBe(BigInt("50000"));
    });

    it('should throw on negative amounts', () => {
      expect(() => parseTokenAmount("-1")).toThrow("Negative amounts are not allowed");
      expect(() => parseTokenAmount("-0.05")).toThrow("Negative amounts are not allowed");
    });

    it('should throw on NaN or non-numeric strings', () => {
      expect(() => parseTokenAmount("NaN")).toThrow("Invalid number format");
      expect(() => parseTokenAmount("abc")).toThrow("Invalid number format");
      expect(() => parseTokenAmount("")).toThrow("Invalid number format");
    });

    it('should throw on Infinity', () => {
      expect(() => parseTokenAmount("Infinity")).toThrow("Invalid number format");
    });

    it('should throw on scientific notation', () => {
      expect(() => parseTokenAmount("1e18")).toThrow("Scientific notation is not allowed");
      expect(() => parseTokenAmount("1.5E6")).toThrow("Scientific notation is not allowed");
    });

    it('should throw when decimal places exceed the maximum allowed', () => {
      expect(() => parseTokenAmount("0.0000001", 6)).toThrow("Too many decimal places");
      expect(() => parseTokenAmount("1.1234567", 6)).toThrow("Too many decimal places");
    });
  });
});
