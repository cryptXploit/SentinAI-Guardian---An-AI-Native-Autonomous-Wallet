import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { createPublicClient, http, formatEther, formatGwei, Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { EXPECTED_CHAIN_ID } from '../src/core/web3/rpc-service';
import { getActiveUserPolicy, resolveRecipientFromPolicy } from '../src/core/policy/user-policy';
import { buildTransaction } from '../src/core/transaction/builder';
import { evaluatePolicy } from '../src/core/policy/engine';
import { simulateTransaction } from '../src/core/security/simulator';
import { generateIIP, verifyIIPDigest } from '../src/core/security/iip';
import { parseIntentWithProvenance } from '../src/core/ai/intent-parser';
import {
  GroqIntentProvider,
  GeminiIntentProvider,
  getLastParsedProvenance,
  getLastActiveProviderName,
  getLastActiveModelName,
  isTransactionNegationOrCancellation,
} from '../src/core/ai/provider';
import { ParsedIntent, ParsedIntentSchema } from '../src/core/domain/schemas';
import { analyzeTransaction } from '../src/core/security/transaction-analyzer';

// Prefer IPv4 first on Windows to prevent Node undici dual-stack IPv6 connection stalls
dns.setDefaultResultOrder('ipv4first');

/**
 * Loads `.env` from the project root without ever printing secret values.
 */
function loadEnvSecurely(): Record<string, boolean> {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
  return {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
    RPC_URL: Boolean(process.env.RPC_URL),
    AGENT_PRIVATE_KEY: Boolean(process.env.AGENT_PRIVATE_KEY),
    AGENT_WALLET_ADDRESS: Boolean(process.env.AGENT_WALLET_ADDRESS),
    APPROVED_TEST_RECIPIENT_ADDRESS: Boolean(process.env.APPROVED_TEST_RECIPIENT_ADDRESS),
    OPERATOR_PASSWORD: Boolean(process.env.OPERATOR_PASSWORD),
  };
}

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause
      ? ` (cause: ${err.cause instanceof Error ? err.cause.message : String(err.cause)})`
      : '';
  return (raw + cause)
    .replace(/gsk_[A-Za-z0-9_-]+/g, 'gsk_<REDACTED>')
    .replace(/AIzaSy[A-Za-z0-9_-]+/g, 'AIzaSy<REDACTED>')
    .replace(/0x[a-fA-F0-9]{64}/g, '0x<REDACTED_PRIVATE_KEY>');
}

async function probeGroqHttpRaw(
  command: string,
  targetModel: string,
  timeoutMs: number = 15_000
): Promise<{
  ok: boolean;
  httpStatus: number;
  modelReturned: string;
  rawContent: string;
  durationMs: number;
  error?: string;
}> {
  const apiKey = process.env.GROQ_API_KEY || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a wallet intent parser. Return ONLY a JSON object with keys: action ("TRANSFER"|"APPROVE"|"CHECK_BALANCE"|"UNKNOWN"), asset ("ETH"|"USDC"|"DAI"|"USDT"), amount (string), recipientAlias (string).',
          },
          { role: 'user', content: command },
        ],
      }),
      signal: controller.signal,
    });
    const durationMs = Date.now() - start;
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        modelReturned: targetModel,
        rawContent: text.slice(0, 300).replace(/\s+/g, ' '),
        durationMs,
        error: `HTTP ${res.status}`,
      };
    }
    const body = JSON.parse(text) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = body?.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      httpStatus: res.status,
      modelReturned: body?.model || targetModel,
      rawContent: rawContent.replace(/\s+/g, ' ').trim(),
      durationMs,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      httpStatus: 0,
      modelReturned: targetModel,
      rawContent: '',
      durationMs: Date.now() - start,
      error: sanitizeErrorMessage(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runDiagnostics(): Promise<void> {
  const suiteStart = Date.now();
  let allPassed = true;
  const recordCheck = (name: string, passed: boolean, detail: string) => {
    if (!passed) allPassed = false;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name} :: ${detail}`);
  };

  console.log('=== [CHECKPOINT 1] ENVIRONMENT & CONFIGURATION LOAD ===');
  const envPresence = loadEnvSecurely();
  console.log('ENV_PRESENCE=' + JSON.stringify(envPresence));
  recordCheck(
    'ENV_LOADED',
    envPresence.GROQ_API_KEY && envPresence.RPC_URL && envPresence.AGENT_PRIVATE_KEY,
    `GROQ_API_KEY=${envPresence.GROQ_API_KEY}, GEMINI_API_KEY=${envPresence.GEMINI_API_KEY}, RPC_URL=${envPresence.RPC_URL}, AGENT_PRIVATE_KEY=${envPresence.AGENT_PRIVATE_KEY}`
  );

  const testCommand = 'Send 0.0001 ETH to alice';

  console.log('\n=== [CHECKPOINT 2] TASK 3 — DIRECT GROQ & GEMINI LIVE AI VERIFICATION ===');
  const configuredGroqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const groqProbe = await probeGroqHttpRaw(testCommand, configuredGroqModel, 15_000);
  console.log(
    `GROQ_RAW_PROBE :: ok=${groqProbe.ok} | status=${groqProbe.httpStatus} | durationMs=${groqProbe.durationMs} | model=${groqProbe.modelReturned} | error=${groqProbe.error || 'none'}`
  );
  if (groqProbe.rawContent) {
    console.log(`GROQ_RAW_JSON_RESPONSE=${groqProbe.rawContent}`);
  }

  let groqIntent: ParsedIntent | null = null;
  let groqProviderError: string | null = null;
  let groqDurationMs = 0;
  let groqProvenance = 'DETERMINISTIC_FALLBACK';
  let groqActiveProvider = 'mock';
  let groqActiveModel = '';

  try {
    const groqProvider = new GroqIntentProvider();
    const groqStart = Date.now();
    groqIntent = await groqProvider.parseIntent(testCommand);
    groqDurationMs = Date.now() - groqStart;
    groqProvenance = getLastParsedProvenance();
    groqActiveProvider = getLastActiveProviderName();
    groqActiveModel = getLastActiveModelName();
  } catch (err: unknown) {
    groqProviderError = sanitizeErrorMessage(err);
    console.log(`GROQ_PROVIDER_ERROR=${groqProviderError}`);
  }

  console.log('\n=== [CHECKPOINT 3] ORCHESTRATOR TIERED AI ROUTING (GEMINI -> GROQ -> FALLBACK) ===');
  const tieredStart = Date.now();
  const tieredRes = await parseIntentWithProvenance(testCommand);
  const tieredDurationMs = Date.now() - tieredStart;
  console.log(
    `TIERED_PROVIDER=${tieredRes.providerName} | MODEL=${tieredRes.modelUsed} | PROVENANCE=${tieredRes.aiProvenance} | FALLBACK=${tieredRes.isFallback} | DURATION_MS=${tieredDurationMs}`
  );
  console.log(`TIERED_PARSED_INTENT=${JSON.stringify(tieredRes.intent)}`);

  const validatedIntent = groqIntent || tieredRes.intent;
  const schemaValid = ParsedIntentSchema.safeParse(validatedIntent).success;
  const notNegated = !isTransactionNegationOrCancellation(testCommand);
  const exactMatch =
    validatedIntent.action === 'TRANSFER' &&
    validatedIntent.asset === 'ETH' &&
    validatedIntent.amount === '0.0001' &&
    validatedIntent.recipientAlias.toLowerCase() === 'alice';

  recordCheck(
    'GROQ_HTTP_STATUS',
    groqProbe.httpStatus === 200,
    groqProbe.ok
      ? `HTTP ${groqProbe.httpStatus} in ${groqProbe.durationMs}ms (model=${groqProbe.modelReturned})`
      : `Failed/Aborted after ${groqProbe.durationMs}ms: ${groqProbe.error}`
  );
  recordCheck(
    'LIVE_AI_PROVIDER_AND_MODEL',
    (groqActiveProvider === 'groq' && groqProvenance === 'LIVE_AI') ||
      tieredRes.aiProvenance === 'LIVE_AI',
    groqIntent
      ? `Groq LIVE_AI (${groqActiveModel} in ${groqDurationMs}ms) & Tiered (${tieredRes.providerName}/${tieredRes.modelUsed} in ${tieredDurationMs}ms)`
      : `Groq failed (${groqProviderError}); Tiered=${tieredRes.providerName}/${tieredRes.modelUsed} (${tieredRes.aiProvenance})`
  );
  recordCheck(
    'PARSED_INTENT_FIELDS',
    exactMatch,
    `parsed=${JSON.stringify(validatedIntent)}`
  );
  recordCheck(
    'DETERMINISTIC_VALIDATION',
    schemaValid && notNegated && exactMatch,
    `schemaValid=${schemaValid}, notNegated=${notNegated}, exactMatch=${exactMatch}`
  );

  console.log('\n=== [CHECKPOINT 4] TASK 4 — PRE-FLIGHT WALLET, RECIPIENT & POLICY ===');
  const derivedAccount = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Address);
  const configuredWallet = process.env.AGENT_WALLET_ADDRESS || '';
  const senderMatchesKey =
    derivedAccount.address.toLowerCase() === configuredWallet.toLowerCase();

  recordCheck(
    'SENDER_MATCHES_PRIVATE_KEY',
    senderMatchesKey,
    `derived=${derivedAccount.address}, configured=${configuredWallet}`
  );

  const activePolicy = getActiveUserPolicy('operator-1');
  const aliceRes = resolveRecipientFromPolicy('alice', activePolicy);
  const unknownRes = resolveRecipientFromPolicy('mallory_unknown', activePolicy);

  const aliceMatchesSelf =
    aliceRes.status === 'RESOLVED' &&
    aliceRes.address.toLowerCase() === derivedAccount.address.toLowerCase();

  recordCheck(
    'ALICE_RESOLVES_TO_OWNER_WALLET',
    aliceMatchesSelf,
    JSON.stringify(aliceRes)
  );
  recordCheck(
    'UNKNOWN_RECIPIENT_FAILS_CLOSED',
    unknownRes.status === 'UNKNOWN',
    JSON.stringify(unknownRes)
  );

  const resolvedAddress = aliceRes.status === 'RESOLVED' ? aliceRes.address : '';
  const candidate = buildTransaction(validatedIntent, resolvedAddress);
  const policyDecision = evaluatePolicy(validatedIntent, candidate, activePolicy);

  recordCheck(
    'CANDIDATE_CONSTRUCTION',
    candidate.to.toLowerCase() === derivedAccount.address.toLowerCase() &&
      candidate.value === 100000000000000n &&
      (candidate.data ?? '0x') === '0x' &&
      candidate.chainId === EXPECTED_CHAIN_ID,
    `to=${candidate.to}, value=${candidate.value.toString()} wei (${formatEther(candidate.value)} ETH), data=${candidate.data ?? '0x'}, chainId=${candidate.chainId}`
  );
  recordCheck(
    'POLICY_DECISION_ALLOW',
    policyDecision.status === 'ALLOW',
    JSON.stringify(policyDecision)
  );

  console.log('\n=== [CHECKPOINT 5] TASK 4 — LIVE SEPOLIA RPC, SIMULATION & IIP ===');
  const rpcUrl = process.env.RPC_URL!;
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 10_000 }),
  });

  const rpcStart = Date.now();
  const [chainId, latestBlock, senderBalance, senderCode, recipientCode, gasPrice] =
    await Promise.all([
      publicClient.getChainId(),
      publicClient.getBlockNumber(),
      publicClient.getBalance({ address: derivedAccount.address }),
      publicClient.getCode({ address: derivedAccount.address }),
      publicClient.getCode({ address: resolvedAddress as Address }),
      publicClient.getGasPrice(),
    ]);
  const rpcDurationMs = Date.now() - rpcStart;

  recordCheck(
    'SEPOLIA_CHAIN_ID',
    chainId === 11155111 && EXPECTED_CHAIN_ID === 11155111,
    `chainId=${chainId}, latestBlock=${latestBlock.toString()}, rpcLatency=${rpcDurationMs}ms`
  );

  const simResult = await simulateTransaction(candidate, rpcUrl, derivedAccount.address);
  const estGas = simResult.gasEstimated ?? 0n;
  const broadcastGasFloor = estGas > 0n && estGas < 21000n ? 21000n : estGas;
  const requiredWei = candidate.value + broadcastGasFloor * gasPrice;

  recordCheck(
    'SIMULATION_SUCCESS',
    simResult.success && estGas > 0n,
    `success=${simResult.success}, gasEstimated=${estGas.toString()} (EIP-2780 self-transfer), broadcastGasFloor=${broadcastGasFloor.toString()}, gasPrice=${formatGwei(gasPrice)} Gwei`
  );
  recordCheck(
    'SUFFICIENT_GAS_BALANCE',
    senderBalance > requiredWei,
    `balance=${senderBalance.toString()} wei (${formatEther(senderBalance)} ETH) > required=${requiredWei.toString()} wei (${formatEther(requiredWei)} ETH)`
  );
  recordCheck(
    'EOA_CODE_CHECK',
    !senderCode && !recipientCode,
    `senderCode=${senderCode ?? '0x (EOA)'}, recipientCode=${recipientCode ?? '0x (EOA)'}`
  );

  const iip = generateIIP(validatedIntent, candidate, policyDecision, simResult);
  const iipValid = verifyIIPDigest(iip);
  const tamperedIip = {
    ...iip,
    candidate: { ...iip.candidate, value: iip.candidate.value + 1n },
  };
  const tamperedRejected = !verifyIIPDigest(tamperedIip);

  recordCheck(
    'IIP_VERIFICATION_PASS',
    iipValid && iip.finalDecision === 'ALLOW_FOR_AUTHORIZATION',
    `digest=${iip.proofDigest}, finalDecision=${iip.finalDecision}`
  );
  recordCheck(
    'TAMPERED_IIP_REJECTED',
    tamperedRejected,
    `tamperedDigestValid=${!tamperedRejected} (rejected=${tamperedRejected})`
  );

  const txAnalysis = analyzeTransaction({
    intent: validatedIntent,
    resolvedRecipientOrSpender: resolvedAddress,
    candidate,
    policy: activePolicy,
    simulationSuccess: simResult.success,
    simulationError: simResult.revertReason,
  });

  recordCheck(
    'TRANSACTION_ANALYZER_EXECUTABLE',
    txAnalysis.canExecute && txAnalysis.mismatches.length === 0,
    `canExecute=${txAnalysis.canExecute}, mismatches=${JSON.stringify(txAnalysis.mismatches)}, status=${txAnalysis.status}`
  );

  console.log('\n=== [CHECKPOINT 6] SUMMARY ===');
  console.log(`TOTAL_DURATION_MS=${Date.now() - suiteStart}`);
  console.log(`OVERALL_PREFLIGHT_STATUS=${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`READY_FOR_MANUAL_SELF_TRANSFER=${allPassed ? 'YES' : 'NO'}`);

  if (!allPassed) {
    process.exitCode = 1;
  }
}

runDiagnostics().catch((err: unknown) => {
  console.error('DIAGNOSTIC_FATAL_ERROR:', sanitizeErrorMessage(err));
  process.exitCode = 1;
});
