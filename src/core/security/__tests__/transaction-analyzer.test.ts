import { describe, it, expect } from 'vitest';
import { parseUnits, encodeFunctionData, parseAbi } from 'viem';
import { analyzeTransaction } from '../transaction-analyzer';
import { ParsedIntent, UserPolicy } from '../../domain/schemas';
import { TransactionCandidate, SUPPORTED_TOKENS } from '../../transaction/builder';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const TEST_POLICY: UserPolicy = {
  maxTransferAmountETH: '1.0',
  allowUnlimitedApproval: false,
  trustedContacts: {
    alice: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    bob: '0x1111111254fb6c44bac0bed2854e76f90643097d',
    uniswap: '0x1111111254fb6c44bac0bed2854e76f90643097d',
  },
};

const ALICE = TEST_POLICY.trustedContacts.alice;
const ATTACKER = '0x000000000000000000000000000000000000dEaD';
const UNISWAP = TEST_POLICY.trustedContacts.uniswap;
const USDC = SUPPORTED_TOKENS.USDC.address;
const USDT = SUPPORTED_TOKENS.USDT.address;

describe('R7 Transaction Semantics & Intent Mismatch Suite', () => {
  it('TA1: Approves safe native ETH transfer conforming to intent', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'ETH',
      amount: '0.05',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: ALICE,
      value: parseUnits('0.05', 18),
      data: '0x',
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('POLICY_COMPLIANT');
    expect(result.canExecute).toBe(true);
    expect(result.mismatches).toHaveLength(0);
    expect(result.operationType).toBe('NATIVE_TRANSFER');
  });

  it('TA2: Detects 8.1 RECIPIENT_MISMATCH on native transfer', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'ETH',
      amount: '0.05',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: ATTACKER, // Tampered destination!
      value: parseUnits('0.05', 18),
      data: '0x',
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('RECIPIENT_MISMATCH');
  });

  it('TA3: Detects 8.1 RECIPIENT_MISMATCH on ERC-20 transfer calldata', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'USDC',
      amount: '10',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [ATTACKER as `0x${string}`, parseUnits('10', 6)], // Tampered recipient in calldata!
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('RECIPIENT_MISMATCH');
  });

  it('TA4: Detects 8.2 TOKEN_CONTRACT_MISMATCH (USDC requested, USDT targeted)', () => {
    const intent: ParsedIntent = {
      action: 'APPROVE',
      asset: 'USDC',
      amount: '50',
      recipientAlias: 'uniswap',
    };
    const candidate: TransactionCandidate = {
      to: USDT, // Targets USDT instead of USDC
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: UNISWAP,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('TOKEN_CONTRACT_MISMATCH');
  });

  it('TA5: Detects 8.3 TRANSFER_AMOUNT_MISMATCH', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'USDC',
      amount: '10',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [ALICE as `0x${string}`, parseUnits('100', 6)], // 100 instead of 10
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('TRANSFER_AMOUNT_MISMATCH');
  });

  it('TA6: Detects 8.4 APPROVAL_AMOUNT_MISMATCH (Excessive Allowance Phishing)', () => {
    const intent: ParsedIntent = {
      action: 'APPROVE',
      asset: 'USDC',
      amount: '50',
      recipientAlias: 'uniswap',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as `0x${string}`, parseUnits('1000000', 6)], // 1,000,000 instead of 50
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: UNISWAP,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('APPROVAL_AMOUNT_MISMATCH');
  });

  it('TA7: Detects 8.5 UNLIMITED_APPROVAL_REQUEST when policy prohibits unlimited approvals', () => {
    const intent: ParsedIntent = {
      action: 'APPROVE',
      asset: 'USDC',
      amount: 'UNLIMITED',
      recipientAlias: 'uniswap',
    };
    const maxUint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as `0x${string}`, maxUint],
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: UNISWAP,
      candidate,
      policy: TEST_POLICY, // allowUnlimitedApproval is false
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('UNLIMITED_APPROVAL_REQUEST');
  });

  it('TA8: Detects 8.6 SPENDER_MISMATCH on ERC-20 approval', () => {
    const intent: ParsedIntent = {
      action: 'APPROVE',
      asset: 'USDC',
      amount: '50',
      recipientAlias: 'uniswap',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ATTACKER as `0x${string}`, parseUnits('50', 6)], // Spender is attacker
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: UNISWAP,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('SPENDER_MISMATCH');
  });

  it('TA9: Detects 8.7 TRANSACTION_METHOD_MISMATCH (Requested transfer, got approve)', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'USDC',
      amount: '50',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve', // approve instead of transfer!
        args: [ALICE as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('TRANSACTION_METHOD_MISMATCH');
  });

  it('TA10: Detects 8.8 UNEXPECTED_NATIVE_VALUE in ERC-20 operation', () => {
    const intent: ParsedIntent = {
      action: 'APPROVE',
      asset: 'USDC',
      amount: '50',
      recipientAlias: 'uniswap',
    };
    const candidate: TransactionCandidate = {
      to: USDC,
      value: parseUnits('1', 18), // 1 ETH attached!
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: UNISWAP,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('UNEXPECTED_NATIVE_VALUE');
  });

  it('TA11: Detects 8.9 WRONG_CHAIN targeting Ethereum Mainnet', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'ETH',
      amount: '0.05',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: ALICE,
      value: parseUnits('0.05', 18),
      data: '0x',
      chainId: 1, // Mainnet!
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('WRONG_CHAIN');
  });

  it('TA12: Detects 8.10 UNSUPPORTED_CALLDATA (arbitrary function selector)', () => {
    const intent: ParsedIntent = {
      action: 'TRANSFER',
      asset: 'ETH',
      amount: '0.05',
      recipientAlias: 'alice',
    };
    const candidate: TransactionCandidate = {
      to: ALICE,
      value: parseUnits('0.05', 18),
      data: '0x123456780000000000000000000000000000000000000000000000000000000000000001',
      chainId: 11155111,
    };

    const result = analyzeTransaction({
      intent,
      resolvedRecipientOrSpender: ALICE,
      candidate,
      policy: TEST_POLICY,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(result.mismatches).toContain('UNSUPPORTED_CALLDATA');
  });
});
