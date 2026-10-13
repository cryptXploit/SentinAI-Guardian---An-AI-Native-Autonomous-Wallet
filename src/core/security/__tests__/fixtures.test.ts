import { describe, it, expect } from 'vitest';
import { ALL_SECURITY_FIXTURES } from '../../../../fixtures/security';
import { analyzeTransaction } from '../transaction-analyzer';
import { evaluatePolicy } from '../../policy/engine';
import { UserPolicy, ParsedIntent } from '../../domain/schemas';

const TEST_POLICY: UserPolicy = {
  maxTransferAmountETH: '1.0',
  allowUnlimitedApproval: false,
  trustedContacts: {
    alice: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    bob: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    uniswap: '0x1111111254fb6c44bac0bed2854e76f90643097d',
  },
};

describe('R7 Controlled Security Fixtures Suite (15 Scenarios)', () => {
  it('F0: Confirms exactly 15 fixtures are loaded', () => {
    expect(ALL_SECURITY_FIXTURES).toHaveLength(15);
  });

  ALL_SECURITY_FIXTURES.forEach((fixture) => {
    it(`Fixture [${fixture.scenarioId}]: ${fixture.title}`, () => {
      const candidate = {
        to: fixture.candidate.to,
        value: BigInt(fixture.candidate.value || '0'),
        data: (fixture.candidate.data || '0x') as `0x${string}`,
        chainId: fixture.candidate.chainId,
      };

      const parsedIntent: ParsedIntent = {
        action: fixture.intent.action,
        asset: fixture.intent.asset,
        amount: fixture.intent.amount,
        recipientAlias: fixture.intent.recipientAlias,
      };

      const analysis = analyzeTransaction({
        intent: parsedIntent,
        resolvedRecipientOrSpender: fixture.resolvedRecipientOrSpender,
        candidate,
        policy: TEST_POLICY,
        simulationSuccess: fixture.simulationSuccess !== false,
        simulationError: fixture.simulationError,
      });

      const policyDecision = evaluatePolicy(parsedIntent, candidate, TEST_POLICY);
      const isBlocked = !analysis.canExecute || policyDecision.status !== 'ALLOW';
      const actualVerdict = isBlocked ? 'BLOCKED' : 'POLICY_COMPLIANT';

      expect(actualVerdict).toBe(fixture.expectedVerdict);

      // Verify expected mismatches if any
      for (const expectedMismatch of fixture.expectedMismatches) {
        if (expectedMismatch === 'POLICY_SPENDING_LIMIT_EXCEEDED') {
          expect(policyDecision.status).toBe('BLOCKED');
        } else {
          expect(analysis.mismatches).toContain(expectedMismatch);
        }
      }
    });
  });
});
