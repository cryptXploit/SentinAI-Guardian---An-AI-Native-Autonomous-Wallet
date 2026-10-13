import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeProposal,
  storeFixtureProposal,
  retrieveProposal,
  authorizeProposal,
  getProposalStatus,
  _resetProposalsForTesting,
  _getDb,
} from '../proposal';
import { generateIIP } from '../iip';
import type { IntentIntegrityProof } from '../iip';
import {
  testSecurityFixtureAction,
  authorizeAndExecute,
} from '@/app/actions/orchestrator';
import * as auth from '../auth';
import * as controller from '../../execution/controller';

describe('Milestone R7.3 — Phase 2: Fixture Execution Regression Suite (8 Attack Vectors)', () => {
  const primaryOperatorId = 'operator-primary-session';
  const secondaryAttackerId = 'operator-unauthorized-attacker';

  beforeEach(() => {
    _resetProposalsForTesting();
    vi.restoreAllMocks();

    // Default mock: primary operator session
    vi.spyOn(auth, 'verifySession').mockResolvedValue({
      userId: primaryOperatorId,
      sessionId: 'session-primary-abc',
      expiresAt: Date.now() + 3600000,
    });
  });

  function createValidIIP(isAllowed: boolean = true): IntentIntegrityProof {
    return generateIIP(
      { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
      { to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', value: BigInt('50000000000000000'), chainId: 11155111 },
      { status: isAllowed ? 'ALLOW' : 'BLOCKED', reason: isAllowed ? 'within cap' : 'exceeds cap' },
      { success: isAllowed, timestamp: new Date().toISOString() }
    );
  }

  // ─── Vector 1: Normal UI Path ─────────────────────────────────────────────
  it('Vector 1: Normal UI path confirms proposal is flagged isDemo=true, provenance=SECURITY_FIXTURE, and non-executable', async () => {
    const res = await testSecurityFixtureAction('unlimited-approval');
    expect(res.isDemo).toBe(true);
    expect(res.provenance).toBe('SECURITY_FIXTURE');
    expect(res.proposalId).toBeDefined();

    // Verify database record reflects non-executable demo status
    const record = retrieveProposal(res.proposalId!);
    expect(record).toBeDefined();
    expect(record?.provenance).toBe('SECURITY_FIXTURE');
    expect(record?.isExecutable).toBe(false);
  });

  // ─── Vector 2: Direct Server Action Invocation ────────────────────────────
  it('Vector 2: Direct Server Action invocation rejects fixture execution with FIXTURE_EXECUTION_BLOCKED', async () => {
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
    const res = await testSecurityFixtureAction('wrong-spender');
    const fixtureProposalId = res.proposalId!;

    await expect(authorizeAndExecute(fixtureProposalId)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED/
    );

    // Invariant: Signer or broadcast controller is never invoked
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Vector 3: Forged Proposal ID ─────────────────────────────────────────
  it('Vector 3: Forged proposal ID rejects execution with UNKNOWN_PROPOSAL', async () => {
    const forgedId = 'e9999999-ffff-4444-aaaa-0123456789ab';
    await expect(authorizeAndExecute(forgedId)).rejects.toThrow(/UNKNOWN_PROPOSAL/);
  });

  // ─── Vector 4: Replayed Request ───────────────────────────────────────────
  it('Vector 4: Replayed authorization request on already-processing proposal rejects with DUPLICATE_EXECUTION', async () => {
    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
    process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test';

    // Mock successful broadcast and receipt
    vi.spyOn(controller, 'broadcastTransaction').mockResolvedValue({
      hash: '0xhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      outcome: 'BROADCAST_SUBMITTED',
    });
    vi.spyOn(controller, 'waitForReceipt').mockResolvedValue({
      status: 'success',
      blockNumber: 5000000n,
    });

    const iip = createValidIIP(true);
    const liveId = storeProposal(iip, primaryOperatorId, 60000, 'LIVE_VERIFIED', true);

    // First execution succeeds
    const firstExec = await authorizeAndExecute(liveId);
    expect(firstExec.success).toBe(true);
    expect(getProposalStatus(liveId)).toBe('CONFIRMED');

    // Second execution (replay attack) must fail immediately
    await expect(authorizeAndExecute(liveId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
  });

  // ─── Vector 5: Fixture Marked Safe by Security Analyzer ───────────────────
  it('Vector 5: A fixture marked as safe by security analyzer CANNOT execute through authorizeAndExecute', async () => {
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');

    // safe-bounded-approval is designed to pass policy checks
    const res = await testSecurityFixtureAction('safe-bounded-approval');
    expect(res.success).toBe(true); // Analysis passed
    expect(res.analysis?.canExecute).toBe(true);

    const fixtureId = res.proposalId!;

    // Even though it is semantically safe, execution MUST be blocked because it is a fixture
    await expect(authorizeAndExecute(fixtureId)).rejects.toThrow(/FIXTURE_EXECUTION_BLOCKED/);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Vector 6: Expired Fixture ────────────────────────────────────────────
  it('Vector 6: Expired fixture rejects execution prior to signing', async () => {
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
    const iip = createValidIIP(true);

    // Store fixture with negative lifetime so it is immediately expired
    const expiredFixtureId = storeFixtureProposal(iip, primaryOperatorId, -5000);

    await expect(authorizeAndExecute(expiredFixtureId)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED/
    );
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Vector 7: Another Authenticated User's Fixture ───────────────────────
  it("Vector 7: Another authenticated user's fixture rejects execution prior to signing", async () => {
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');

    // Create fixture owned by primary operator
    const res = await testSecurityFixtureAction('wrong-token-contract');
    const fixtureId = res.proposalId!;

    // Switch session to another authenticated operator
    vi.spyOn(auth, 'verifySession').mockResolvedValue({
      userId: secondaryAttackerId,
      sessionId: 'session-attacker-xyz',
      expiresAt: Date.now() + 3600000,
    });

    // Execution must be rejected (either fixture gate or ownership gate)
    await expect(authorizeAndExecute(fixtureId)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED|OWNERSHIP_VIOLATION/
    );
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Vector 8: Database Row with Inconsistent Provenance/Executability ────
  it('Vector 8: Database row with intentionally corrupted/inconsistent fields rejects execution', async () => {
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
    const db = _getDb();
    const iip = createValidIIP(true);
    const iipJson = JSON.stringify(iip, (k, v) => (typeof v === 'bigint' ? v.toString() : v));

    // Case 8A: SECURITY_FIXTURE with is_executable manually set to 1 in DB
    const idTampered1 = 'tampered-fixture-exec-1';
    db.prepare(`
      INSERT INTO proposals (id, owner_id, digest, iip_data, status, provenance, is_executable, expires_at)
      VALUES (?, ?, ?, ?, 'PREPARED', 'SECURITY_FIXTURE', 1, datetime('now', '+1 hour'))
    `).run(idTampered1, primaryOperatorId, iip.proofDigest, iipJson);

    // Case 8B: UNVERIFIED with is_executable manually set to 1 in DB
    const idTampered2 = 'tampered-unverified-exec-1';
    db.prepare(`
      INSERT INTO proposals (id, owner_id, digest, iip_data, status, provenance, is_executable, expires_at)
      VALUES (?, ?, ?, ?, 'PREPARED', 'UNVERIFIED', 1, datetime('now', '+1 hour'))
    `).run(idTampered2, primaryOperatorId, iip.proofDigest, iipJson);

    // Case 8C: LIVE_VERIFIED with is_executable manually set to 0 in DB
    const idTampered3 = 'tampered-live-exec-0';
    db.prepare(`
      INSERT INTO proposals (id, owner_id, digest, iip_data, status, provenance, is_executable, expires_at)
      VALUES (?, ?, ?, ?, 'PREPARED', 'LIVE_VERIFIED', 0, datetime('now', '+1 hour'))
    `).run(idTampered3, primaryOperatorId, iip.proofDigest, iipJson);

    // 8A must fail
    await expect(authorizeAndExecute(idTampered1)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED|NON_EXECUTABLE_PROPOSAL/
    );

    // 8B must fail
    await expect(authorizeAndExecute(idTampered2)).rejects.toThrow(
      /NON_EXECUTABLE_PROPOSAL/
    );

    // 8C must fail
    await expect(authorizeAndExecute(idTampered3)).rejects.toThrow(
      /NON_EXECUTABLE_PROPOSAL/
    );

    // Database SQL authorization also rejects 8A, 8B, 8C directly
    expect(authorizeProposal(idTampered1, primaryOperatorId)).toBe(false);
    expect(authorizeProposal(idTampered2, primaryOperatorId)).toBe(false);
    expect(authorizeProposal(idTampered3, primaryOperatorId)).toBe(false);

    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});
