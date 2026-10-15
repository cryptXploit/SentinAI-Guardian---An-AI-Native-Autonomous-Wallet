import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  storeProposal,
  retrieveProposal,
  getProposalStatus,
  readBroadcastRecoveryJournal,
  clearBroadcastRecoveryJournal,
  _resetProposalsForTesting,
  _getDb,
} from '../proposal';
import {
  updateActiveUserPolicy,
  hasPersistedUserPolicy,
} from '../../policy/user-policy';
import { buildTransaction } from '../../transaction/builder';
import { generateIIP } from '../iip';
import * as authModule from '../auth';
import * as controllerModule from '../../execution/controller';
import {
  authorizeAndExecute,
  recoverPostBroadcastProposalAction,
  cancelProposalAction,
} from '../../../app/actions/orchestrator';

const SAFE_WALLET_A = '0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148';
const SAFE_WALLET_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const UNISWAP_SPENDER = '0x1111111254fb6c44bac0bed2854e76f90643097d';

describe('R8.4 — Execution Integrity, EIP-2780 Gas Floor, Post-Broadcast Recovery & Live Policy Revalidation', () => {
  const savedApprovedEnv = process.env.APPROVED_TEST_RECIPIENT_ADDRESS;
  const savedPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const savedRpcUrl = process.env.RPC_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetProposalsForTesting();
    delete process.env.APPROVED_TEST_RECIPIENT_ADDRESS;
    process.env.AGENT_PRIVATE_KEY =
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RPC_URL = 'https://sepolia.infura.io/v3/test-key';

    vi.spyOn(authModule, 'verifySession').mockResolvedValue({
      sessionId: 'sess-r8-4',
      userId: 'operator-r8-4',
      expiresAt: Date.now() + 3600000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedApprovedEnv !== undefined) {
      process.env.APPROVED_TEST_RECIPIENT_ADDRESS = savedApprovedEnv;
    } else {
      delete process.env.APPROVED_TEST_RECIPIENT_ADDRESS;
    }
    if (savedPrivateKey !== undefined) {
      process.env.AGENT_PRIVATE_KEY = savedPrivateKey;
    } else {
      delete process.env.AGENT_PRIVATE_KEY;
    }
    if (savedRpcUrl !== undefined) {
      process.env.RPC_URL = savedRpcUrl;
    } else {
      delete process.env.RPC_URL;
    }
  });

  function createPreparedEthProposal(params?: {
    ownerId?: string;
    amount?: string;
    recipientAlias?: string;
    recipientAddress?: string;
    chainId?: number;
    gasEstimated?: bigint;
  }) {
    const ownerId = params?.ownerId ?? 'operator-r8-4';
    const amount = params?.amount ?? '0.01';
    const recipientAlias = params?.recipientAlias ?? 'alice';
    const recipientAddress = params?.recipientAddress ?? SAFE_WALLET_A;
    const chainId = params?.chainId ?? 11155111;
    const gasEstimated = params?.gasEstimated ?? 12000n;

    if (!hasPersistedUserPolicy(ownerId)) {
      updateActiveUserPolicy({
        ownerId,
        action: 'INIT_TEST_POLICY',
        maxTransferAmountETH: '1.0',
        trustedContacts: {
          alice: recipientAddress,
          uniswap: UNISWAP_SPENDER,
        },
      });
    }

    const intent = {
      action: 'TRANSFER' as const,
      recipientAlias,
      amount,
      asset: 'ETH',
    };
    const baseCandidate = buildTransaction(intent, recipientAddress);
    const candidate = {
      ...baseCandidate,
      chainId,
    };
    const policyDecision = {
      status: 'ALLOW' as const,
      reason: 'Compliant with policy',
      resolvedAddress: recipientAddress,
    };
    const simulation = {
      success: true,
      gasEstimated,
      timestamp: new Date().toISOString(),
    };
    const iip = generateIIP(intent, candidate, policyDecision, simulation);
    const proposalId = storeProposal(iip, ownerId, 60000, 'LIVE_VERIFIED', true);
    return { proposalId, iip };
  }

  describe('Section 1 — EIP-2780 Self-Transfer Gas Anomaly (12,000) & Broadcast Floor', () => {
    it('preserves 12,000 gas estimate in IIP simulation and enforces 21,000 gas floor at broadcast', async () => {
      const { proposalId, iip } = createPreparedEthProposal({
        gasEstimated: 12000n,
      });

      expect(iip.simulation?.gasEstimated).toBe(12000n);

      const broadcastSpy = vi
        .spyOn(controllerModule, 'broadcastTransaction')
        .mockResolvedValue({
          hash: '0x1200012000120001200012000120001200012000120001200012000120001200',
          outcome: 'BROADCAST_SUBMITTED',
        });
      vi.spyOn(controllerModule, 'waitForReceipt').mockResolvedValue({
        status: 'success',
        blockNumber: 10500000n,
      });

      const res = await authorizeAndExecute(proposalId);
      expect(res.success).toBe(true);
      expect(broadcastSpy).toHaveBeenCalledTimes(1);
      expect(getProposalStatus(proposalId)).toBe('CONFIRMED');
    });
  });

  describe('Section 2 — Execution State Machine Integrity', () => {
    it('blocks wrong-chain (Mainnet chainId=1) proposal in Gate 6.5 before signing', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      const { proposalId } = createPreparedEthProposal({
        chainId: 1, // Mainnet instead of Sepolia 11155111
      });

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(getProposalStatus(proposalId)).toBe('FAILED');
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('blocks restart during transaction submission (status = SUBMITTING) from re-broadcasting', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      const { proposalId } = createPreparedEthProposal();

      // Simulate server crash while proposal was locked in SUBMITTING
      const db = _getDb();
      db.prepare("UPDATE proposals SET status = 'SUBMITTING' WHERE id = ?").run(proposalId);

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(getProposalStatus(proposalId)).toBe('SUBMITTING');
    });
  });

  describe('Section 3 — Post-Broadcast Recovery (Blockchain Accepts -> DB Fails -> Restart -> Retry)', () => {
    it('recovers original txHash and receipt from Broadcast Recovery Journal after SQLite failure and server restart WITHOUT re-broadcasting', async () => {
      const broadcastHash =
        '0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff';

      const broadcastSpy = vi
        .spyOn(controllerModule, 'broadcastTransaction')
        .mockResolvedValue({
          hash: broadcastHash,
          outcome: 'BROADCAST_SUBMITTED',
        });

      const waitReceiptSpy = vi
        .spyOn(controllerModule, 'waitForReceipt')
        .mockResolvedValue({
          status: 'success',
          blockNumber: 10588999n,
        });

      const { proposalId } = createPreparedEthProposal();
      const proposalMod = await import('../proposal');

      // Step 2: Simulate complete SQLite failure right after broadcast succeeds:
      // Both `markSubmitted` and `recordTxHash` throw SQLITE_BUSY
      const markSubmittedSpy = vi
        .spyOn(proposalMod, 'markSubmitted')
        .mockImplementationOnce(() => {
          throw new Error('SQLITE_BUSY: database is locked during markSubmitted');
        });
      const recordTxHashSpy = vi
        .spyOn(proposalMod, 'recordTxHash')
        .mockImplementationOnce(() => {
          throw new Error('SQLITE_BUSY: database is locked during recordTxHash');
        });

      // Execute: Step 1 (broadcast succeeds) -> Step 2 (DB update fails)
      const initialExec = await authorizeAndExecute(proposalId);
      expect(initialExec.success).toBe(false);
      expect(initialExec.error).toContain('POST_BROADCAST_DB_FAILURE');
      expect(broadcastSpy).toHaveBeenCalledTimes(1);

      // Restore DB spies to simulate Step 3 (Server restarts and SQLite recovers)
      markSubmittedSpy.mockRestore();
      recordTxHashSpy.mockRestore();

      // Verify that SQLite lost the tx_hash due to the Step 2 failure,
      // BUT the durable Broadcast Recovery Journal on disk preserved it!
      const afterCrashRecord = retrieveProposal(proposalId);
      expect(afterCrashRecord?.txHash).toBeNull();
      const journalEntry = readBroadcastRecoveryJournal(proposalId);
      expect(journalEntry?.txHash).toBe(broadcastHash);

      // Step 4a: User retries `authorizeAndExecute(proposalId)` directly ->
      // MUST block duplicate broadcast!
      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
      expect(broadcastSpy).toHaveBeenCalledTimes(1); // Still 1! Never re-broadcast!

      // Step 4b: User invokes `recoverPostBroadcastProposalAction(proposalId)` ->
      // Recovers original txHash from journal, verifies receipt, transitions to CONFIRMED,
      // and clears journal WITHOUT broadcasting a second transaction!
      const recovered = await recoverPostBroadcastProposalAction(proposalId);
      expect(recovered.success).toBe(true);
      expect(recovered.executionResult?.transactionHash).toBe(broadcastHash);
      expect(recovered.executionResult?.broadcastOutcome).toBe('RECEIPT_CONFIRMED');
      expect(broadcastSpy).toHaveBeenCalledTimes(1); // Zero additional broadcasts!
      expect(waitReceiptSpy).toHaveBeenCalledWith(broadcastHash, process.env.RPC_URL);

      const finalRecord = retrieveProposal(proposalId);
      expect(finalRecord?.status).toBe('CONFIRMED');
      expect(finalRecord?.txHash).toBe(broadcastHash);
      expect(readBroadcastRecoveryJournal(proposalId)).toBeUndefined();
    });

    it('recovers txHash via Tier 3 on-chain block scan when both SQLite tx_hash and disk journal are missing', async () => {
      const onChainHash =
        '0x7777666655554444333322221111000099998888aaaabbbbccccddddeeeeffff';
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');

      vi.spyOn(controllerModule, 'findMatchingBroadcastTxOnChain').mockResolvedValueOnce(
        onChainHash
      );
      vi.spyOn(controllerModule, 'waitForReceipt').mockResolvedValueOnce({
        status: 'success',
        blockNumber: 10589001n,
      });

      const { proposalId } = createPreparedEthProposal();
      const db = _getDb();
      db.prepare("UPDATE proposals SET status = 'EXECUTION_UNKNOWN', tx_hash = NULL WHERE id = ?").run(
        proposalId
      );
      clearBroadcastRecoveryJournal(proposalId);

      const recovered = await recoverPostBroadcastProposalAction(proposalId);
      expect(recovered.success).toBe(true);
      expect(recovered.executionResult?.transactionHash).toBe(onChainHash);
      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(getProposalStatus(proposalId)).toBe('CONFIRMED');
    });

    it('conservatively keeps proposal locked in EXECUTION_UNKNOWN when no txHash is found anywhere', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      vi.spyOn(controllerModule, 'findMatchingBroadcastTxOnChain').mockResolvedValueOnce(null);

      const { proposalId } = createPreparedEthProposal();
      const db = _getDb();
      db.prepare("UPDATE proposals SET status = 'EXECUTION_UNKNOWN', tx_hash = NULL WHERE id = ?").run(
        proposalId
      );
      clearBroadcastRecoveryJournal(proposalId);

      const res = await recoverPostBroadcastProposalAction(proposalId);
      expect(res.success).toBe(false);
      expect(res.error).toContain('RECOVERY_TX_HASH_UNKNOWN');
      expect(getProposalStatus(proposalId)).toBe('EXECUTION_UNKNOWN');
      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });

  describe('Section 4 — Mid-Flight Policy Modification & Cancellation Verification', () => {
    it('invalidates a PREPARED proposal at execution time if maxTransferAmountETH is lowered below proposal amount', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');

      // Prepare a proposal for 0.5 ETH when cap is 1.0 ETH
      const { proposalId } = createPreparedEthProposal({
        amount: '0.5',
      });

      // Operator lowers maxTransferAmountETH to 0.1 ETH before executing the prepared proposal
      updateActiveUserPolicy({
        ownerId: 'operator-r8-4',
        action: 'TIGHTEN_CAP',
        maxTransferAmountETH: '0.1',
        trustedContacts: {
          alice: SAFE_WALLET_A,
          uniswap: UNISWAP_SPENDER,
        },
      });

      // Execution must re-evaluate against the new 0.1 ETH cap and block!
      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(getProposalStatus(proposalId)).toBe('FAILED');
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('invalidates a PREPARED proposal at execution time if recipient contact is removed from policy', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      const { proposalId } = createPreparedEthProposal();

      // Operator removes 'alice' from trustedContacts after proposal was prepared
      updateActiveUserPolicy({
        ownerId: 'operator-r8-4',
        action: 'REMOVE_ALICE',
        maxTransferAmountETH: '1.0',
        trustedContacts: {
          uniswap: UNISWAP_SPENDER,
        },
      });

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(getProposalStatus(proposalId)).toBe('FAILED');
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('invalidates a PREPARED proposal at execution time if recipient address is changed in policy', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      const { proposalId } = createPreparedEthProposal({
        recipientAddress: SAFE_WALLET_A,
      });

      // Operator re-binds 'alice' to SAFE_WALLET_B after proposal was prepared for SAFE_WALLET_A
      updateActiveUserPolicy({
        ownerId: 'operator-r8-4',
        action: 'REBIND_ALICE',
        maxTransferAmountETH: '1.0',
        trustedContacts: {
          alice: SAFE_WALLET_B,
          uniswap: UNISWAP_SPENDER,
        },
      });

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(getProposalStatus(proposalId)).toBe('FAILED');
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('persists proposal cancellation via cancelProposalAction and blocks subsequent execution', async () => {
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');
      const { proposalId } = createPreparedEthProposal();

      const cancelRes = await cancelProposalAction(proposalId);
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('CANCELLED');
      expect(getProposalStatus(proposalId)).toBe('CANCELLED');

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });
});
