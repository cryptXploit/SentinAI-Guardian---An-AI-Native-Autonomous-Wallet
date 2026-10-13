import { describe, it, expect } from 'vitest';
import { parseUnits } from 'viem';
import { analyzeApprovalExposure } from '../approval-analyzer';
import { SUPPORTED_TOKENS } from '../../transaction/builder';
import { UserPolicy } from '../../domain/schemas';

const USDC = SUPPORTED_TOKENS.USDC.address;
const DAI = SUPPORTED_TOKENS.DAI.address;
const UNISWAP = '0x1111111254fb6c44bac0bed2854e76f90643097d';

const TEST_POLICY: UserPolicy = {
  maxTransferAmountETH: '100', // 100 units spending ceiling
  allowUnlimitedApproval: false,
  trustedContacts: {
    uniswap: UNISWAP,
  },
};

describe('R7 Approval Exposure Analyzer Suite', () => {
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
    const maxUint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const exposure = analyzeApprovalExposure({
      tokenAddress: DAI,
      spenderAddress: UNISWAP,
      proposedAllowanceRaw: maxUint,
      currentAllowanceRaw: parseUnits('10', 18),
      policy: TEST_POLICY,
    });

    expect(exposure.tokenSymbol).toBe('DAI');
    expect(exposure.isUnlimited).toBe(true);
    expect(exposure.exceedsPolicyCap).toBe(true);
    expect(exposure.proposedAllowanceFormatted).toContain('UNLIMITED');
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
