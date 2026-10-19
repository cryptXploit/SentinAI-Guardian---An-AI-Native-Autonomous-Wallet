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
| **1. Operator Authentication** | [`src/core/security/auth.ts`](../../src/core/security/auth.ts) | HMAC-SHA256 signed session tokens stored in `httpOnly`, `sameSite: lax` cookies (`sentinai_session`) and SQLite `sessions` table with constant-time `crypto.timingSafeEqual` password verification and per-IP sliding-window login rate limiting (`5 attempts / 15 min`). | **VERIFIED** (`auth-routes.test.ts`) |
| **2. Prompt Injection & Negation Defense** | [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts), [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Dual-layer defense: (a) System prompt rules + `isAdversarialPolicyOverride()` & `isTransactionNegationOrCancellation()` inside `provider.ts` normalize policy overrides (`"Ignore all policies..."`) and negations (`"Do not send..."`, `"পাঠিও না"`) to `action: 'UNKNOWN'`; (b) Pre-builder gate in `orchestrator.ts` independently halts negated commands even if an AI provider hallucinates `TRANSFER`. | **VERIFIED** (Live Groq & Gemini + `r8-2-intent-safety.test.ts`) |
| **3. Schema & Precision Validation** | [`src/core/domain/schemas.ts`](../../src/core/domain/schemas.ts), [`src/core/utils/financial.ts`](../../src/core/utils/financial.ts) | Strict Zod schema validation (`ParsedIntentSchema`) + exact integer `BigInt` conversion (`parseTokenAmount`) rejecting scientific notation, negative values, zero transfers, and excess decimal precision (`>18` for ETH/DAI, `>6` for USDC/USDT). | **VERIFIED** (`schemas.test.ts`, `financial.test.ts`) |
| **4. Fail-Closed Recipient Resolution** | [`src/core/policy/user-policy.ts`](../../src/core/policy/user-policy.ts) | No external third-party transfer recipients are hardcoded as executable defaults (`FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES` blocks `0x0`, `0xdead`, and `0xd8dA...6045`). Unknown or unconfigured aliases fail closed at `RECIPIENT_RESOLUTION`. | **VERIFIED** (`r8-3-security-recovery.test.ts`) |
| **5. Deterministic Financial Policy Engine** | [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts) | Server-side enforcement of per-transaction native ETH cap (`maxTransferAmountETH = 1.0 ETH`), `allowUnlimitedApproval = false`, `trustedContacts`, and per-token `tokenApprovalPolicies` (`USDC`, `USDT`, `DAI` allowance ceilings and `allowedSpenders`). | **VERIFIED** (`engine.test.ts`, `r7-3-financial-policy.test.ts`) |
| **6. Pre-Flight RPC Simulation** | [`src/core/security/simulator.ts`](../../src/core/security/simulator.ts) | Executes live Sepolia `eth_chainId` (`11155111`), `eth_getCode`, `estimateGas`, and `simulateContract` using the actual sender account before proposal creation; enforces `21,000` gas floor at broadcast (`controller.ts`). | **VERIFIED** (`simulator.test.ts`, `r8-4-execution-integrity.test.ts`) |
| **7. Unkeyed Intent Integrity Proof (IIP)** | [`src/core/security/iip.ts`](../../src/core/security/iip.ts) | Computes deterministic **unkeyed `keccak256(encodePacked(...))` integrity digest** over `[candidate.to, candidate.value, BigInt(candidate.chainId), intent.action, intent.asset, policyDecision.status, dataPayload]`. Reverified at Phase 2 (`verifyIIPDigest`) before signing. *(Note: IIP is an unkeyed integrity digest, not an asymmetric cryptographic signature.)* | **VERIFIED** (`iip.test.ts`) |
| **8. Gate 6.5 Live Policy Revalidation** | [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Re-evaluates the proposal against the *current* SQLite policy (`evaluatePolicy` + `analyzeTransaction`) inside `authorizeAndExecute` immediately prior to locking and signing, preventing Time-of-Check to Time-of-Use (TOCTOU) policy drift. | **VERIFIED** (`phase3_live_ai_and_blockchain_validation.json`) |
| **9. Atomic Execution Lock & Replay Prevention** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) | SQLite Compare-And-Swap (`UPDATE proposals SET status = 'SUBMITTING' WHERE id = ? AND status = 'AUTHORIZED'`) prevents concurrent double-clicks or parallel API requests from broadcasting twice. | **VERIFIED** (`r8-4-execution-integrity.test.ts`) |
| **10. Broadcast Crash Recovery Journal** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts), [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) | Writes pre-broadcast recovery journal (`.recovery-journal.json`) and performs on-chain transaction discovery (`findMatchingBroadcastTxOnChain`) if the database or RPC connection drops mid-flight. | **VERIFIED** (`r7-3-broadcast-recovery.test.ts`) |
| **11. Security Fixture Isolation** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) | Educational threat fixtures are persisted with `provenance = 'SECURITY_FIXTURE'` and `is_executable = 0`; `authorizeProposal` and `lockProposalForExecution` hard-reject non-executable records. | **VERIFIED** (`r7-1-security-isolation.test.ts`) |
| **12. Client Bundle Secret Isolation** | [`src/core/config/env.ts`](../../src/core/config/env.ts) | `AGENT_PRIVATE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPERATOR_PASSWORD`, and `SESSION_SECRET` are strictly server-only without `NEXT_PUBLIC_` prefixes. | **VERIFIED** |
