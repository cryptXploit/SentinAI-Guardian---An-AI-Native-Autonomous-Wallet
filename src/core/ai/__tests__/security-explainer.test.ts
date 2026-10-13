import { describe, it, expect } from 'vitest';
import {
  explainSecurityFindings,
  generateDeterministicExplanation,
} from '../security-explainer';
import { TransactionAnalysisResult } from '../../security/transaction-analyzer';

describe('R7 Security Explainer Suite', () => {
  const mockBlockedAnalysis: TransactionAnalysisResult = {
    status: 'BLOCKED',
    operationType: 'ERC20_APPROVE',
    decodedAction: {
      method: 'approve(address,uint256)',
      targetContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      recipientOrSpender: '0x1111111254fb6c44bac0bed2854e76f90643097d',
      rawAmount: '1000000000000',
      formattedAmount: '1,000,000',
      nativeValueWei: '0',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      isUnlimitedApproval: false,
    },
    expectedAction: {
      action: 'APPROVE',
      asset: 'USDC',
      amount: '50',
      resolvedRecipient: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    },
    mismatches: ['APPROVAL_AMOUNT_MISMATCH'],
    findings: [
      {
        code: 'APPROVAL_AMOUNT_MISMATCH',
        severity: 'CRITICAL',
        category: 'INTENT_MISMATCH',
        title: 'Approval Amount Mismatch (Excessive Allowance)',
        explanation: 'Authorized allowance was 50 USDC, but the compiled contract call requests 1,000,000 USDC.',
        evidence: {},
        source: 'DETERMINISTIC_ANALYZER',
        affectsExecution: true,
      },
    ],
    canExecute: false,
    timestamp: new Date().toISOString(),
  };

  it('SE1: Generates deterministic explanation based on finding codes when AI is unconfigured', async () => {
    const result = await explainSecurityFindings({
      analysis: mockBlockedAnalysis,
      apiKey: '', // No API key -> deterministic fallback
    });

    expect(result.source).toBe('DETERMINISTIC_RULES');
    expect(result.explanationText).toContain('Transaction blocked');
    expect(result.explanationText).toContain('1,000,000 USDC');
    expect(result.recommendedAction).toContain('Do not authorize');
    expect(result.keyPoints.length).toBeGreaterThan(0);
  });

  it('SE2: INVARIANT - AI explanation CANNOT modify canExecute or analysis status', async () => {
    // Clone analysis to check immutability
    const initialStatus = mockBlockedAnalysis.status;
    const initialCanExecute = mockBlockedAnalysis.canExecute;

    await explainSecurityFindings({
      analysis: mockBlockedAnalysis,
      apiKey: '',
    });

    // Verify analysis object was not mutated
    expect(mockBlockedAnalysis.status).toBe(initialStatus);
    expect(mockBlockedAnalysis.canExecute).toBe(initialCanExecute);
    expect(mockBlockedAnalysis.canExecute).toBe(false);
  });

  it('SE3: Explains safe verified transaction clearly', () => {
    const safeAnalysis: TransactionAnalysisResult = {
      status: 'POLICY_COMPLIANT',
      operationType: 'NATIVE_TRANSFER',
      decodedAction: {
        method: 'native_transfer',
        targetContract: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        recipientOrSpender: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        rawAmount: '50000000000000000',
        formattedAmount: '0.05',
        nativeValueWei: '50000000000000000',
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
      },
      expectedAction: {
        action: 'TRANSFER',
        asset: 'ETH',
        amount: '0.05',
        resolvedRecipient: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
      mismatches: [],
      findings: [],
      canExecute: true,
      timestamp: new Date().toISOString(),
    };

    const explanation = generateDeterministicExplanation(safeAnalysis);
    expect(explanation.explanationText).toContain('Transaction verified');
    expect(explanation.recommendedAction).toContain('Proceed with explicit operator confirmation');
  });
});
