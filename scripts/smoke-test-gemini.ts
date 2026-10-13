/**
 * Gemini Live Integration Smoke Test (Milestone R7.1)
 *
 * Safe, read-only verification of Gemini API connectivity.
 * - Does NOT sign, broadcast, or access private keys.
 * - Strict 10-second timeout via AbortController.
 * - Sanitized error classification (never prints API key).
 * - Safe exit code without triggering libuv socket assertions.
 *
 * Usage:
 *   node --env-file=.env scripts/smoke-test-gemini.ts
 */

import { GoogleGenAI, Type } from '@google/genai';
import { classifyAiError, AI_SYSTEM_PROMPT } from '../src/core/ai/provider';
import { ParsedIntentSchema } from '../src/core/domain/schemas';

async function main() {
  console.log('========================================================');
  console.log(' SentinAI Guardian — Gemini Live Provider Smoke Test');
  console.log('========================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[RESULT] Status: LIVE_AI_NOT_VERIFIED');
    console.log('[REASON] GEMINI_API_KEY is not set in environment or .env.');
    console.log('[SANITY] No API key present. Exiting safely.');
    process.exitCode = 0;
    return;
  }

  // Sanitized display of presence only
  console.log(`[AUTH] Key configured: YES (${apiKey.length} characters)`);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  console.log(`[CONFIG] Provider: Google Gemini (@google/genai)`);
  console.log(`[CONFIG] Model:    ${modelName}`);
  console.log(`[TIMEOUT] Strict: 10,000ms`);
  console.log(`[ACTION] Executing ONE harmless test request: "Show my Sepolia wallet balance"...\n`);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10_000);
  const startTime = Date.now();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Show my Sepolia wallet balance',
      config: {
        systemInstruction: AI_SYSTEM_PROMPT,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            asset: { type: Type.STRING },
            amount: { type: Type.STRING },
            recipientAlias: { type: Type.STRING },
          },
          required: ['action', 'asset', 'amount', 'recipientAlias'],
        },
        abortSignal: abortController.signal,
      },
    });

    const latencyMs = Date.now() - startTime;
    clearTimeout(timeoutId);

    const responseText = response.text || '';
    const rawJson = JSON.parse(responseText);
    const parsed = ParsedIntentSchema.parse(rawJson);

    console.log('[RESULT] Status: VERIFIED_LIVE');
    console.log(`[LATENCY] ${latencyMs}ms`);
    console.log('[STRUCTURED_OUTPUT]:', JSON.stringify(parsed, null, 2));
    console.log('\nGemini integration is operational and producing valid structured intents.');
    process.exitCode = 0;
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    clearTimeout(timeoutId);

    const isAborted = abortController.signal.aborted;
    const { classification, message } = classifyAiError(error, isAborted);

    console.error(`[RESULT] Status: FAILED`);
    console.error(`[LATENCY] ${latencyMs}ms`);
    console.error(`[CLASSIFICATION] ${classification}`);
    console.error(`[ERROR_DETAIL] ${message.slice(0, 300)}`);

    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[UNHANDLED]', (err as Error).message);
  process.exitCode = 1;
});
