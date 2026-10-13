import { GoogleGenAI } from '@google/genai';
import { TransactionAnalysisResult } from '../security/transaction-analyzer';

export interface SecurityExplanationResult {
  source: 'GEMINI_AI' | 'DETERMINISTIC_RULES';
  explanationText: string;
  keyPoints: string[];
  recommendedAction: string;
  modelUsed?: string;
  latencyMs?: number;
}

const EXPLAINER_SYSTEM_PROMPT = `
You are a blockchain transaction security educator for SentinAI Guardian.
Your role is to explain technical security findings and transaction parameters in clear, concise financial English.

STRICT INVARIANTS:
1. You have ZERO authority to approve, unblock, or modify any transaction decision.
2. The security decision has ALREADY been finalized by the deterministic engine.
3. You must ground your explanation entirely in the provided findings and parameter comparisons.
4. Keep the explanation to 2-3 sentences.
5. Provide 2-3 bullet key points and a clear recommended operator action.
`;

/**
 * Generates an educational, user-facing explanation of transaction security findings.
 * Grounded strictly in the deterministic analysis result.
 * An AI explanation NEVER modifies the underlying security verdict.
 */
export async function explainSecurityFindings(params: {
  analysis: TransactionAnalysisResult;
  apiKey?: string;
  modelName?: string;
}): Promise<SecurityExplanationResult> {
  const { analysis, apiKey = process.env.GEMINI_API_KEY, modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash' } = params;

  // If live Gemini is configured, attempt AI explanation with 5s timeout
  if (apiKey) {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 5_000);

    try {
      const ai = new GoogleGenAI({ apiKey });

      // Build safe sanitized prompt containing ONLY public analysis facts (NO secrets)
      const prompt = `
Analyze the following transaction security verdict and explain it to the user:
- Operation: ${analysis.operationType}
- Verdict: ${analysis.status} (canExecute: ${analysis.canExecute})
- Expected Intent: ${analysis.expectedAction.action} ${analysis.expectedAction.amount} ${analysis.expectedAction.asset} to ${analysis.expectedAction.resolvedRecipient}
- Decoded Transaction: Method ${analysis.decodedAction.method} calling ${analysis.decodedAction.targetContract} with amount ${analysis.decodedAction.formattedAmount} ${analysis.decodedAction.tokenSymbol}
- Mismatches Detected: ${analysis.mismatches.join(', ') || 'None'}
- Findings:
${analysis.findings.map((f) => `  [${f.severity}] ${f.title}: ${f.explanation}`).join('\n')}

Format your response as a brief plain-text explanation followed by key considerations.
`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: EXPLAINER_SYSTEM_PROMPT,
          temperature: 0.2,
          abortSignal: abortController.signal,
        },
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const text = response.text || '';

      if (text.trim()) {
        return {
          source: 'GEMINI_AI',
          explanationText: text.trim(),
          keyPoints: analysis.findings.map((f) => `[${f.severity}] ${f.title}`),
          recommendedAction: analysis.canExecute
            ? 'Verify details on screen before authorizing execution.'
            : 'Reject transaction. Do not authorize.',
          modelUsed: modelName,
          latencyMs,
        };
      }
    } catch {
      clearTimeout(timer);
      // Fall through to deterministic rules on AI failure / timeout
    }
  }

  // Deterministic rule-based explanation (offline, fast, and 100% reliable)
  return generateDeterministicExplanation(analysis);
}

/**
 * Deterministic generator based directly on finding codes.
 */
export function generateDeterministicExplanation(
  analysis: TransactionAnalysisResult
): SecurityExplanationResult {
  const { status, mismatches, findings, decodedAction, expectedAction } = analysis;

  const keyPoints: string[] = [];
  let explanationText = '';
  let recommendedAction = '';

  if (status === 'BLOCKED') {
    recommendedAction = 'Do not authorize. Re-verify your prompt instructions or recipient address.';

    if (mismatches.includes('RECIPIENT_MISMATCH')) {
      explanationText = `Transaction blocked: Destination address (${decodedAction.recipientOrSpender.slice(0, 10)}...) does not match your authorized contact (${expectedAction.resolvedRecipient.slice(0, 10)}...).`;
      keyPoints.push('The destination address was substituted or altered.');
    } else if (mismatches.includes('APPROVAL_AMOUNT_MISMATCH')) {
      explanationText = `Transaction blocked: The requested contract allowance (${decodedAction.formattedAmount} ${decodedAction.tokenSymbol}) exceeds your authorized amount (${expectedAction.amount} ${expectedAction.asset}).`;
      keyPoints.push('Calldata requests an allowance substantially higher than intended.');
    } else if (mismatches.includes('UNLIMITED_APPROVAL_REQUEST') || mismatches.includes('UNLIMITED_APPROVAL_MISMATCH')) {
      explanationText = `Transaction blocked: Contract call requests permanent, unlimited withdrawal rights (2^256-1) over your ${decodedAction.tokenSymbol} tokens, violating user policy.`;
      keyPoints.push('Unlimited allowance grants unrestricted spending access.');
    } else if (mismatches.includes('TRANSACTION_METHOD_MISMATCH')) {
      explanationText = `Transaction blocked: User requested a ${expectedAction.action}, but the compiled bytecode executes an ${decodedAction.method}. This matches approval phishing attack patterns.`;
      keyPoints.push('Transaction method was altered from transfer to approval.');
    } else if (mismatches.includes('TOKEN_CONTRACT_MISMATCH')) {
      explanationText = `Transaction blocked: The contract address (${decodedAction.targetContract}) does not match the official verified ${expectedAction.asset} token contract.`;
      keyPoints.push('Target contract address does not match verified token registry.');
    } else if (mismatches.includes('WRONG_CHAIN')) {
      explanationText = `Transaction blocked: The transaction payload targets an unauthorized blockchain network instead of Sepolia Testnet.`;
      keyPoints.push('Cross-network execution is prohibited.');
    } else if (mismatches.includes('UNSUPPORTED_CALLDATA')) {
      explanationText = `Transaction blocked: The transaction payload contains unrecognized function bytecode or arbitrary smart contract interactions.`;
      keyPoints.push('Unknown calldata selectors fail closed.');
    } else {
      explanationText = `Transaction blocked: One or more deterministic risk controls failed: ${findings.map((f) => f.title).join('; ')}.`;
      keyPoints.push(...findings.map((f) => f.title));
    }
  } else if (status === 'SUSPICIOUS') {
    explanationText = `Transaction has elevated risk: Review the warnings below carefully before proceeding.`;
    recommendedAction = 'Review spender details and current balance exposure before signing.';
    keyPoints.push(...findings.map((f) => f.title));
  } else {
    explanationText = `Transaction verified: Parameters match your requested ${expectedAction.action} of ${expectedAction.amount} ${expectedAction.asset}. All deterministic policy checks and Sepolia simulations passed.`;
    recommendedAction = 'Proceed with explicit operator confirmation to sign and broadcast.';
    keyPoints.push('Recipient and token contract verified against registry.');
    keyPoints.push('Amount and calldata match requested intent.');
    keyPoints.push('Simulation verified successful execution.');
  }

  return {
    source: 'DETERMINISTIC_RULES',
    explanationText,
    keyPoints,
    recommendedAction,
  };
}
