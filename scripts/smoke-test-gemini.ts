/**
 * Gemini Live Integration Smoke Test (Milestone R6)
 *
 * Safe, read-only verification of Gemini API connectivity.
 * Does NOT sign, broadcast, or access private keys.
 *
 * Usage:
 *   npx tsx scripts/smoke-test-gemini.ts
 */

import { GeminiIntentProvider } from '../src/core/ai/provider';

async function main() {
  console.log('========================================================');
  console.log(' SentinAI Guardian — Gemini Live Provider Smoke Test');
  console.log('========================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[RESULT] Status: LIVE_AI_NOT_VERIFIED');
    console.log('[REASON] GEMINI_API_KEY is not set in environment or .env.local.');
    console.log('\nInstructions to verify live Gemini API:');
    console.log('1. Obtain a Gemini API key from https://aistudio.google.com/');
    console.log('2. Add to .env.local: GEMINI_API_KEY="your-key-here"');
    console.log('3. Re-run: npx tsx scripts/smoke-test-gemini.ts\n');
    process.exit(0);
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  console.log(`[CONFIG] Provider: Google Gemini`);
  console.log(`[CONFIG] Model:    ${modelName}`);
  console.log(`[ACTION] Sending read-only test intent: "Show my Sepolia wallet balance"...\n`);

  try {
    const provider = new GeminiIntentProvider(apiKey, modelName);
    const intent = await provider.parseIntent('Show my Sepolia wallet balance');

    console.log('[RESULT] Status: VERIFIED_LIVE');
    console.log(`[LATENCY] ${provider.lastLatencyMs}ms`);
    console.log('[STRUCTURED_OUTPUT]:', JSON.stringify(intent, null, 2));
    console.log('\nGemini integration is operational and producing valid structured intents.');
  } catch (error) {
    console.error('[RESULT] Status: FAILED');
    console.error('[ERROR]', (error as Error).message);
    process.exit(1);
  }
}

main();
