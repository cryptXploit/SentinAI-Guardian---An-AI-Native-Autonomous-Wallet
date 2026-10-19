# Architecture Overview: SentinAI Guardian

**Project:** SentinAI Guardian**Competition:** 2026 Shenzhen International FinTech Competition**International Track:** Topic F — Autonomous Agent Wallet**Milestone:** R8.5 — Final Competition Release (See [`docs/architecture/11_SYSTEM_ARCHITECTURE.md`](../../docs/architecture/11_SYSTEM_ARCHITECTURE.md)–[`15_DATA_FLOW_AND_SEQUENCE.md`](../../docs/architecture/15_DATA_FLOW_AND_SEQUENCE.md) for full architecture specifications)
SentinAI Guardian is an Intent-Aware Autonomous Wallet built to bridge Large Language Models (LLMs) with EVM-compatible blockchains securely. It enforces strict separation between untrusted AI interpretation (Groq Llama 3.3 70B / Gemini 2.5 Flash / Mock), deterministic transaction construction, semantic calldata inspection, and two-phase human authorization.

---

## 1. High-Level System Architecture

SentinAI Guardian employs a **Zero-Trust, Human-in-the-Loop, Semantic-Verified Execution Architecture** built on Next.js 16 (App Router), TypeScript, SQLite with WAL journaling, and Viem for EVM communications.

```
[ Operator / Agent ] ──> Natural Language Command OR Test Fixture
                               │
                               ▼
     ┌────────────────────────────────────────────────────────┐
     │         Phase 1: Preparation & Intent Parsing          │
     ├────────────────────────────────────────────────────────┤
     │  - Input Sanitization (500 char max, injection filter) │
     │  - IntentAIProvider (@google/genai / Mock)             │
     │  - Read-Only vs State-Changing Routing Check           │
     └─────────────┬────────────────────────────┬─────────────┘
                   │                            │
         [Read-Only Action]           [State-Changing Action]
                   │                            │
                   ▼                            ▼
    ┌──────────────────────┐   ┌───────────────────────────────────────────────┐
    │ Direct Live Read     │   │ 1. Transaction Candidate Builder              │
    │  - Sepolia RPC check │   │    - ABI Calldata compilation (ETH/ERC-20)    │
    │  - Native + ERC-20   │   │    - Strict BigInt parseUnits                 │
    │    wallet overview   │   │ 2. EVM Simulation Engine                      │
    │  - No proposal made  │   │    - RPC dry-run (estimateGas)                │
    │  - Zero key access   │   │ 3. Deterministic Policy Engine                │
    │  - Isolated cache    │   │    - Mathematical whitelist & spend limits    │
    └──────────────┬───────┘   │ 4. Intent-Aware Transaction Analyzer (R7)     │
                   │           │    - Independent ABI calldata decoding        │
                   │           │    - 10 Intent-Mismatch rules verification    │
                   │           │ 5. Approval Exposure Intelligence (R7)        │
                   │           │    - Bounded vs unlimited allowance check     │
                   │           │ 6. Grounded Security Explainer (R7)           │
                   │           │    - AI educational insights (no veto power)  │
                   │           │ 7. Intent Integrity Proof (IIP)               │
                   │           │    - Keccak-256 canonical digest over calldata│
                   │           │ 8. SQLite Proposal Store                      │
                   │           │    - Atomic ownership & expiration lock       │
                   │           └──────────────────────┬────────────────────────┘
                   │                                  │
                   │                                  ▼
                   │                   ┌───────────────────────────────┐
                   │                   │ Human-in-the-Loop Gate        │
                   │                   │ IntentComparisonPanel UI      │
                   │                   │ - Side-by-side mismatch check │
                   │                   │ - Explicit "Confirm & Execute"│
                   │                   └──────────────┬────────────────┘
                   │                                  │
                   │                                  ▼
                   │           ┌───────────────────────────────────────────────┐
                   │           │      Phase 2: Authorization & Execution       │
                   │           ├───────────────────────────────────────────────┤
                   │           │ 1. Session & Ownership Validation             │
                   │           │ 2. Expiration Boundary Check (ms precision)   │
                   │           │ 3. Transition: PREPARED -> AUTHORIZED         │
                   │           │ 4. Verify IIP Keccak-256 Digest               │
                   │           │ 5. Transition Lock: AUTHORIZED -> SUBMITTING  │
                   │           │ 6. Execution Controller: Signs & Broadcasts   │
                   │           │ 7. Persist tx_hash: SUBMITTING -> SUBMITTED   │
                   │           │ 8. Wait for Receipt: SUBMITTED -> CONFIRMED   │
                   │           └──────────────────────┬────────────────────────┘
                   │                                  │
                   ▼                                  ▼
             [Evidence Panel]                  [Live Blockchain]
         Intent Comparison Card            Sepolia Testnet Confirmation
```

---

## 2. Core Architectural Pillars

### A. Intent-to-Transaction Semantic Verification (`src/core/security/transaction-analyzer.ts`)
The core innovation of Milestone R7. Even though the application constructed the transaction candidate, it does **not** trust the construction process. It independently parses the bytecode using Viem's `decodeFunctionData`:
- **Supported Operations:**
  - `NATIVE_TRANSFER`: Direct ETH transfer (`data === '0x'`).
  - `ERC20_TRANSFER`: `transfer(address to, uint256 amount)`.
  - `ERC20_APPROVE`: `approve(address spender, uint256 amount)`.
  - `UNSUPPORTED_CALL`: Any arbitrary or unlisted method fails closed.
- **10 Intent-Mismatch Rules:**
  1. `RECIPIENT_MISMATCH`: Decoded destination does not match authorized contact.
  2. `TOKEN_CONTRACT_MISMATCH`: Target contract does not match requested token contract in registry.
  3. `TRANSFER_AMOUNT_MISMATCH`: Decoded transfer amount does not equal requested amount.
  4. `APPROVAL_AMOUNT_MISMATCH`: Decoded allowance differs from requested allowance.
  5. `UNLIMITED_APPROVAL_REQUEST`: Detects $2^{255}$ or MaxUint256 requests and checks user policy.
  6. `SPENDER_MISMATCH`: Decoded approved contract does not match authorized spender.
  7. `TRANSACTION_METHOD_MISMATCH`: Transfer requested but approve calldata compiled, or vice versa.
  8. `UNEXPECTED_NATIVE_VALUE`: Native ETH attached to an ERC-20 contract interaction.
  9. `WRONG_CHAIN`: Transaction targets chainId other than Sepolia (`11155111`).
  10. `UNSUPPORTED_CALLDATA`: Unrecognized method selectors fail closed.

### B. Approval Exposure Intelligence (`src/core/security/approval-analyzer.ts`)
- Explicitly models token allowances as **spending permissions**, distinct from immediate fund transfers.
- Computes allowance deltas: current allowance vs proposed allowance vs configured policy spending cap.
- Evaluates risk: distinguishes between standard bounded allowances and permanent unlimited spending rights.

### C. Grounded AI Security Explanations (`src/core/ai/security-explainer.ts`)
- Uses `@google/genai` to generate user-friendly educational summaries of technical findings.
- **Strict Invariant:** The AI is strictly an educator. It cannot override policy, unblock transactions, or alter the `canExecute` boolean. If the AI is unavailable, a deterministic rule-based generator produces structured explanations.

### D. AI Provider Abstraction (`src/core/ai/provider.ts`)
- Migrated to the modern `@google/genai` SDK (version 2.x).
- Uses `gemini-3.8-flash` with true `AbortController` cancellation, 10-second timeout, 500-char length guard, and structured JSON output.
- Deterministic `MockIntentProvider` for offline and testing environments.
- Zero silent fallback: failures throw explicit errors.

### E. Wallet Intelligence with Isolated Caching (`src/core/web3/wallet-service.ts`)
- Explicit balance states: `AVAILABLE`, `UNAVAILABLE`, `NOT_CONFIGURED`, `UNSUPPORTED`.
- Never displays fabricated zero balances on RPC failure.
- Bounded cache isolated by `${address.toLowerCase()}:${rpcUrl}:${chainId}` to prevent cross-account cache contamination.
- Supports read-only public address configuration without requiring custody of a private key.

---

## 3. Supported Methods & Threat Boundary

- **Target Blockchain:** Ethereum Sepolia Testnet Only (`chainId: 11155111`).
- **Supported Methods:** Native ETH transfers, ERC-20 `transfer`, ERC-20 `approve`.
- **EVM Simulation Limitations:** Simulation via `estimateGas` dry-runs the transaction against current block state. It catches reverts and gas issues at execution time, but does not guarantee protection against future state changes or front-running.
