import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedIntentSchema, ParsedIntent } from '../domain/schemas';

const SYSTEM_PROMPT = `
You are an intent parsing engine for a decentralized finance wallet.
Your job is to analyze the user's command and extract the intent into a strict JSON format.

The JSON object MUST EXACTLY match this shape:
{
  "action": "TRANSFER" | "APPROVE" | "SWAP" | "UNKNOWN",
  "asset": "string" (e.g. "ETH", "USDC"),
  "amount": "string" (a numeric string like "1.5" or "0.05", or "UNLIMITED"),
  "recipientAlias": "string" (the name or alias of the person/entity receiving the funds)
}

Rules:
- action must be one of the exact strings listed. If you cannot determine the action, use "UNKNOWN".
- asset must be uppercase.
- amount must be a string representation of the number, or "UNLIMITED".
- recipientAlias must be a string. If not provided, use an empty string "".
`;

export async function parseIntent(command: string): Promise<ParsedIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("CONFIG_ERROR: GEMINI_API_KEY is not configured in environment.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    // Enforce 15-second request timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI_TIMEOUT: Gemini API request timed out after 15 seconds.")), 15_000)
    );

    const generatePromise = model.generateContent(command);
    const result = await Promise.race([generatePromise, timeoutPromise]);
    const responseText = result.response.text();

    const rawJson = JSON.parse(responseText);
    return ParsedIntentSchema.parse(rawJson);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("AI_TIMEOUT")) {
      throw error;
    }
    throw new Error(`SCHEMA_ERROR: AI failed to produce a valid structured intent: ${msg}`);
  }
}
