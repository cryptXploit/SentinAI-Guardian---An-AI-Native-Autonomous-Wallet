import { ParsedIntent } from '../domain/schemas';
import { getIntentProvider, IntentAIProvider, MockIntentProvider } from './provider';

export async function parseIntent(
  command: string,
  customProvider?: IntentAIProvider
): Promise<ParsedIntent> {
  const provider = customProvider || getIntentProvider();
  try {
    return await provider.parseIntent(command);
  } catch (error) {
    if (process.env.AI_PROVIDER?.toLowerCase() === 'gemini') {
      throw error;
    }
    const fallback = new MockIntentProvider();
    return fallback.parseIntent(command);
  }
}

export { getIntentProvider, GeminiIntentProvider, MockIntentProvider } from './provider';
