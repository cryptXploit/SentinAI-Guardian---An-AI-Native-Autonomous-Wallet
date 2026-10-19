# Algorithm Design — SentinAI Guardian

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

---

## 1. Multi-Provider AI Failover & Provenance Tracking (`parseIntentWithProvenance`)

SentinAI Guardian implements a resilient AI intent parsing algorithm in [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts) and [`src/core/ai/intent-parser.ts`](../../src/core/ai/intent-parser.ts):

```
ALGORITHM 1: Resilient Multilingual Intent Parsing with Multi-Tier Failover
Input: rawCommand (string)
Output: IntentParsingProvenance { intent, providerName, modelUsed, aiProvenance, isFallback }

1. Pre-Check Adversarial & Negation Traps:
   IF isTransactionNegationOrCancellation(rawCommand) OR isAdversarialPolicyOverride(rawCommand) THEN
     RETURN { intent: { action: 'UNKNOWN', asset: '', amount: '0', recipientAlias: '' }, ... }

2. Select Primary Provider (getIntentProvider):
   - If GEMINI_API_KEY is configured -> GeminiIntentProvider(model='gemini-3.8-flash', timeout=10000ms)
   - Else if GROQ_API_KEY is configured -> GroqIntentProvider(model='openai/gpt-oss-120b', timeout=10000ms)
   - Else -> MockIntentProvider (Deterministic local regex/multilingual fallback)

3. Execute with Automatic Tiered Failover:
   TRY:
     intent = AWAIT primaryProvider.parseIntent(rawCommand)
     RETURN { intent, providerName: primaryProvider.name, aiProvenance: isLive ? 'LIVE_AI' : 'DETERMINISTIC_FALLBACK', isFallback: false }
   CATCH primaryError:
     IF primaryProvider.name === 'gemini' AND env.GROQ_API_KEY exists THEN
       TRY:
         groqIntent = AWAIT GroqIntentProvider().parseIntent(rawCommand)
         RETURN { intent: groqIntent, providerName: 'groq', aiProvenance: 'LIVE_AI', isFallback: true }
       CATCH groqError:
         FALLTHROUGH to Tier 3
     // Tier 3 Local Deterministic Fallback
     fallbackIntent = AWAIT MockIntentProvider().parseIntent(rawCommand)
     RETURN { intent: fallbackIntent, providerName: 'mock', aiProvenance: 'DETERMINISTIC_FALLBACK', isFallback: true }
```

---

## 2. Exact Integer Financial Arithmetic (`parseTokenAmount`)

Floating-point numbers (`parseFloat`) introduce IEEE-754 representation errors. SentinAI Guardian uses pure string validation and `viem`'s `parseUnits` in [`src/core/utils/financial.ts`](../../src/core/utils/financial.ts):

1. Trim input string and reject scientific notation (`/e/i.test(trimmed)`) and negative signs (`trimmed.startsWith('-')`).
2. Validate numeric format against `/^\d*\.?\d+$/` and `/^\d+\.?\d*$/`.
3. Lookup asset decimals $D \in \{18 \text{ for ETH/DAI}, 6 \text{ for USDC/USDT}\}$.
4. Split at `'.'`; if fractional length $> D$, throw `"Too many decimal places"` (never silently truncate fractional base units).
5. Convert to exact `bigint` via `parseUnits(trimmed, decimals)`.

---

## 3. Deterministic Policy Evaluation (`evaluatePolicy`)

Implemented in [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts):

1. **Trusted Contact Resolution (`resolveRecipientFromPolicy`):**
   - Resolves `intent.recipientAlias` case-insensitively against `policy.trustedContacts` (while blocking forbidden addresses in `FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES`: `0x0000...0000`, `0x0000...dead`, and `0xd8dA...6045`). Unknown or unconfigured aliases fail closed (`status: "BLOCKED"`).
2. **Per-Transaction Native ETH Cap:**
   - For `TRANSFER` of `ETH`, rejects `"UNLIMITED"` and verifies:
     $$\text{parseTokenAmount}(\text{intent.amount}, 18) \le \text{parseTokenAmount}(\text{policy.maxTransferAmountETH}, 18)$$
     and `candidate.value <= maxAmount`.
3. **Unlimited Approval Gate:**
   - For `APPROVE`, if `intent.amount === 'UNLIMITED'` and `!policy.allowUnlimitedApproval`, blocks execution.
4. **EVM Calldata Decoding & Token-Specific Approval Policies:**
   - Decodes `0x095ea7b3` (`approve(address spender, uint256 amount)`) via `decodeFunctionData`.
   - Verifies decoded `spender` matches `resolvedAddress`.
   - Looks up `findTokenApprovalPolicy(policy, candidate.chainId, candidate.to)` for the target token (`USDC`, `USDT`, `DAI`), failing closed if no token policy exists, if `spender` is not in `tokenPolicy.allowedSpenders`, or if `allowance > BigInt(tokenPolicy.maxApprovalAmountBaseUnits)`.

---

## 4. Unkeyed Intent Integrity Proof Digest (`computeIIPDigest` & `verifyIIPDigest`)

Implemented in [`src/core/security/iip.ts`](../../src/core/security/iip.ts):

To detect any tampering between Phase 1 preparation and Phase 2 execution, SentinAI Guardian computes a deterministic, **unkeyed `keccak256` integrity digest** over ABI-packed fields using `viem`'s `encodePacked`:

$$\text{IIP Digest} = \text{keccak256}\Big(\text{encodePacked}\big([\text{'address'}, \text{'uint256'}, \text{'uint256'}, \text{'string'}, \text{'string'}, \text{'string'}, \text{'bytes'}], [\text{candidate.to}, \text{candidate.value}, \text{BigInt}(\text{candidate.chainId}), \text{intent.action}, \text{intent.asset}, \text{policyDecision.status}, \text{dataPayload}]\big)\Big)$$

> **Security Note:** The IIP digest is an **unkeyed cryptographic hash (`keccak256`)**, not an asymmetric signature. It binds the stored proposal's intent, policy decision, and EVM candidate parameters so that `verifyIIPDigest(proposal.iipData)` at Phase 2 rejects any modified candidate prior to signing.
