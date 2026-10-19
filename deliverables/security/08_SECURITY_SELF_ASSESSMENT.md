# Phase 5: Security Self-Assessment Report

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  
**Assessment Date:** October 19, 2026  

---

## 1. Executive Security Thesis

Autonomous AI wallets face a fundamental security paradox: **Large Language Models (LLMs) are probabilistic and susceptible to prompt injection, hallucination, and semantic manipulation, whereas blockchain transactions are deterministic and irreversible.**

SentinAI Guardian resolves this paradox through **Strict Privilege Separation**:
1. **Untrusted AI Layer:** Gemini (`gemini-3.8-flash`) and Groq (`openai/gpt-oss-120b`) are restricted strictly to translating natural language into an unprivileged candidate JSON structure (`ParsedIntent`). The AI layer has **zero access** to private keys, RPC signing methods, or SQLite policy state.
2. **Deterministic Enforcement Layer:** Every candidate intent must pass through **six deterministic server-side gates** implemented in TypeScript and backed by SQLite ACID transactions before any signature can occur.

---

## 2. Comprehensive Security Control Matrix

| Control Domain | Implementation File(s) | Security Mechanism | Verification Status |
|---|---|---|---|
| **1. Operator Authentication** | [`src/core/security/auth.ts`](../../src/core/security/auth.ts) | HMAC-SHA256 signed session tokens stored in `httpOnly`, `sameSite: lax` cookies (`sentinai_session`) with constant-time `crypto.timingSafeEqual` verification and per-IP sliding-window login rate limiting (`5 attempts / 15 min`). | **VERIFIED** (`auth-routes.test.ts`) |
| **2. Prompt Injection & Negation Defense** | [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts), [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Dual-layer defense: (a) System prompt rules + `isAdversarialPolicyOverride()` & `isTransactionNegationOrCancellation()` inside `provider.ts` normalize policy overrides (`"Ignore all policies..."`) and negations (`"Do not send..."`, `"পাঠিও না"`) to `action: 'UNKNOWN'`; (b) Pre-builder gate in `orchestrator.ts` independently halts negated commands even if an AI provider hallucinates `TRANSFER`. | **VERIFIED** (Live Groq & Gemini + `r8-2-intent-safety.test.ts`) |
| **3. Schema & Precision Validation** | [`src/core/domain/schemas.ts`](../../src/core/domain/schemas.ts), [`src/core/utils/financial.ts`](../../src/core/utils/financial.ts) | Strict Zod schema validation (`ParsedIntentSchema`) + exact integer `BigInt` conversion (`parseAssetAmountToBigInt`) rejecting scientific notation, negative values, zero transfers, and excess decimal precision (`>18` for ETH/LINK, `>6` for USDC). | **VERIFIED** (`schemas.test.ts`, `financial.test.ts`) |
| **4. Fail-Closed Recipient Resolution** | [`src/core/policy/user-policy.ts`](../../src/core/policy/user-policy.ts) | No external third-party addresses are hardcoded as executable defaults. Unknown or unconfigured aliases return `null` and halt execution at `RECIPIENT_RESOLUTION`. | **VERIFIED** (`r8-3-security-recovery.test.ts`) |
| **5. Deterministic Financial Policy Engine** | [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts) | Server-side enforcement of Chain ID (`11155111`), allowed assets (`ETH`, `USDC`, `LINK`), per-tx limit, 24h rolling daily limit, trusted recipient registry, and ERC-20 spender allowlist + allowance caps. | **VERIFIED** (`engine.test.ts`, `r7-3-financial-policy.test.ts`) |
| **6. Pre-Flight RPC Simulation** | [`src/core/security/simulator.ts`](../../src/core/security/simulator.ts) | Executes live Sepolia `estimateGas` and `simulateContract` using the actual sender account before proposal creation; enforces `21,000` gas floor at broadcast (`controller.ts`). | **VERIFIED** (`simulator.test.ts`, `r8-4-execution-integrity.test.ts`) |
| **7. Cryptographic Intent Integrity Proof (IIP)** | [`src/core/security/iip.ts`](../../src/core/security/iip.ts) | Computes deterministic `keccak256` digest over canonical JSON (`chainId`, `from`, `to`, `value`, `data`, `intentAction`, `asset`, `amount`). Reverified at Phase 2 (`verifyIIPDigest`) before signing. | **VERIFIED** (`iip.test.ts`) |
| **8. Gate 6.5 Live Policy Revalidation** | [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Re-evaluates the proposal against the *current* SQLite policy and live wallet balance inside `authorizeAndExecute` immediately prior to locking and signing, preventing Time-of-Check to Time-of-Use (TOCTOU) policy bypasses. | **VERIFIED** (`phase3_live_ai_and_blockchain_validation.json`) |
| **9. Atomic Execution Lock & Replay Prevention** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) | SQLite Compare-And-Swap (`UPDATE proposals SET status = 'SUBMITTING' WHERE id = ? AND status = 'AUTHORIZED'`) prevents concurrent double-clicks or parallel API requests from broadcasting twice. | **VERIFIED** (`r5c-durable-idempotency`, `r8-4-execution-integrity.test.ts`) |
| **10. Broadcast Crash Recovery Journal** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts), [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Writes pre-broadcast recovery journal (`.recovery-journal.json`) and performs on-chain transaction discovery (`findMatchingBroadcastTxOnChain`) if the database or RPC connection drops mid-flight. | **VERIFIED** (`r7-3-broadcast-recovery.test.ts`) |
| **11. Security Fixture Isolation** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) | Educational threat fixtures are persisted with `provenance = 'SECURITY_FIXTURE'` and `is_executable = 0`; `authorizeProposal` and `lockProposalForExecution` hard-reject non-executable records. | **VERIFIED** (`r7-1-security-isolation.test.ts`) |
| **12. Client Bundle Secret Isolation** | [`src/core/config/env.ts`](../../src/core/config/env.ts) | `AGENT_PRIVATE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPERATOR_PASSWORD`, and `SESSION_SECRET` are strictly server-only without `NEXT_PUBLIC_` prefixes. | **VERIFIED** |
