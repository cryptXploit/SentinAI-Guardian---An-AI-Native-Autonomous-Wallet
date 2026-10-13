export interface SecurityFixture {
  scenarioId: string;
  title: string;
  description: string;
  isControlledScenario: boolean;
  intent: {
    action: 'TRANSFER' | 'APPROVE' | 'SWAP' | 'QUERY_BALANCE' | 'QUERY_NETWORK' | 'UNKNOWN';
    asset: string;
    amount: string;
    recipientAlias: string;
  };
  resolvedRecipientOrSpender: string;
  candidate: {
    to: string;
    value: string;
    data: string;
    chainId: number;
  };
  simulationSuccess?: boolean;
  simulationError?: string;
  riskProviderStatus?: string;
  expectedVerdict: 'POLICY_COMPLIANT' | 'BLOCKED' | 'SUSPICIOUS';
  expectedMismatches: string[];
}

import safeNativeTransfer from './safe-native-transfer.json';
import safeBoundedApproval from './safe-bounded-approval.json';
import excessiveFiniteApproval from './excessive-finite-approval.json';
import unlimitedApproval from './unlimited-approval.json';
import wrongSpender from './wrong-spender.json';
import wrongTokenContract from './wrong-token-contract.json';
import wrongTokenRecipient from './wrong-token-recipient.json';
import wrongTokenAmount from './wrong-token-amount.json';
import unsupportedCalldata from './unsupported-calldata.json';
import unexpectedNativeValue from './unexpected-native-value.json';
import wrongNetwork from './wrong-network.json';
import simulationUnavailable from './simulation-unavailable.json';
import riskProviderUnavailable from './risk-provider-unavailable.json';
import unknownContract from './unknown-contract.json';
import promptInjectionAttempt from './prompt-injection-attempt.json';

export const ALL_SECURITY_FIXTURES: SecurityFixture[] = [
  safeNativeTransfer as SecurityFixture,
  safeBoundedApproval as SecurityFixture,
  excessiveFiniteApproval as SecurityFixture,
  unlimitedApproval as SecurityFixture,
  wrongSpender as SecurityFixture,
  wrongTokenContract as SecurityFixture,
  wrongTokenRecipient as SecurityFixture,
  wrongTokenAmount as SecurityFixture,
  unsupportedCalldata as SecurityFixture,
  unexpectedNativeValue as SecurityFixture,
  wrongNetwork as SecurityFixture,
  simulationUnavailable as SecurityFixture,
  riskProviderUnavailable as SecurityFixture,
  unknownContract as SecurityFixture,
  promptInjectionAttempt as SecurityFixture,
];

export function getFixtureById(scenarioId: string): SecurityFixture | undefined {
  return ALL_SECURITY_FIXTURES.find((f) => f.scenarioId === scenarioId);
}
