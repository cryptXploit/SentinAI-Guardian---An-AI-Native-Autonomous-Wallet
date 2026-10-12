import { describe, it, expect, vi } from 'vitest';
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
  it('should return a valid ParsedIntent on successful AI generation', async () => {
    const { __mockGenerateContent } = await import('@google/generative-ai') as any;
    
    __mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          action: "TRANSFER",
          asset: "ETH",
          amount: "0.05",
          recipientAlias: "david"
        })
      }
    });

    const intent = await parseIntent("Send 0.05 ETH to david");
    expect(intent).toEqual({
      action: "TRANSFER",
      asset: "ETH",
      amount: "0.05",
      recipientAlias: "david"
    });
  });

  it('should throw SCHEMA_ERROR on hallucinated AI response', async () => {
    const { __mockGenerateContent } = await import('@google/generative-ai') as any;
    
    __mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          action: "BURN", // Invalid action
          asset: "ETH"
          // Missing amount, recipientAlias
        })
      }
    });

    await expect(parseIntent("Burn all my ETH")).rejects.toThrow(
      "SCHEMA_ERROR: AI failed to produce a valid structured intent."
    );
  });
});
