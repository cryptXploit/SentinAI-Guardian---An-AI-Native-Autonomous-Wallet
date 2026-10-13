import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIntent } from '../intent-parser';

vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn();

  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
      NULL: 'NULL',
    },
    __mockGenerateContent: mockGenerateContent,
  };
});

describe('Intent Parser Engine', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.AI_PROVIDER = "gemini";
  });

  it('should return a valid ParsedIntent on successful AI generation', async () => {
    const { __mockGenerateContent } = (await import('@google/genai')) as unknown as {
      __mockGenerateContent: ReturnType<typeof vi.fn>;
    };

    __mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        action: 'TRANSFER',
        asset: 'ETH',
        amount: '0.05',
        recipientAlias: 'david',
      }),
    });

    const intent = await parseIntent('Send 0.05 ETH to david');
    expect(intent).toEqual({
      action: 'TRANSFER',
      asset: 'ETH',
      amount: '0.05',
      recipientAlias: 'david',
    });
  });

  it('should throw SCHEMA_ERROR on hallucinated AI response', async () => {
    const { __mockGenerateContent } = (await import('@google/genai')) as unknown as {
      __mockGenerateContent: ReturnType<typeof vi.fn>;
    };

    __mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        action: 'BURN', // Invalid action
        asset: 'ETH',
        amount: '1.0',
        recipientAlias: 'vitalik',
      }),
    });

    await expect(parseIntent('Burn 1 ETH')).rejects.toThrow('SCHEMA_ERROR');
  });

  it('should throw SCHEMA_ERROR on malformed JSON response', async () => {
    const { __mockGenerateContent } = (await import('@google/genai')) as unknown as {
      __mockGenerateContent: ReturnType<typeof vi.fn>;
    };

    __mockGenerateContent.mockResolvedValueOnce({
      text: 'Malformed { not-valid-json }',
    });

    await expect(parseIntent('Send 1 ETH to charlie')).rejects.toThrow('SCHEMA_ERROR');
  });
});
