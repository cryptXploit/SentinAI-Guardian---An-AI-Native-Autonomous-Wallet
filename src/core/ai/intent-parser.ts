import { ParsedIntent } from '../domain/schemas';
import { getIntentProvider, IntentAIProvider, MockIntentProvider } from './provider';

export type IntentParsingProvenance = {
  intent: ParsedIntent;
  providerName: 'gemini' | 'mock';
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
    return {
      intent,
      providerName: provider.name as 'gemini' | 'mock',
      isFallback: false,
      aiProvenance: provider.name === 'gemini' ? 'LIVE_AI' : 'DETERMINISTIC_FALLBACK',
      modelUsed: provider.modelName,
    };
  } catch (error) {
    if (process.env.AI_PROVIDER?.toLowerCase() === 'gemini') {
      throw error;
    }
    const fallback = new MockIntentProvider();
    const intent = await fallback.parseIntent(command);
    return {
      intent,
      providerName: 'mock',
      isFallback: true,
      aiProvenance: 'DETERMINISTIC_FALLBACK',
      error: error instanceof Error ? error.message : String(error),
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

export { getIntentProvider, GeminiIntentProvider, MockIntentProvider } from './provider';
