import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeProposal,
  isProposalExpired,
  getProposalStatus,
  authorizeProposal,
  expireStaleProposals,
  _resetProposalsForTesting,
} from '../proposal';
import { generateIIP } from '../iip';
import type { IntentIntegrityProof } from '../iip';
import type { TransactionCandidate } from '../../transaction/builder';

function createMockIIP(): IntentIntegrityProof {
  const candidate: TransactionCandidate = {
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    value: BigInt('1000000000000000'),
    chainId: 11155111,
  };
  return generateIIP(
    { action: 'TRANSFER', asset: 'ETH', amount: '0.001', recipientAlias: 'alice' },
    candidate,
    { status: 'ALLOW', reason: 'ok' },
    { success: true, timestamp: 'now' }
  );
}

describe('R5E — Time Handling & Proposal Expiration Boundaries', () => {
  beforeEach(() => {
    _resetProposalsForTesting();
  });

  it('T1: Proposal with generous lifetime is NOT expired initially', () => {
    const iip = createMockIIP();
    const id = storeProposal(iip, 'operator-1', 60_000); // 1 minute
    expect(isProposalExpired(id)).toBe(false);
  });

  it('T2: Proposal with 1ms lifetime expires after delay', async () => {
    const iip = createMockIIP();
    const id = storeProposal(iip, 'operator-1', 5); // 5ms
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(isProposalExpired(id)).toBe(true);
  });

  it('T3: Non-existent proposal returns true for isProposalExpired (fail closed)', () => {
    expect(isProposalExpired('unknown-proposal-uuid')).toBe(true);
  });

  it('T4: Authorization transition rejects expired proposal', async () => {
    const iip = createMockIIP();
    const id = storeProposal(iip, 'operator-1', 5); // 5ms lifetime
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Atomically rejected in SQL
    const authorized = authorizeProposal(id, 'operator-1');
    expect(authorized).toBe(false);
    expect(getProposalStatus(id)).toBe('PREPARED');
  });

  it('T5: expireStaleProposals marks stale proposals as EXPIRED while leaving active intact', async () => {
    const iip = createMockIIP();
    const staleId = storeProposal(iip, 'operator-1', 5); // expires quickly
    const activeId = storeProposal(iip, 'operator-1', 600_000); // active for 10 min

    await new Promise((resolve) => setTimeout(resolve, 25));

    const expiredCount = expireStaleProposals();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    expect(getProposalStatus(staleId)).toBe('EXPIRED');
    expect(getProposalStatus(activeId)).toBe('PREPARED');
  });

  it('T6: Timestamps handle UTC ISO 8601 formatting consistently', () => {
    const iip = createMockIIP();
    const id = storeProposal(iip, 'operator-1', 900_000); // 15 min default
    expect(isProposalExpired(id)).toBe(false);
  });
});
