import { ParsedIntent } from '../domain/schemas';
import { getIntentProvider, IntentAIProvider } from './provider';

export async function parseIntent(
  command: string,
  customProvider?: IntentAIProvider
): Promise<ParsedIntent> {
  const provider = customProvider || getIntentProvider();
  return provider.parseIntent(command);
}

export { getIntentProvider, GeminiIntentProvider, MockIntentProvider } from './provider';
