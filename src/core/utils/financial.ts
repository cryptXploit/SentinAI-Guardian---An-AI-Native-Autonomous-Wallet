import { parseUnits } from 'viem';

export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  const trimmed = amount.trim();
  
  if (/e/i.test(trimmed)) {
    throw new Error("Scientific notation is not allowed");
  }
  
  if (trimmed.startsWith('-')) {
    throw new Error("Negative amounts are not allowed");
  }
  
  // Must be digits and optional single decimal point
  if (!/^\d*\.?\d+$/.test(trimmed) && !/^\d+\.?\d*$/.test(trimmed)) {
    throw new Error("Invalid number format");
  }

  const parts = trimmed.split('.');
  if (parts.length === 2 && parts[1].length > decimals) {
    throw new Error("Too many decimal places");
  }

  try {
    return parseUnits(trimmed, decimals);
  } catch (error) {
    throw new Error(`Failed to parse amount: ${(error as Error).message}`);
  }
}
