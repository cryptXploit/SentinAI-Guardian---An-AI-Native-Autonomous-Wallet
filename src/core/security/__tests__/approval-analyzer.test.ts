import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import {
  analyzeApprovalExposure,
  classifyAllowance,
  EXACT_MAX_UINT256,
  EXTREMELY_LARGE_FINITE_THRESHOLD,
} from '../approval-analyzer';
import { SUPPORTED_TOKENS } from '../../transaction/builder';
import { UserPolicy } from '../../domain/schemas';

const USDC = SUPPORTED_TOKENS.USDC.address;
const DAI = SUPPORTED_TOKENS.DAI.address;
const UNISWAP = '0x1111111254fb6c44bac0bed2854e76f90643097d';
const UNKNOWN_SPENDER = '0x9999999999999999999999999999999999999999';
const UNKNOWN_TOKEN = '0x1234567890123456789012345678901234567890';

const TEST_POLICY: UserPolicy = {
  maxTransferAmountETH: '1.0', // 1.0 ETH native transfer cap — MUST NOT BE USED FOR TOKENS!
  allowUnlimitedApproval: false,
  trustedContacts: {
    uniswap: UNISWAP,
  },
  tokenApprovalPolicies: {
    [`11155111:${USDC.toLowerCase()}`]: {
      chainId: 11155111,
      tokenContractAddress: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      maxApprovalAmountBaseUnits: parseUnits('100', 6).toString(), // 100 USDC = 100_000_000
      allowedSpenders: [UNISWAP],
      allowUnlimited: false,
    },
    [`11155111:${DAI.toLowerCase()}`]: {
      chainId: 11155111,
      tokenContractAddress: DAI,
      tokenSymbol: 'DAI',
      tokenDecimals: 18,
      maxApprovalAmountBaseUnits: parseUnits('100', 18).toString(), // 100 DAI = 100 * 10^18
      allowedSpenders: [UNISWAP],
      allowUnlimited: false,
    },
  },
};

describe('R7.1 Approval Exposure Analyzer & Classification Suite', () => {
  describe('Priority C: Exact Approval Classification', () => {
    it('C1: Correctly classifies Exact MaxUint256 (2^256-1) as EXACT_UNLIMITED_ALLOWANCE', () => {
      expect(classifyAllowance(EXACT_MAX_UINT256)).toBe('EXACT_UNLIMITED_ALLOWANCE');
    });

    it('C2: Correctly classifies MaxUint256 - 1 as EXTREMELY_LARGE_FINITE_ALLOWANCE (not unlimited)', () => {
      const maxMinusOne = EXACT_MAX_UINT256 - 1n;
      expect(classifyAllowance(maxMinusOne)).toBe('EXTREMELY_LARGE_FINITE_ALLOWANCE');
    });

    it('C3: Correctly classifies 2^255 as EXTREMELY_LARGE_FINITE_ALLOWANCE (not unlimited)', () => {
      expect(classifyAllowance(EXTREMELY_LARGE_FINITE_THRESHOLD)).toBe('EXTREMELY_LARGE_FINITE_ALLOWANCE');
    });

    it('C4: Correctly classifies 2^255 - 1 as BOUNDED_ALLOWANCE', () => {
      expect(classifyAllowance(EXTREMELY_LARGE_FINITE_THRESHOLD - 1n)).toBe('BOUNDED_ALLOWANCE');
    });

    it('C5: Correctly classifies standard finite allowance (50 tokens) as BOUNDED_ALLOWANCE', () => {
      expect(classifyAllowance(parseUnits('50', 6))).toBe('BOUNDED_ALLOWANCE');
    });

    it('C6: Correctly classifies zero allowance as BOUNDED_ALLOWANCE', () => {
      expect(classifyAllowance(0n)).toBe('BOUNDED_ALLOWANCE');
    });
  });

  describe('Existing Regression Tests (AA1 - AA4)', () => {
    it('AA1: Analyzes standard bounded allowance within policy ceiling', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('50', 6), // 50 USDC
        currentAllowanceRaw: 0n,
        policy: TEST_POLICY,
        knownContacts: TEST_POLICY.trustedContacts,
      });

      expect(exposure.tokenSymbol).toBe('USDC');
      expect(exposure.spenderName).toBe('uniswap');
      expect(exposure.isUnlimited).toBe(false);
      expect(exposure.classification).toBe('BOUNDED_ALLOWANCE');
      expect(exposure.exceedsPolicyCap).toBe(false);
      expect(exposure.proposedAllowanceFormatted).toBe('50');
      expect(exposure.deltaFormatted).toBe('+50');
      expect(exposure.permissionExplanation).toContain('withdraw up to 50 USDC');
      expect(exposure.permissionExplanation).toContain('No tokens will leave your wallet');
    });

    it('AA2: Identifies proposed allowance exceeding policy spending cap', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('500', 6), // 500 USDC > 100 cap
        currentAllowanceRaw: 0n,
        policy: TEST_POLICY,
      });

      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.riskSummary).toContain('HIGH EXPOSURE');
    });

    it('AA3: Identifies unlimited allowance request (MaxUint256)', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: DAI,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: EXACT_MAX_UINT256,
        currentAllowanceRaw: parseUnits('10', 18),
        policy: TEST_POLICY,
      });

      expect(exposure.tokenSymbol).toBe('DAI');
      expect(exposure.isUnlimited).toBe(true);
      expect(exposure.classification).toBe('EXACT_UNLIMITED_ALLOWANCE');
      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.proposedAllowanceFormatted).toContain('UNLIMITED (2^256-1)');
      expect(exposure.deltaFormatted).toBe('+UNLIMITED');
      expect(exposure.permissionExplanation).toContain('permanent permission to withdraw any amount');
      expect(exposure.riskSummary).toContain('CRITICAL EXPOSURE');
    });

    it('AA4: Correctly calculates negative delta when decreasing allowance', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('20', 6), // decrease to 20
        currentAllowanceRaw: parseUnits('50', 6),  // from 50
        policy: TEST_POLICY,
      });

      expect(exposure.deltaFormatted).toBe('-30');
      expect(exposure.riskSummary).toContain('Decreasing existing allowance from 50 to 20 USDC');
    });
  });

  describe('Priority D: Token-Specific Approval Policies', () => {
    it('D1: Native ETH limit (1.0 ETH) is NOT applied as USDC limit (100 USDC policy enforced)', () => {
      // 50 USDC is allowed even though 50 > 1.0 (if ETH cap were mistakenly reused)
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('50', 6),
        policy: TEST_POLICY,
      });

      expect(exposure.exceedsPolicyCap).toBe(false);
      expect(exposure.policySpendingCapFormatted).toBe('100 USDC');
    });

    it('D2: Enforces USDC-specific approval ceiling (exceeding 100 USDC is blocked)', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('101', 6),
        policy: TEST_POLICY,
      });

      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.policySpendingCapFormatted).toBe('100 USDC');
      expect(exposure.riskSummary).toContain('exceeds configured token ceiling');
    });

    it('D3: Enforces DAI-specific approval ceiling with 18 decimals', () => {
      const allowedDai = analyzeApprovalExposure({
        tokenAddress: DAI,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('99', 18),
        policy: TEST_POLICY,
      });
      expect(allowedDai.exceedsPolicyCap).toBe(false);
      expect(allowedDai.policySpendingCapFormatted).toBe('100 DAI');

      const exceededDai = analyzeApprovalExposure({
        tokenAddress: DAI,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: parseUnits('150', 18),
        policy: TEST_POLICY,
      });
      expect(exceededDai.exceedsPolicyCap).toBe(true);
    });

    it('D4: Blocks unauthorized spender even when amount is within cap', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNKNOWN_SPENDER, // not in allowedSpenders
        proposedAllowanceRaw: parseUnits('10', 6),
        policy: TEST_POLICY,
      });

      expect(exposure.isSpenderAllowed).toBe(false);
      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.riskSummary).toContain('UNAUTHORIZED SPENDER');
    });

    it('D5: Fails closed when token has no approval policy configured', () => {
      const exposure = analyzeApprovalExposure({
        tokenAddress: UNKNOWN_TOKEN,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: 1000n,
        policy: TEST_POLICY,
      });

      expect(exposure.hasTokenPolicy).toBe(false);
      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.riskSummary).toContain('POLICY MISSING');
    });

    it('D6: Preserves token decimal precision differences (USDC 6 decimals vs DAI 18 decimals)', () => {
      const usdc50 = parseUnits('50', 6);   // 50_000_000n
      const dai50 = parseUnits('50', 18);   // 50_000_000_000_000_000_000n

      expect(usdc50).toBe(50000000n);
      expect(dai50).toBe(50000000000000000000n);
      expect(dai50).not.toBe(usdc50);

      const expUsdc = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: usdc50,
        policy: TEST_POLICY,
      });
      expect(expUsdc.proposedAllowanceFormatted).toBe('50');

      const expDai = analyzeApprovalExposure({
        tokenAddress: DAI,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: dai50,
        policy: TEST_POLICY,
      });
      expect(expDai.proposedAllowanceFormatted).toBe('50');
    });

    it('D7: Blocks extremely large finite allowance when exceeding token policy cap', () => {
      const extremelyLargeFinite = EXTREMELY_LARGE_FINITE_THRESHOLD + 1000n;
      const exposure = analyzeApprovalExposure({
        tokenAddress: USDC,
        spenderAddress: UNISWAP,
        proposedAllowanceRaw: extremelyLargeFinite,
        policy: TEST_POLICY,
      });

      expect(exposure.classification).toBe('EXTREMELY_LARGE_FINITE_ALLOWANCE');
      expect(exposure.isUnlimited).toBe(false);
      expect(exposure.exceedsPolicyCap).toBe(true);
      expect(exposure.proposedAllowanceFormatted).toContain('EXTREMELY LARGE FINITE');
    });
  });
});
