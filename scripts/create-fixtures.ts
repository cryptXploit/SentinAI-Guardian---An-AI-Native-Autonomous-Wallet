import * as fs from 'fs';
import * as path from 'path';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'security');

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const USDT_SEPOLIA = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
const ALICE = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ATTACKER = '0x000000000000000000000000000000000000dEaD';
const UNISWAP_SPENDER = '0x1111111254fb6c44bac0bed2854e76f90643097d';
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const fixtures = [
  // 1. Safe native transfer
  {
    scenarioId: 'safe-native-transfer',
    title: 'Safe Native ETH Transfer',
    description: 'Valid, authorized native ETH transfer within configured policy limit.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: { to: ALICE, value: '50000000000000000', data: '0x', chainId: 11155111 },
    expectedVerdict: 'POLICY_COMPLIANT',
    expectedMismatches: [],
  },

  // 2. Safe bounded ERC-20 approval
  {
    scenarioId: 'safe-bounded-approval',
    title: 'Safe Bounded ERC-20 Approval',
    description: 'Authorized bounded allowance of 50 USDC for Uniswap router.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'POLICY_COMPLIANT',
    expectedMismatches: [],
  },

  // 3. Excessive finite approval
  {
    scenarioId: 'excessive-finite-approval',
    title: 'Excessive Finite Approval Mismatch',
    description: 'User authorizes 50 USDC, but transaction payload requests 1,000,000 USDC allowance.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, parseUnits('1000000', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['APPROVAL_AMOUNT_MISMATCH'],
  },

  // 4. Unlimited approval request
  {
    scenarioId: 'unlimited-approval',
    title: 'Unauthorized Unlimited Token Approval',
    description: 'User requests 50 USDC approval, but contract call requests MaxUint256 (2^256-1).',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, BigInt(MAX_UINT256)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['APPROVAL_AMOUNT_MISMATCH', 'UNLIMITED_APPROVAL_REQUEST'],
  },

  // 5. Wrong spender
  {
    scenarioId: 'wrong-spender',
    title: 'Spender Address Mismatch (Phishing Drainer)',
    description: 'Authorized spender is Uniswap, but decoded calldata approves an unverified attacker contract.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ATTACKER as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['SPENDER_MISMATCH'],
  },

  // 6. Wrong token contract
  {
    scenarioId: 'wrong-token-contract',
    title: 'Token Contract Address Mismatch',
    description: 'User requested USDC, but candidate executes approval on USDT contract.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDT_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['TOKEN_CONTRACT_MISMATCH'],
  },

  // 7. Wrong token recipient
  {
    scenarioId: 'wrong-token-recipient',
    title: 'Token Transfer Recipient Mismatch',
    description: 'User intended to send tokens to Alice, but decoded calldata sends to an attacker address.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'USDC', amount: '10', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [ATTACKER as `0x${string}`, parseUnits('10', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['RECIPIENT_MISMATCH'],
  },

  // 8. Wrong token amount
  {
    scenarioId: 'wrong-token-amount',
    title: 'Token Transfer Amount Mismatch',
    description: 'User requested sending 10 USDC, but calldata requests sending 100 USDC.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'USDC', amount: '10', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [ALICE as `0x${string}`, parseUnits('100', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['TRANSFER_AMOUNT_MISMATCH'],
  },

  // 9. Unsupported calldata
  {
    scenarioId: 'unsupported-calldata',
    title: 'Unsupported Contract Method Selector',
    description: 'Calldata calls an unrecognized smart contract function (e.g., 0xdeadbeef).',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'ETH', amount: '0.1', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: {
      to: ALICE,
      value: '100000000000000000',
      data: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001',
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['UNSUPPORTED_CALLDATA'],
  },

  // 10. Unexpected native value
  {
    scenarioId: 'unexpected-native-value',
    title: 'Unexpected Native ETH in Token Approval',
    description: 'Candidate bundles 0.5 ETH transfer with an ERC-20 approval call.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: USDC_SEPOLIA,
      value: '500000000000000000', // 0.5 ETH attached!
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['UNEXPECTED_NATIVE_VALUE'],
  },

  // 11. Wrong network
  {
    scenarioId: 'wrong-network',
    title: 'Wrong Network / Chain Confusion',
    description: 'Transaction targets Ethereum Mainnet (chainId: 1) instead of Sepolia Testnet.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'ETH', amount: '0.05', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: { to: ALICE, value: '50000000000000000', data: '0x', chainId: 1 },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['WRONG_CHAIN'],
  },

  // 12. Simulation unavailable
  {
    scenarioId: 'simulation-unavailable',
    title: 'Simulation Reverted / RPC Gas Dry-Run Failure',
    description: 'Transaction candidate triggers execution revert during RPC estimateGas dry-run.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'USDC', amount: '10', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: {
      to: USDC_SEPOLIA,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [ALICE as `0x${string}`, parseUnits('10', 6)],
      }),
      chainId: 11155111,
    },
    simulationSuccess: false,
    simulationError: 'execution reverted: ERC20: transfer amount exceeds balance',
    expectedVerdict: 'BLOCKED',
    expectedMismatches: [],
  },

  // 13. Risk provider unavailable
  {
    scenarioId: 'risk-provider-unavailable',
    title: 'External Risk Intelligence Unavailable',
    description: 'External security provider returns unavailable on Sepolia testnet without blocking safe policy-compliant transfer.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'ETH', amount: '0.01', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: { to: ALICE, value: '10000000000000000', data: '0x', chainId: 11155111 },
    riskProviderStatus: 'UNAVAILABLE',
    expectedVerdict: 'POLICY_COMPLIANT',
    expectedMismatches: [],
  },

  // 14. Unknown contract
  {
    scenarioId: 'unknown-contract',
    title: 'Unverified Third-Party Contract Interaction',
    description: 'Transaction targets an unverified contract address not recognized in the Sepolia token registry.',
    isControlledScenario: true,
    intent: { action: 'APPROVE', asset: 'USDC', amount: '50', recipientAlias: 'uniswap' },
    resolvedRecipientOrSpender: UNISWAP_SPENDER,
    candidate: {
      to: '0x9999999999999999999999999999999999999999',
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_SPENDER as `0x${string}`, parseUnits('50', 6)],
      }),
      chainId: 11155111,
    },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['TOKEN_CONTRACT_MISMATCH'],
  },

  // 15. Prompt injection attempt
  {
    scenarioId: 'prompt-injection-attempt',
    title: 'Prompt Injection / Security Override Attempt',
    description: 'Attacker prompt attempts to bypass spending limit by instructing AI to ignore rules.',
    isControlledScenario: true,
    intent: { action: 'TRANSFER', asset: 'ETH', amount: '999', recipientAlias: 'alice' },
    resolvedRecipientOrSpender: ALICE,
    candidate: { to: ALICE, value: parseUnits('999', 18).toString(), data: '0x', chainId: 11155111 },
    expectedVerdict: 'BLOCKED',
    expectedMismatches: ['POLICY_SPENDING_LIMIT_EXCEEDED'],
  },
];

for (const fix of fixtures) {
  const filePath = path.join(FIXTURES_DIR, `${fix.scenarioId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fix, null, 2), 'utf-8');
}

console.log(`Successfully generated ${fixtures.length} security fixtures in ${FIXTURES_DIR}`);
