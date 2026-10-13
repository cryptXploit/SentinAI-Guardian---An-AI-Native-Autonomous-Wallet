# Architecture Overview: SentinAI Guardian

**Project:** SentinAI Guardian  
**Competition:** 2026 Shenzhen International FinTech Competition  
**Track:** International Track — Topic F: Autonomous Agent Wallet  
**Milestone:** R6  

SentinAI Guardian is an AI-Native Autonomous Wallet built to bridge Large Language Models (LLMs) with EVM-compatible blockchains securely. It guarantees that untrusted, stochastic AI models can never execute unauthorized transactions, drain user balances, or execute malicious payloads.

---

## 1. High-Level System Architecture

SentinAI Guardian employs a **Zero-Trust, Human-in-the-Loop, Two-Phase Execution Architecture** built on Next.js 16 (App Router) using server-side modular pipelines, SQLite durable state machines, and Viem for EVM communications.

```
[ Operator / Agent ] ──> Natural Language Command
                               │
                               ▼
     ┌──────────────────────────────────────────────────┐
     │       Phase 1: Preparation & Intent Parsing      │
     ├──────────────────────────────────────────────────┤
     │  - Input Sanitization (500 char max, injection)  │
     │  - IntentAIProvider (Gemini 1.5 Flash / Mock)    │
     │  - Read-Only vs State-Changing Routing Check     │
     └─────────────┬──────────────────────┬─────────────┘
                   │                      │
         [Read-Only Action]     [State-Changing Action]
                   │                      │
                   ▼                      ▼
    ┌──────────────────────┐   ┌───────────────────────────────────────────────┐
    │ Direct Live Read     │   │ 1. Transaction Candidate Builder              │
    │  - Sepolia RPC check │   │    - ABI Calldata compilation (ETH/ERC-20)    │
    │  - Native + ERC-20   │   │    - Strict BigInt parseUnits                 │
    │    wallet overview   │   │ 2. Policy Risk Engine                         │
    │  - No proposal made  │   │    - Mathematical whitelist & spend limits    │
    │  - Zero key access   │   │    - Decodes calldata (detects spoofing)      │
    │  - 10s TTL cache     │   │ 3. EVM Simulation Engine                      │
    └──────────────┬───────┘   │    - RPC dry-run (estimateGas)                │
                   │           │ 4. Intent Integrity Proof (IIP)               │
                   │           │    - Keccak-256 canonical digest over calldata│
                   │           │ 5. SQLite Proposal Manager                    │
                   │           │    - Stores candidate in PREPARED state       │
                   │           │    - Atomic ownership & 5m expiration lock    │
                   │           └──────────────────────┬────────────────────────┘
                   │                                  │
                   │                                  ▼
                   │                   ┌───────────────────────────────┐
                   │                   │ Human-in-the-Loop Gate        │
                   │                   │ Operator reviews UI digest    │
                   │                   │ Explicit "Confirm & Execute"  │
                   │                   └──────────────┬────────────────┘
                   │                                  │
                   │                                  ▼
                   │           ┌───────────────────────────────────────────────┐
                   │           │    Phase 2: Authorization & Execution         │
                   │           ├───────────────────────────────────────────────┤
                   │           │ 1. Session & Ownership Validation             │
                   │           │ 2. Atomic Transition: PREPARED -> SUBMITTING  │
                   │           │ 3. Execution Controller: Signs & Broadcasts   │
                   │           │ 4. Persist tx_hash: SUBMITTING -> SUBMITTED   │
                   │           │ 5. Wait for Receipt: SUBMITTED -> CONFIRMED   │
                   │           └──────────────────────┬────────────────────────┘
                   │                                  │
                   ▼                                  ▼
             [Evidence Panel]                  [Live Blockchain]
         Intelligence / Audit Card         Sepolia Testnet Confirmation
```

---

## 2. Core Architectural Pillars

### A. Intent AI Provider Abstraction (`src/core/ai/provider.ts`)
The system isolates AI logic behind a strictly typed `IntentAIProvider` interface:
- **`GeminiIntentProvider`:**
  - Model: `gemini-1.5-flash` with structured JSON schema (`responseMimeType: 'application/json'`).
  - Timeout: 15-second abort controller ceiling.
  - Sanitization: Truncation at 500 characters, injection prompt stripping, latency tracking.
  - Fail-Closed: If live Gemini fails, the request throws an error and never silently falls back to mock execution.
- **`MockIntentProvider`:**
  - Deterministic regex and keyword pattern matching for CI/CD, local testing, and mock mode (`AI_PROVIDER=mock`).
- **`getIntentProvider()`:**
  - Factory resolving provider based on `process.env.AI_PROVIDER` and `process.env.GEMINI_API_KEY`.

### B. Read-Only Query Routing (`src/app/actions/orchestrator.ts`)
Queries such as balance requests (`QUERY_BALANCE`) and network checks (`QUERY_NETWORK`) are read-only:
- They bypass transaction proposal generation, policy evaluation, and simulation.
- They **never** interact with the private key or execution controller.
- They invoke `getLiveWalletOverview()` or `verifySepoliaConnection()` directly and return instant on-chain intelligence.

### C. Canonical EVM Calldata & Tamper-Evident IIP (`src/core/security/iip.ts`)
The Intent Integrity Proof cryptographically links:
1. High-level intent parameters (action, asset, recipient, amount).
2. Compiled canonical EVM payload (`to`, `value`, `candidate.data`).
3. Policy engine decision (`ALLOW` / `DENY`).
4. Simulation dry-run result.
5. Salt and creation timestamp.
A Keccak-256 digest is generated over these canonical elements. If an attacker modifies the calldata or recipient between preparation and execution, the digest mismatch immediately causes execution rejection.

### D. Durable SQLite State Machine (`src/core/security/proposal.ts`)
Proposals are backed by SQLite (`better-sqlite3`) with WAL journaling:
- **Versioned Non-Destructive Migrations:** Incremental schema alterations with automatic backup (`*.bak.*`).
- **State Transition Matrix:** Enforces valid transitions (`PREPARED` → `AUTHORIZED` → `SUBMITTING` → `SUBMITTED` → `CONFIRMED` or `FAILED_BEFORE_BROADCAST`). Prevents resurrection, re-preparation, or replay.
- **Expiration Precision:** Millisecond-accurate expiration verification (`isProposalExpired`).
- **Safe WAL Checkpointing:** `backupDatabase()` executes `PRAGMA wal_checkpoint(TRUNCATE)` to guarantee consistent database snapshots.

### E. Live Web3 Services (`src/core/web3/`)
- **`rpc-service.ts`:**
  - Strictly targets Ethereum Sepolia Testnet (`chainId: 11155111`).
  - `verifySepoliaConnection()` asserts the connected chain ID is exactly `11155111`. If wrong, fails closed with `WRONG_CHAIN`.
- **`wallet-service.ts`:**
  - Derives agent public address securely without exposing private keys.
  - Queries native Sepolia ETH and verified ERC-20 token contracts (`USDC`, `USDT`, `DAI`).
  - Converts token balances with pure BigInt precision and formatted decimal strings.
  - Employs a 10-second TTL cache to prevent RPC rate-limit exhaustion.

### F. Operator Authentication & Defense in Depth (`src/core/security/auth.ts`)
- Single-operator authentication gate with 256-bit cryptographically secure session tokens.
- Secure, HTTP-only cookies (`sentinai_session`) with `SameSite=Lax`.
- Sliding-window IP rate limiting (max 5 failed attempts per minute).
- Dynamic Server Component integration via `await connection()` in Next.js 16.
