import { describe, it, expect } from 'vitest';
import { encodeFunctionData, Address, parseUnits } from 'viem';
import { evaluatePolicy } from '../engine';
import { ParsedIntent, UserPolicy } from '../../domain/schemas';
import {
  ERC20_ABI,
  SUPPORTED_TOKENS,
  TransactionCandidate,
} from '../../transaction/builder';
import {
  analyzeTransaction,
} from '../../security/transaction-analyzer';
import {
  EXACT_MAX_UINT256,
  EXTREMELY_LARGE_FINITE_THRESHOLD,
} from '../../security/approval-analyzer';
import { generateIIP, verifyIIPDigest } from '../../security/iip';

describe('Milestone R7.3 — Phase 6: Financial Policy & Transaction Semantics Boundary Suite', () => {
  const ALICE = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const UNISWAP = '0x1111111254fb6c44bac0bed2854e76f90643097d';
  const UNKNOWN_SPENDER = '0x9999999999999999999999999999999999999999';
  const UNKNOWN_TOKEN = '0x8888888888888888888888888888888888888888';
  const USDC_ADDR = SUPPORTED_TOKENS.USDC.address;
  const DAI_ADDR = SUPPORTED_TOKENS.DAI.address;

  const POLICY: UserPolicy = {
    maxTransferAmountETH: '1.0', // 1.0 ETH = 10^18 wei
    allowUnlimitedApproval: false,
    trustedContacts: {
      alice: ALICE,
      uniswap: UNISWAP,
    },
    tokenApprovalPolicies: {
      [`11155111:${USDC_ADDR.toLowerCase()}`]: {
        chainId: 11155111,
        tokenContractAddress: USDC_ADDR,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
        maxApprovalAmountBaseUnits: '100000000', // 100 USDC (6 decimals)
        allowedSpenders: [UNISWAP],
        allowUnlimited: false,
      },
      [`11155111:${DAI_ADDR.toLowerCase()}`]: {
        chainId: 11155111,
        tokenContractAddress: DAI_ADDR,
        tokenSymbol: 'DAI',
        tokenDecimals: 18,
        maxApprovalAmountBaseUnits: parseUnits('100', 18).toString(), // 100 DAI (18 decimals)
        allowedSpenders: [UNISWAP],
        allowUnlimited: false,
      },
    },
  };

  // ─── Part 1: Native ETH Transfer Boundaries ───────────────────────────────
  describe('Native ETH Transfer Boundaries', () => {
    it('ETH1: Zero transfer amount is allowed by policy', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '0', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 0n, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('ALLOW');
    });

    it('ETH2: Exact configured maximum (1.0 ETH = 10^18 wei) is ALLOWED', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '1.0', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 1000000000000000000n, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('ALLOW');
    });

    it('ETH3: Just 1 wei above maximum (1.000000000000000001 ETH) is BLOCKED', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '1.000000000000000001', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 1000000000000000001n, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('Amount exceeds maximum transfer limit');
    });

    it('ETH4: Extremely large amount (1000 ETH) is BLOCKED', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '1000', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 1000000000000000000000n, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('Amount exceeds maximum transfer limit');
    });

    it('ETH5: Malformed decimal representation fails closed and returns BLOCKED', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '0.1.2.3', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 0n, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
    });
  });

  // ─── Part 2: ERC-20 Approval Boundaries ───────────────────────────────────
  describe('ERC-20 Approval Boundaries & Decimals', () => {
    it('APP1: Exact allowed amount (100 USDC = 100_000_000 base units) is ALLOWED', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '100', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, 100000000n],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('ALLOW');
    });

    it('APP2: One base unit above allowed amount (100_000_001 USDC base units) is BLOCKED', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '100.000001', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, 100000001n],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('APPROVAL_POLICY_CAP_EXCEEDED');
    });

    it('APP3: Zero allowance (0 USDC) is ALLOWED (revoking allowance)', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '0', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, 0n],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('ALLOW');
    });

    it('APP4: MaxUint256 (2^256-1) approval is strictly BLOCKED when unlimited is disallowed', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: 'UNLIMITED', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, EXACT_MAX_UINT256],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('Unlimited approvals are disabled');
    });

    it('APP5: Extremely large finite allowance (2^255) is BLOCKED as cap exceeded', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '57896044618658097711785492504343953926634992332820282019728792003956564819968', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, EXTREMELY_LARGE_FINITE_THRESHOLD],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('APPROVAL_POLICY_CAP_EXCEEDED');
    });

    it('APP6: Unknown unconfigured token contract FAILS CLOSED with NO_TOKEN_APPROVAL_POLICY', () => {
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'SHIB', amount: '50', recipientAlias: 'uniswap' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as Address, 50000000n],
      });
      const candidate: TransactionCandidate = { to: UNKNOWN_TOKEN, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('NO_TOKEN_APPROVAL_POLICY');
    });

    it('APP7: Unknown spender not in allowedSpenders is BLOCKED with UNAUTHORIZED_SPENDER', () => {
      // Add unknown spender to trusted contacts alias map so alias resolves, but spender policy rejects
      const policyWithSpender: UserPolicy = {
        ...POLICY,
        trustedContacts: { ...POLICY.trustedContacts, unknown: UNKNOWN_SPENDER },
      };
      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'unknown' };
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNKNOWN_SPENDER as Address, 50000000n],
      });
      const candidate: TransactionCandidate = { to: USDC_ADDR, value: 0n, data: calldata, chainId: 11155111 };
      const res = evaluatePolicy(intent, candidate, policyWithSpender);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('UNAUTHORIZED_SPENDER');
    });

    it('APP8: Same numerical display amount (100) has different base units across tokens (USDC 6 vs DAI 18)', () => {
      const usdcRaw = parseUnits('100', 6);
      const daiRaw = parseUnits('100', 18);

      expect(usdcRaw).toBe(100000000n);
      expect(daiRaw).toBe(100000000000000000000n);
      expect(daiRaw).toBe(usdcRaw * 10n ** 12n);

      // A 100 USDC allowance candidate on DAI contract would be tiny (100 * 10^-12 DAI)
      // A 100 DAI allowance candidate on USDC contract would be 10^14 USDC ($100,000,000,000,000) and MUST BE BLOCKED
      const maliciousSwap: TransactionCandidate = {
        to: USDC_ADDR,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [UNISWAP as Address, daiRaw], // 10^20 base units passed to USDC contract!
        }),
        chainId: 11155111,
      };

      const intent: ParsedIntent = { action: 'APPROVE', asset: 'USDC', amount: '100', recipientAlias: 'uniswap' };
      const res = evaluatePolicy(intent, maliciousSwap, POLICY);
      expect(res.status).toBe('BLOCKED');
      expect(res.reason).toContain('APPROVAL_POLICY_CAP_EXCEEDED');
    });
  });

  // ─── Part 3: Semantic Analyzer & Invariant Enforcement ────────────────────
  describe('Semantic Analyzer & Cryptographic Invariants', () => {
    it('INV1: Calldata with unknown method selector is rejected with UNSUPPORTED_CALLDATA', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = {
        to: ALICE,
        value: 50000000000000000n,
        data: '0x12345678abcdef', // Arbitrary unknown selector
        chainId: 11155111,
      };

      const analysis = analyzeTransaction({
        intent,
        resolvedRecipientOrSpender: ALICE,
        candidate,
        policy: POLICY,
      });

      expect(analysis.status).toBe('BLOCKED');
      expect(analysis.mismatches).toContain('UNSUPPORTED_CALLDATA');
      expect(analysis.canExecute).toBe(false);
    });

    it('INV2: Tampered recipient in candidate calldata is rejected with RECIPIENT_MISMATCH', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'USDC', amount: '10', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = {
        to: USDC_ADDR,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [UNKNOWN_SPENDER as Address, 10000000n], // Tampered to attacker address
        }),
        chainId: 11155111,
      };

      const analysis = analyzeTransaction({
        intent,
        resolvedRecipientOrSpender: ALICE,
        candidate,
        policy: POLICY,
      });

      expect(analysis.status).toBe('BLOCKED');
      expect(analysis.mismatches).toContain('RECIPIENT_MISMATCH');
      expect(analysis.canExecute).toBe(false);
    });

    it('INV3: Intent Integrity Proof (IIP) Keccak-256 digest detects any modified parameter', () => {
      const intent: ParsedIntent = { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' };
      const candidate: TransactionCandidate = { to: ALICE, value: 50000000000000000n, chainId: 11155111 };
      const decision = { status: 'ALLOW' as const, reason: 'valid transfer' };

      const iip = generateIIP(intent, candidate, decision, {
        success: true,
        timestamp: new Date().toISOString(),
      });
      expect(verifyIIPDigest(iip)).toBe(true);

      // Tamper with candidate value
      const tamperedIIP = {
        ...iip,
        candidate: {
          ...iip.candidate,
          value: 5000000000000000000n, // Changed to 5 ETH
        },
      };
      expect(verifyIIPDigest(tamperedIIP)).toBe(false);
    });
  });
});
