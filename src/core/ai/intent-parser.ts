import { ParsedIntent } from '../domain/schemas';
import {
  getIntentProvider,
  IntentAIProvider,
  GroqIntentProvider,
  MockIntentProvider,
} from './provider';

export type IntentParsingProvenance = {
  intent: ParsedIntent;
  providerName: 'gemini' | 'groq' | 'mock';
  isFallback: boolean;
  aiProvenance: 'LIVE_AI' | 'DETERMINISTIC_FALLBACK';
  modelUsed?: string;
  error?: string;
};

export async function parseIntentWithProvenance(
  command: string,
  customProvider?: IntentAIProvider
): Promise<IntentParsingProvenance> {
  const provider = customProvider || getIntentProvider();
  try {
    const intent = await provider.parseIntent(command);
    const isLive = provider.name === 'gemini' || provider.name === 'groq';
    return {
      intent,
      providerName: provider.name as 'gemini' | 'groq' | 'mock',
      isFallback: false,
      aiProvenance: isLive ? 'LIVE_AI' : 'DETERMINISTIC_FALLBACK',
      modelUsed: provider.modelName,
    };
  } catch (error) {
    const explicitProvider = process.env.AI_PROVIDER?.toLowerCase();
    if (explicitProvider === 'gemini' || explicitProvider === 'groq') {
      throw error;
    }

    const primaryErrorMsg = error instanceof Error ? error.message : String(error);

    // Tier 2 Live AI Failover: If Gemini failed (e.g. HTTP 429 quota exhausted) and GROQ_API_KEY is available, try Groq!
    if (!customProvider && provider.name === 'gemini' && process.env.GROQ_API_KEY) {
      try {
        const groqProvider = new GroqIntentProvider();
        const groqIntent = await groqProvider.parseIntent(command);
        return {
          intent: groqIntent,
          providerName: 'groq',
          isFallback: true,
          aiProvenance: 'LIVE_AI',
          modelUsed: groqProvider.modelName,
          error: primaryErrorMsg,
        };
      } catch (groqError) {
        const groqErrorMsg = groqError instanceof Error ? groqError.message : String(groqError);
        const fallback = new MockIntentProvider();
        const intent = await fallback.parseIntent(command);
        return {
          intent,
          providerName: 'mock',
          isFallback: true,
          aiProvenance: 'DETERMINISTIC_FALLBACK',
          error: `${primaryErrorMsg} | Groq Fallback Error: ${groqErrorMsg}`,
        };
      }
    }

    // Tier 3 Local Deterministic Fallback
    const fallback = new MockIntentProvider();
    const intent = await fallback.parseIntent(command);
    return {
      intent,
      providerName: 'mock',
      isFallback: true,
      aiProvenance: 'DETERMINISTIC_FALLBACK',
      error: primaryErrorMsg,
    };
  }
}

export async function parseIntent(
  command: string,
  customProvider?: IntentAIProvider
): Promise<ParsedIntent> {
  const result = await parseIntentWithProvenance(command, customProvider);
  return result.intent;
}

export {
  getIntentProvider,
  GeminiIntentProvider,
  GroqIntentProvider,
  MockIntentProvider,
  SUPPORTED_GROQ_MODELS,
  getLastActiveProviderName,
  isTransactionNegationOrCancellation,
  normalizeBengaliInput,
  convertBengaliDigits,
} from './provider';
