import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateTransaction } from '../simulator';
import { analyzeApprovalExposure } from '../approval-analyzer';
import {
  DEFAULT_EXECUTABLE_USER_POLICY,
  getActiveUserPolicy,
  updateActiveUserPolicy,
  getPolicyAuditLogs,
  resolveRecipientFromPolicy,
} from '@/core/policy/user-policy';
import {
  storeProposal,
  retrieveProposal,
  _resetProposalsForTesting,
  _getDb,
} from '../proposal';
import { generateIIP } from '../iip';
import { buildTransaction, SUPPORTED_TOKENS } from '@/core/transaction/builder';
import { authorizeAndExecute } from '@/app/actions/orchestrator';
import * as authModule from '../auth';
import * as controllerModule from '@/core/execution/controller';

const mockEstimateGas = vi.fn();
const mockGetCode = vi.fn();
const mockGetChainId = vi.fn();
const mockReadContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      estimateGas: mockEstimateGas,
      getCode: mockGetCode,
      getChainId: mockGetChainId,
      readContract: mockReadContract,
    })),
  };
});

describe('Milestone R8.3 — Security Recovery & Real Execution Readiness', () => {
  const SAFE_TEST_WALLET = '0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148';
  const VITALIK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const UNISWAP_SPENDER = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetProposalsForTesting();
    mockGetChainId.mockResolvedValue(11155111);
    mockGetCode.mockResolvedValue('0x608060405234801561001057600080fd5b50');
    mockEstimateGas.mockResolvedValue(21000n);
    process.env.AGENT_PRIVATE_KEY =
      '0x1111111111111111111111111111111111111111111111111111111111111111';
    process.env.RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/test-rpc';
    delete process.env.APPROVED_TEST_RECIPIENT_ADDRESS;
  });

  describe('Priority 1 — CSF-01: ERC-20 Simulation & Account Passing', () => {
    it('passes the configured sender account to estimateGas for ETH transfers', async () => {
      const candidate = buildTransaction(
        {
          action: 'TRANSFER',
          recipientAlias: 'alice',
          amount: '0.01',
          asset: 'ETH',
        },
        SAFE_TEST_WALLET
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(true);
      expect(mockEstimateGas).toHaveBeenCalledWith(
        expect.objectContaining({
          account: SAFE_TEST_WALLET,
          to: SAFE_TEST_WALLET,
          value: candidate.value,
        })
      );
    });

    it('passes sender account and verifies contract bytecode for ERC-20 transfer simulation', async () => {
      mockEstimateGas.mockResolvedValueOnce(65000n);
      const candidate = buildTransaction(
        {
          action: 'TRANSFER',
          recipientAlias: 'alice',
          amount: '25',
          asset: 'USDC',
        },
        SAFE_TEST_WALLET
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(true);
      expect(mockGetCode).toHaveBeenCalledWith({
        address: SUPPORTED_TOKENS.USDC.address,
      });
      expect(mockEstimateGas).toHaveBeenCalledWith(
        expect.objectContaining({
          account: SAFE_TEST_WALLET,
          to: SUPPORTED_TOKENS.USDC.address,
        })
      );
    });

    it('passes sender account and verifies contract bytecode for ERC-20 approve simulation', async () => {
      mockEstimateGas.mockResolvedValueOnce(46000n);
      const candidate = buildTransaction(
        {
          action: 'APPROVE',
          recipientAlias: 'uniswap',
          amount: '50',
          asset: 'USDC',
        },
        UNISWAP_SPENDER
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(true);
      expect(res.gasEstimated).toBe(46000n);
      expect(mockEstimateGas).toHaveBeenCalledWith(
        expect.objectContaining({
          account: SAFE_TEST_WALLET,
          to: SUPPORTED_TOKENS.USDC.address,
        })
      );
    });

    it('rejects wrong-chain candidate before simulation (WRONG_CHAIN)', async () => {
      const candidate = {
        to: SAFE_TEST_WALLET,
        value: 1000n,
        data: '0x' as `0x${string}`,
        chainId: 1, // Ethereum Mainnet
      };

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(false);
      expect(res.failureCategory).toBe('WRONG_CHAIN');
      expect(mockEstimateGas).not.toHaveBeenCalled();
    });

    it('rejects undeployed/invalid token contracts when getCode returns empty bytecode (INVALID_TOKEN_CONTRACT)', async () => {
      mockGetCode.mockResolvedValueOnce('0x');
      const candidate = buildTransaction(
        {
          action: 'APPROVE',
          recipientAlias: 'uniswap',
          amount: '50',
          asset: 'DAI',
        },
        UNISWAP_SPENDER
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(false);
      expect(res.failureCategory).toBe('INVALID_TOKEN_CONTRACT');
      expect(mockEstimateGas).not.toHaveBeenCalled();
    });

    it('classifies insufficient ERC-20 token balance reverts accurately (INSUFFICIENT_TOKEN_BALANCE)', async () => {
      mockEstimateGas.mockRejectedValueOnce(
        new Error('execution reverted: ERC20: transfer amount exceeds balance')
      );
      const candidate = buildTransaction(
        {
          action: 'TRANSFER',
          recipientAlias: 'alice',
          amount: '25',
          asset: 'USDC',
        },
        SAFE_TEST_WALLET
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(false);
      expect(res.failureCategory).toBe('INSUFFICIENT_TOKEN_BALANCE');
    });

    it('classifies insufficient native ETH gas balance accurately (INSUFFICIENT_GAS_BALANCE)', async () => {
      mockEstimateGas.mockRejectedValueOnce(
        new Error('insufficient funds for gas * price + value')
      );
      const candidate = buildTransaction(
        {
          action: 'TRANSFER',
          recipientAlias: 'alice',
          amount: '0.5',
          asset: 'ETH',
        },
        SAFE_TEST_WALLET
      );

      const res = await simulateTransaction(
        candidate,
        'https://sepolia.infura.io/v3/test',
        SAFE_TEST_WALLET
      );

      expect(res.success).toBe(false);
      expect(res.failureCategory).toBe('INSUFFICIENT_GAS_BALANCE');
    });
  });

  describe('Priority 1 — CSF-02: Safe Recipient Configuration & SQLite Policy Persistence', () => {
    it('removes hardcoded third-party Alice address from DEFAULT_EXECUTABLE_USER_POLICY', () => {
      expect(DEFAULT_EXECUTABLE_USER_POLICY.trustedContacts.alice).toBeUndefined();
      expect(Object.values(DEFAULT_EXECUTABLE_USER_POLICY.trustedContacts)).not.toContain(
        VITALIK_ADDRESS
      );
    });

    it('fails closed when contact alias is unconfigured', () => {
      const policy = getActiveUserPolicy('operator-unconfigured');
      const res = resolveRecipientFromPolicy('alice', policy);
      expect(res.status).toBe('UNKNOWN');
    });

    it('binds alice to APPROVED_TEST_RECIPIENT_ADDRESS when explicitly configured', () => {
      process.env.APPROVED_TEST_RECIPIENT_ADDRESS = SAFE_TEST_WALLET;
      const policy = getActiveUserPolicy('operator-env');
      const res = resolveRecipientFromPolicy('alice', policy);
      expect(res.status).toBe('RESOLVED');
      if (res.status === 'RESOLVED') {
        expect(res.address).toBe(SAFE_TEST_WALLET);
      }
    });

    it('strictly blocks Vitalik, zero, and burn addresses in updateActiveUserPolicy', () => {
      expect(() =>
        updateActiveUserPolicy({
          ownerId: 'operator-1',
          action: 'TEST_VITALIK_BLOCK',
          maxTransferAmountETH: '1.0',
          trustedContacts: { alice: VITALIK_ADDRESS },
        })
      ).toThrow(/UNSAFE_RECIPIENT_ADDRESS/);

      expect(() =>
        updateActiveUserPolicy({
          ownerId: 'operator-1',
          action: 'TEST_ZERO_BLOCK',
          maxTransferAmountETH: '1.0',
          trustedContacts: { alice: '0x0000000000000000000000000000000000000000' },
        })
      ).toThrow(/UNSAFE_RECIPIENT_ADDRESS/);
    });

    it('persists authenticated policy updates to SQLite and records audit logs', () => {
      const updated = updateActiveUserPolicy({
        ownerId: 'operator-audit',
        action: 'UPDATE_POLICY',
        maxTransferAmountETH: '0.75',
        trustedContacts: { alice: SAFE_TEST_WALLET },
      });
      expect(updated.maxTransferAmountETH).toBe('0.75');

      const loaded = getActiveUserPolicy('operator-audit');
      expect(loaded.maxTransferAmountETH).toBe('0.75');
      expect(loaded.trustedContacts.alice).toBe(SAFE_TEST_WALLET);

      const logs = getPolicyAuditLogs('operator-audit');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('UPDATE_POLICY');
    });
  });

  describe('Priority 1 — CSF-03: Real Allowance vs Unknown/Failed Allowance States', () => {
    it('distinguishes REAL_ALLOWANCE, UNKNOWN_ALLOWANCE, RPC_FAILURE, and UNSUPPORTED_TOKEN', () => {
      const realExposure = analyzeApprovalExposure({
        tokenAddress: SUPPORTED_TOKENS.USDC.address,
        spenderAddress: UNISWAP_SPENDER,
        proposedAllowanceRaw: 50000000n,
        currentAllowanceRaw: 10000000n, // 10 USDC
        allowanceStatus: 'REAL_ALLOWANCE',
        chainId: 11155111,
        policy: DEFAULT_EXECUTABLE_USER_POLICY,
      });
      expect(realExposure.allowanceStatus).toBe('REAL_ALLOWANCE');
      expect(realExposure.currentAllowanceRaw).toBe(10000000n);

      const rpcFailedExposure = analyzeApprovalExposure({
        tokenAddress: SUPPORTED_TOKENS.USDC.address,
        spenderAddress: UNISWAP_SPENDER,
        proposedAllowanceRaw: 50000000n,
        currentAllowanceRaw: undefined,
        allowanceStatus: 'RPC_FAILURE',
        chainId: 11155111,
        policy: DEFAULT_EXECUTABLE_USER_POLICY,
      });
      expect(rpcFailedExposure.allowanceStatus).toBe('RPC_FAILURE');
      expect(rpcFailedExposure.currentAllowanceRaw).toBeUndefined();
      expect(rpcFailedExposure.currentAllowanceFormatted).toContain('Unavailable');

      const unsupportedExposure = analyzeApprovalExposure({
        tokenAddress: SUPPORTED_TOKENS.USDC.address,
        spenderAddress: UNISWAP_SPENDER,
        proposedAllowanceRaw: 50000000n,
        currentAllowanceRaw: undefined,
        allowanceStatus: 'UNSUPPORTED_TOKEN',
        chainId: 11155111,
        policy: DEFAULT_EXECUTABLE_USER_POLICY,
      });
      expect(unsupportedExposure.allowanceStatus).toBe('UNSUPPORTED_TOKEN');
      expect(unsupportedExposure.currentAllowanceRaw).toBeUndefined();
      expect(unsupportedExposure.currentAllowanceFormatted).toContain('Unsupported');
    });
  });

  describe('Priority 2 — Execution Safety: 10 Adversarial Vectors', () => {
    const stringifyWithBigInt = (obj: unknown) =>
      JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

    const createValidPreparedProposal = (ownerId = 'operator-sec') => {
      process.env.APPROVED_TEST_RECIPIENT_ADDRESS = SAFE_TEST_WALLET;
      const intent = {
        action: 'TRANSFER' as const,
        recipientAlias: 'alice',
        amount: '0.01',
        asset: 'ETH',
      };
      const candidate = buildTransaction(intent, SAFE_TEST_WALLET);
      const policyDecision = {
        status: 'ALLOW' as const,
        reason: 'Compliant',
        resolvedAddress: SAFE_TEST_WALLET,
      };
      const simulation = {
        success: true,
        gasEstimated: 21000n,
        timestamp: new Date().toISOString(),
      };
      const iip = generateIIP(intent, candidate, policyDecision, simulation);
      const proposalId = storeProposal(iip, ownerId, 60000, 'LIVE_VERIFIED', true);
      return { proposalId, iip };
    };

    it('Vector 1 & 5: blocks duplicate execution and reused approval after confirmation', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      vi.spyOn(controllerModule, 'broadcastTransaction').mockResolvedValue({
        hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        outcome: 'BROADCAST_SUBMITTED',
      });
      vi.spyOn(controllerModule, 'waitForReceipt').mockResolvedValue({
        status: 'success',
        blockNumber: 123456n,
      });

      const { proposalId } = createValidPreparedProposal();
      const firstRun = await authorizeAndExecute(proposalId);
      expect(firstRun.success).toBe(true);

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/DUPLICATE_EXECUTION/);
    });

    it('Vector 2: blocks concurrent execution attempts via atomic SQLite lock', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      vi.spyOn(controllerModule, 'broadcastTransaction').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return {
          hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
          outcome: 'BROADCAST_SUBMITTED',
        };
      });
      vi.spyOn(controllerModule, 'waitForReceipt').mockResolvedValue({
        status: 'success',
        blockNumber: 123456n,
      });

      const { proposalId } = createValidPreparedProposal();
      const [resA, resB] = await Promise.allSettled([
        authorizeAndExecute(proposalId),
        authorizeAndExecute(proposalId),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it('Vector 3 & 4: blocks modified recipient or modified amount after approval even if digest were forged', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      const broadcastSpy = vi.spyOn(controllerModule, 'broadcastTransaction');

      // Vector 3: Modified recipient after approval
      const { proposalId, iip } = createValidPreparedProposal();
      const db = _getDb();
      const tamperedIip = {
        ...iip,
        candidate: {
          ...iip.candidate,
          to: '0x9999999999999999999999999999999999999999',
        },
      };
      db.prepare('UPDATE proposals SET iip_data = ? WHERE id = ?').run(
        stringifyWithBigInt(tamperedIip),
        proposalId
      );

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(broadcastSpy).not.toHaveBeenCalled();

      // Vector 4: Modified amount (exceeding cap) EVEN IF digest were forged
      const { proposalId: proposalId2, iip: iip2 } = createValidPreparedProposal();
      const hugeCandidate = buildTransaction(
        {
          action: 'TRANSFER',
          recipientAlias: 'alice',
          amount: '99',
          asset: 'ETH',
        },
        SAFE_TEST_WALLET
      );
      const forgedIip = generateIIP(
        iip2.intent,
        hugeCandidate,
        iip2.policyDecision,
        iip2.simulation
      );
      db.prepare('UPDATE proposals SET digest = ?, iip_data = ? WHERE id = ?').run(
        forgedIip.proofDigest,
        stringifyWithBigInt(forgedIip),
        proposalId2
      );

      await expect(authorizeAndExecute(proposalId2)).rejects.toThrow(/TAMPERED_PAYLOAD/);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('Vector 6: blocks expired proposal before signing', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      const { proposalId } = createValidPreparedProposal();
      const db = _getDb();
      db.prepare('UPDATE proposals SET expires_at = ? WHERE id = ?').run(
        new Date(Date.now() - 60000).toISOString(),
        proposalId
      );

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/PROPOSAL_EXPIRED/);
    });

    it('Vector 7: blocks invalid/corrupted IIP digest in stored proposal', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      const { proposalId } = createValidPreparedProposal();
      const db = _getDb();
      db.prepare('UPDATE proposals SET digest = ? WHERE id = ?').run(
        '0xdeadbeef00000000000000000000000000000000000000000000000000000000',
        proposalId
      );

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/TAMPERED_PAYLOAD/);
    });

    it('Vector 8: locks proposal in RECONCILIATION_REQUIRED on RPC timeout after broadcast', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      vi.spyOn(controllerModule, 'broadcastTransaction').mockResolvedValue({
        hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        outcome: 'BROADCAST_SUBMITTED',
      });
      vi.spyOn(controllerModule, 'waitForReceipt').mockRejectedValue(
        new Error('Timed out waiting for transaction receipt')
      );

      const { proposalId } = createValidPreparedProposal();
      const res = await authorizeAndExecute(proposalId);
      expect(res.success).toBe(false);
      expect(res.error).toContain('RECEIPT_PENDING');

      const updated = retrieveProposal(proposalId);
      expect(updated?.status).toBe('RECONCILIATION_REQUIRED');
    });

    it('Vector 9: isolates post-broadcast DB failure so already-broadcast tx is never marked FAILED_BEFORE_BROADCAST', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'operator-sec',
        expiresAt: Date.now() + 3600000,
      });
      vi.spyOn(controllerModule, 'broadcastTransaction').mockResolvedValue({
        hash: '0x4444444444444444444444444444444444444444444444444444444444444444',
        outcome: 'BROADCAST_SUBMITTED',
      });

      const { proposalId } = createValidPreparedProposal();
      const proposalMod = await import('../proposal');
      const markSubmittedSpy = vi
        .spyOn(proposalMod, 'markSubmitted')
        .mockImplementationOnce(() => {
          throw new Error('SQLITE_BUSY: database is locked during markSubmitted');
        });

      const res = await authorizeAndExecute(proposalId);
      expect(res.success).toBe(false);
      expect(res.error).toContain('POST_BROADCAST_DB_FAILURE');
      expect(res.executionResult?.transactionHash).toBe(
        '0x4444444444444444444444444444444444444444444444444444444444444444'
      );

      markSubmittedSpy.mockRestore();
      const stored = retrieveProposal(proposalId);
      expect(stored?.status).not.toBe('FAILED_BEFORE_BROADCAST');
    });

    it('Vector 10: blocks unauthorized execution request from wrong operator session', async () => {
      vi.spyOn(authModule, 'verifySession').mockResolvedValue({
        sessionId: 'sess-attacker',
        userId: 'attacker-operator',
        expiresAt: Date.now() + 3600000,
      });
      const { proposalId } = createValidPreparedProposal('legit-operator');

      await expect(authorizeAndExecute(proposalId)).rejects.toThrow(/OWNERSHIP_VIOLATION/);
    });
  });
});
