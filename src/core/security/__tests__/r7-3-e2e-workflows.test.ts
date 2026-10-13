import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  prepareTransactionIntent,
  testSecurityFixtureAction,
  authorizeAndExecute,
} from '@/app/actions/orchestrator';
import {
  storeProposal,
  getProposalStatus,
  retrieveProposal,
  _resetProposalsForTesting,
} from '../proposal';
import * as auth from '../auth';
import * as rpcService from '../../web3/rpc-service';
import * as controller from '../../execution/controller';
import { BroadcastError } from '../../execution/controller';
import { generateIIP } from '../iip';

describe('Milestone R7.3 — Phase 7: End-to-End Demonstration Workflows (Workflows A - E)', () => {
  const operatorUserId = 'e2e-operator-session';

  beforeEach(() => {
    _resetProposalsForTesting();
    vi.restoreAllMocks();

    process.env.AGENT_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
    process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test';

    // Mock authenticated operator session
    vi.spyOn(auth, 'verifySession').mockResolvedValue({
      userId: operatorUserId,
      sessionId: 'session-e2e-xyz',
      expiresAt: Date.now() + 3600000,
    });
  });

  // ─── Workflow A — Safe Read-Only Wallet Query ──────────────────────────────
  it('Workflow A: Safe read-only wallet query routes directly without creating proposal or touching signer', async () => {
    // Mock RPC overview
    vi.spyOn(rpcService, 'verifySepoliaConnection').mockResolvedValue({
      network: 'Sepolia',
      chainId: 11155111,
      status: 'CONNECTED',
      latestBlock: 11905000n,
      timestamp: new Date().toISOString(),
      rpcUrl: 'https://eth-sepolia.test.com',
    });
    vi.spyOn(rpcService, 'getNativeBalance').mockResolvedValue({
      raw: 500000000000000000n,
      formatted: '0.5000',
    });

    const result = await prepareTransactionIntent('Show my Sepolia wallet balance');

    // Expected behavior:
    // 1. isQuery is true
    expect(result.success).toBe(true);
    expect(result.isQuery).toBe(true);
    // 2. QueryResult contains balance summary
    expect(result.queryResult).toBeDefined();
    expect(result.queryResult?.action).toBe('QUERY_BALANCE');
    expect(result.queryResult?.overview).toBeDefined();
    // 3. NO proposal is created
    expect(result.proposalId).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  // ─── Workflow B — Malicious Unlimited Approval ─────────────────────────────
  it('Workflow B: Malicious unlimited approval detects MaxUint256, blocks policy, and yields non-executable result', async () => {
    // User tries to approve unlimited tokens
    const result = await prepareTransactionIntent('Approve unlimited DAI for uniswap');

    // Expected behavior:
    // 1. Transaction preparation fails / is blocked by policy
    expect(result.success).toBe(false);
    // 2. Proposal is created with non-executable flag
    expect(result.proposalId).toBeDefined();
    const record = retrieveProposal(result.proposalId!);
    expect(record?.isExecutable).toBe(false);

    // 3. Analysis detects unlimited approval
    expect(result.analysis?.mismatches).toContain('UNLIMITED_APPROVAL_REQUEST');
    expect(result.analysis?.canExecute).toBe(false);

    // 4. Security explanation is attached
    expect(result.explanation).toBeDefined();
    expect(result.explanation?.explanationText).toBeDefined();

    // 5. Attempting to execute throws error before signing
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
    await expect(authorizeAndExecute(result.proposalId!)).rejects.toThrow(
      /NON_EXECUTABLE_PROPOSAL|UNAUTHORIZED_EXECUTION/
    );
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Workflow C — Intent / Calldata Mismatch ──────────────────────────────
  it('Workflow C: Tampered candidate calldata detects semantic mismatch and halts before signing', async () => {
    // Use controlled fixture 'wrong-spender'
    const result = await testSecurityFixtureAction('wrong-spender');

    expect(result.success).toBe(false);
    expect(result.analysis?.status).toBe('BLOCKED');
    expect(result.analysis?.mismatches).toContain('SPENDER_MISMATCH');

    // Blocked proposal cannot execute
    const broadcastSpy = vi.spyOn(controller, 'broadcastTransaction');
    await expect(authorizeAndExecute(result.proposalId!)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED/
    );
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  // ─── Workflow D — Controlled Security Fixture ─────────────────────────────
  it('Workflow D: Controlled security fixture renders findings, demo provenance, and rejects authorization', async () => {
    const result = await testSecurityFixtureAction('unlimited-approval');

    expect(result.isDemo).toBe(true);
    expect(result.provenance).toBe('SECURITY_FIXTURE');
    expect(result.analysis?.status).toBe('BLOCKED');
    expect(result.analysis?.findings.length).toBeGreaterThan(0);

    // Verification that proposal in DB is strictly non-executable
    const record = retrieveProposal(result.proposalId!);
    expect(record?.provenance).toBe('SECURITY_FIXTURE');
    expect(record?.isExecutable).toBe(false);

    // Direct authorization must fail
    await expect(authorizeAndExecute(result.proposalId!)).rejects.toThrow(
      /FIXTURE_EXECUTION_BLOCKED/
    );
  });

  // ─── Workflow E — Ambiguous Network Submission ────────────────────────────
  it('Workflow E: Ambiguous broadcast timeout sets EXECUTION_UNKNOWN, retains lock, and rejects duplicate request', async () => {
    // Fully mocked execution controller to prevent real blockchain broadcast
    vi.spyOn(controller, 'broadcastTransaction').mockRejectedValue(
      new BroadcastError(
        'AMBIGUOUS_NETWORK_TIMEOUT: Socket closed after 15000ms waiting for node ack',
        'BROADCAST_OUTCOME_UNKNOWN'
      )
    );

    // Prepare valid executable proposal
    const iip = generateIIP(
      { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
      { to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', value: 50000000000000000n, chainId: 11155111 },
      { status: 'ALLOW', reason: 'valid transfer' },
      { success: true, timestamp: new Date().toISOString() }
    );
    const proposalId = storeProposal(iip, operatorUserId, 60000, 'LIVE_VERIFIED', true);

    // First attempt times out ambiguously
    const outcome = await authorizeAndExecute(proposalId);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain('BROADCAST_UNCERTAIN');

    // Status MUST be EXECUTION_UNKNOWN
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');

    // Restart simulation: Re-invoking authorization on same proposal MUST BE REJECTED
    await expect(authorizeAndExecute(proposalId)).rejects.toThrow(
      /DUPLICATE_EXECUTION/
    );

    // Status is still locked in EXECUTION_UNKNOWN
    expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
  });
});
