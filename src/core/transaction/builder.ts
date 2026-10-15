import { encodeFunctionData, Address } from 'viem';
import { ParsedIntent } from '../domain/schemas';
import { parseTokenAmount } from '../utils/financial';
import { isValidEvmAddress } from '../utils/address';

export type TransactionCandidate = {
  to: string;
  value: bigint;
  data?: string;
  chainId: number;
};

export type TokenInfo = {
  address: string;
  decimals: number;
  symbol: string;
};

// Strict registry mapping supported tokens on Sepolia (Chain ID: 11155111)
export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  "USDC": {
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Official Sepolia test USDC
    decimals: 6,
    symbol: "USDC"
  },
  "USDT": {
    address: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Sepolia test USDT
    decimals: 6,
    symbol: "USDT"
  },
  "DAI": {
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // Verified Sepolia test DAI (18 decimals)
    decimals: 18,
    symbol: "DAI"
  }
};

export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");

export function buildTransaction(intent: ParsedIntent, resolvedAddress: string): TransactionCandidate {
  if (!resolvedAddress || !isValidEvmAddress(resolvedAddress)) {
    throw new Error("Invalid or missing resolved address");
  }

  // 1. Native ETH Transfers
  if (intent.asset === "ETH") {
    if (intent.action === "TRANSFER") {
      if (intent.amount === "UNLIMITED") {
        throw new Error("UNLIMITED amount not supported for ETH transfers");
      }

      const value = parseTokenAmount(intent.amount, 18);

      return {
        to: resolvedAddress,
        value,
        chainId: 11155111
      };
    }

    if (intent.action === "APPROVE") {
      throw new Error("UNSUPPORTED_OPERATION: Native ETH cannot be approved. Use an ERC-20 token.");
    }
  }

  // 2. ERC-20 Token Operations (TRANSFER & APPROVE)
  const token = SUPPORTED_TOKENS[intent.asset];
  if (!token) {
    throw new Error(`UNSUPPORTED_ASSET: Token ${intent.asset} is not supported.`);
  }

  if (intent.action === "TRANSFER") {
    if (intent.amount === "UNLIMITED") {
      throw new Error("UNLIMITED amount not supported for token transfers");
    }

    const tokenUnits = parseTokenAmount(intent.amount, token.decimals);
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [resolvedAddress as Address, tokenUnits]
    });

    return {
      to: token.address,
      value: BigInt(0),
      data,
      chainId: 11155111
    };
  }

  if (intent.action === "APPROVE") {
    const approvalAmount = intent.amount === "UNLIMITED"
      ? MAX_UINT256
      : parseTokenAmount(intent.amount, token.decimals);

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [resolvedAddress as Address, approvalAmount]
    });

    return {
      to: token.address,
      value: BigInt(0),
      data,
      chainId: 11155111
    };
  }

  throw new Error("UNSUPPORTED_OPERATION");
}
