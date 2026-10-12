import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedIntentSchema, ParsedIntent } from '../domain/schemas';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(command);
    const responseText = result.response.text();
    
    const rawJson = JSON.parse(responseText);

    return ParsedIntentSchema.parse(rawJson);
  } catch (error) {
    throw new Error("SCHEMA_ERROR: AI failed to produce a valid structured intent.");
  }
}
