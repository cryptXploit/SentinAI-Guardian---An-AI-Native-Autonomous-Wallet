# Algorithm Design — SentinAI Guardian

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

---

## 1. Multi-Provider AI Failover & Request-Scoped Provenance (`parseIntentWithProvenance`)

SentinAI Guardian implements a resilient, self-healing AI intent parsing algorithm in [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts) and [`src/core/ai/intent-parser.ts`](../../src/core/ai/intent-parser.ts):

```
ALGORITHM 1: Resilient Multilingual Intent Parsing with Request-Scoped Provenance
Input: rawCommand (string)
Output: IntentParseWithProvenanceResult { intent, providerName, modelUsed, aiProvenance, isFallback }

1. Pre-Check Adversarial & Negation Traps:
   IF isTransactionNegationOrCancellation(rawCommand) OR isAdversarialPolicyOverride(rawCommand) THEN
     RETURN { intent: { action: 'UNKNOWN', asset: '', amount: '0', recipientAlias: '' }, ... }

2. Construct Ordered Provider Chain:
   chain = []
   IF env.GEMINI_API_KEY exists THEN append GeminiIntentProvider(model='gemini-3.8-flash', timeout=10000ms)
   IF env.GROQ_API_KEY exists   THEN append GroqIntentProvider(model='openai/gpt-oss-120b', timeout=10000ms)
   append MockIntentProvider() // Deterministic local regex/multilingual fallback

3. Iterate Through Chain:
   FOR index = 0 TO chain.length - 1 DO
     provider = chain[index]
     TRY
       rawJson = AWAIT provider.callModel(rawCommand)
       validatedIntent = ParsedIntentSchema.parse(rawJson)
       RETURN {
         intent: validatedIntent,
         providerName: provider.name,
         modelUsed: provider.modelName,
         aiProvenance: provider.name === 'mock' ? 'DETERMINISTIC_FALLBACK' : 'LIVE_AI',
         isFallback: index > 0
       }
     CATCH error (HTTP_429 | HTTP_5XX | REQUEST_TIMEOUT | INVALID_JSON | ZOD_ERROR)
       RECORD sanitized error and CONTINUE to next provider in chain
```

---

## 2. Exact Integer Financial Arithmetic (`parseAssetAmountToBigInt`)

Floating-point numbers (`parseFloat`) introduce IEEE-754 representation errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). SentinAI Guardian uses pure string-to-`BigInt` decimal scaling in [`src/core/utils/financial.ts`](../../src/core/utils/financial.ts):

1. Validate `amountStr` against strict regex `/^\d+(\.\d+)?$/` (rejecting scientific notation `1e18`, negative signs, NaN, and whitespace).
2. Split `amountStr` at `'.'` into `(wholePart, fracPart)`.
3. Lookup asset decimals $D \in \{18 \text{ for ETH/LINK}, 6 \text{ for USDC}\}$.
4. If $\text{length}(\text{fracPart}) > D$, reject with `EXCESS_DECIMAL_PRECISION` (never silently truncate fractional wei).
5. Right-pad `fracPart` with zeros to length $D$:
   $$\text{baseUnits} = \text{BigInt}(\text{wholePart}) \times 10^D + \text{BigInt}(\text{padRight}(\text{fracPart}, D, \text{'0'}))$$
6. Enforce $\text{baseUnits} > 0n$.

---

## 3. Deterministic Policy Evaluation & Rolling 24-Hour Spend Cap (`evaluatePolicy`)

Implemented in [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts):

1. **Chain Allowlist Check:** Verify `candidate.chainId` $\in$ `policy.allowedChains` (`[11155111]`).
2. **Asset Allowlist Check:** Verify `intent.asset` $\in$ `policy.allowedAssets` (`['ETH', 'USDC', 'LINK']`).
3. **Action-Specific Address Verification:**
   - If `intent.action === 'TRANSFER'`: Verify `candidate.to` matches a checksummed address in `policy.trustedRecipients`.
   - If `intent.action === 'APPROVE'`: Decode ERC-20 `approve(address spender, uint256 amount)` calldata (`0x095ea7b3`) and verify `spender` is in `policy.approvedSpenders` and `amount <= maxAllowanceWei`.
4. **Per-Transaction Spend Limit:**
   $$\text{amountWei} \le \text{parseAssetAmountToBigInt}(\text{policy.perTxLimitEth}, 18)$$
5. **Rolling 24-Hour Cumulative Spend Cap:**
   Query SQLite (`getRolling24hSpendWei`) for all proposals with `status IN ('SUBMITTED', 'CONFIRMED')` created within $[t_{\text{now}} - 86400\text{s}, t_{\text{now}}]$:
   $$\text{rolling24hSpendWei} + \text{amountWei} \le \text{parseAssetAmountToBigInt}(\text{policy.dailyLimitEth}, 18)$$

---

## 4. Cryptographic Intent Integrity Proof (`generateIIP` & `verifyIIPDigest`)

Implemented in [`src/core/security/iip.ts`](../../src/core/security/iip.ts):

To bind the user's semantic intent to the exact low-level EVM transaction parameters, SentinAI Guardian constructs a deterministic canonical payload:

$$\text{CanonicalPayload} = \text{JSON.stringify}\left(\left\{\begin{aligned}
&\text{action}: \text{intent.action}, \\
&\text{amount}: \text{intent.amount}, \\
&\text{asset}: \text{intent.asset.toUpperCase()}, \\
&\text{chainId}: \text{candidate.chainId}, \\
&\text{data}: \text{candidate.data.toLowerCase()}, \\
&\text{recipientAlias}: \text{intent.recipientAlias.toLowerCase()}, \\
&\text{to}: \text{candidate.to.toLowerCase()}, \\
&\text{value}: \text{candidate.value.toString()}
\end{aligned}\right\}\right)$$

$$\text{IIP Digest} = \text{keccak256}(\text{toBytes}(\text{CanonicalPayload}))$$

Before Phase 2 signing (`authorizeAndExecute`), `verifyIIPDigest` recomputes $\text{keccak256}(\text{CanonicalPayload})$ from the stored SQLite record and compares it against `proposal.digest`. Any discrepancy halts execution immediately.
