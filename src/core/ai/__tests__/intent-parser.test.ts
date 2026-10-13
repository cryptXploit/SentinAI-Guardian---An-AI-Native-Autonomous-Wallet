import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIntent } from '../intent-parser';

vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });

  return {
    GoogleGenerativeAI: class {
      getGenerativeModel = mockGetGenerativeModel;
    },
    __mockGenerateContent: mockGenerateContent,
  };
});

describe('Intent Parser Engine', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it('should return a valid ParsedIntent on successful AI generation', async () => {
    const { __mockGenerateContent } = (await import('@google/generative-ai')) as unknown as {
      __mockGenerateContent: ReturnType<typeof vi.fn>;
    };

    __mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            action: 'TRANSFER',
            asset: 'ETH',
            amount: '0.05',
            recipientAlias: 'david',
          }),
      },
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
    const { __mockGenerateContent } = (await import('@google/generative-ai')) as unknown as {
      __mockGenerateContent: ReturnType<typeof vi.fn>;
    };

    __mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            action: 'BURN', // Invalid action
            asset: 'ETH',
          }),
      },
    });

    await expect(parseIntent('Burn my tokens')).rejects.toThrow('SCHEMA_ERROR');
  });

  it('should throw CONFIG_ERROR if GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(parseIntent('Send 0.05 ETH to david')).rejects.toThrow('CONFIG_ERROR');
  });
});
