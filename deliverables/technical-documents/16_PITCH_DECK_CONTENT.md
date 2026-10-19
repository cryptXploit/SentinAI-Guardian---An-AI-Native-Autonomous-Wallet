# Phase 8: Competition Pitch Deck Content (14-Slide Structure)

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F: Agent Wallet / Autonomous On-chain Wallet)  
**Generated PowerPoint Artifact:** [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx)

---

## Slide 1 — Title & Executive Positioning
- **Headline:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control
- **Track:** 2026 Shenzhen International FinTech Competition · International Track · Topic F (Agent Wallet / Autonomous On-chain Wallet)
- **Core Value Proposition:** Speak naturally in English, বাংলা (Bengali), or Banglish — execute safely on Ethereum through a non-bypassable 6-gate deterministic policy firewall, pre-flight RPC simulation, and Keccak-256 Intent Integrity Proofs.

## Slide 2 — The Problem: The Autonomous Wallet Security Paradox
- **Probabilistic AI vs. Irreversible Blockchains:** LLMs hallucinate, misinterpret negations (*"Do not send..."*), and are vulnerable to indirect prompt injection (*"Ignore all policies..."*).
- **Blind Signing & Unlimited Approvals:** Over \$1B+ lost annually to ERC-20 drainer approvals (`MAX_UINT256`), spoofed token contracts, and opaque hex calldata.
- **Unacceptable Status Quo:** Giving an LLM direct access to a signing key is a catastrophic single point of failure; forcing users to manually craft calldata destroys usability.

## Slide 3 — Our Solution: SentinAI Guardian
- **Strict Privilege Separation:** AI interprets intent; deterministic TypeScript & SQLite rules govern execution.
- **Multilingual Financial Inclusion:** Native support for English, Bengali (`এলিস কে ০.০০০১ ইথ পাঠাও`), and Banglish (`alice ke 0.0001 ETH pathao`).
- **Two-Phase Human-in-the-Loop Execution:** No state-changing transaction can touch the private key without passing 5 pre-sign gates + explicit operator authorization + Gate 6.5 live revalidation.

## Slide 4 — System Architecture & Trust Boundaries
- **Zone 0 (Untrusted Advisory Layer):** `Gemini 3.8 Flash` $\rightarrow$ `Groq openai/gpt-oss-120b` $\rightarrow$ `Local Deterministic Fallback` with request-scoped provenance tracking.
- **Zone 1 (Deterministic Enforcement Core):** Pre-builder negation/injection filter $\rightarrow$ Zod schema & exact `BigInt` math $\rightarrow$ Fail-closed recipient resolution $\rightarrow$ SQLite policy engine $\rightarrow$ Calldata analyzer $\rightarrow$ Sepolia RPC simulator $\rightarrow$ Keccak-256 IIP generator.
- **Zone 2 (Isolated Execution Core):** Gate 6.5 live policy revalidation $\rightarrow$ Atomic SQLite CAS lock $\rightarrow$ Pre-broadcast crash recovery journal $\rightarrow$ Isolated Viem Sepolia signer (`Chain ID: 11155111`).

## Slide 5 — Resilient Multi-Model AI Failover & Multilingual NLP
- **Self-Healing Provider Chain:** Primary `Gemini 3.8 Flash` with automatic 10s `AbortController` timeout and instant failover to `Groq (openai/gpt-oss-120b)` (`738ms–1530ms` live latency) and local regex fallback.
- **Dual-Layer Negation & Adversarial Trap Defense:** Both AI normalization and pre-builder deterministic checks block negations (*"Do not send..."*, *"পাঠিও না"*) and prompt overrides (*"Ignore all policies..."*).

## Slide 6 — Deterministic Policy Engine & Semantic Calldata Analysis
- **Zero Floating-Point Rounding:** String-to-`BigInt` integer arithmetic (`parseAssetAmountToBigInt`) across 18-decimal (`ETH`, `LINK`) and 6-decimal (`USDC`) assets.
- **Configurable SQLite Policy Firewall:** Enforces per-transaction spend limits (`0.5 ETH`), rolling 24-hour cumulative spend caps (`2.0 ETH`), trusted recipient aliases, and ERC-20 spender allowlists.
- **Calldata vs. Intent Cross-Check:** Decodes `0xa9059cbb` (`transfer`) and `0x095ea7b3` (`approve`) to block unlimited token approvals, unverified spenders, and spoofed token contracts.

## Slide 7 — Cryptographic Intent Integrity Proof (IIP) & Two-Phase State Machine
- **Keccak-256 IIP Binding:** Hashes canonical JSON (`action`, `amount`, `asset`, `chainId`, `data`, `recipientAlias`, `to`, `value`) at Phase 1 (`PREPARED`) and re-verifies before signing at Phase 2 (`AUTHORIZED`).
- **Gate 6.5 Live Policy Revalidation:** Re-checks active SQLite policy immediately prior to signing, eliminating Time-of-Check to Time-of-Use (TOCTOU) policy drift.
- **Atomic CAS Lock & Recovery Journal:** SQLite Compare-And-Swap prevents double-click replay; `.recovery-journal.json` + on-chain block scanner recover from mid-broadcast RPC drops.

## Slide 8 — Live Sepolia Blockchain & AI Execution Proof
- **Confirmed On-Chain Transaction:** `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`
- **Block & Timestamp:** Sepolia Block `#11935960` (`2026-10-17T18:55:12Z`) · Proposal ID `7540a5f1-dcb4-4797-b46a-13ec74fa96d9`
- **EIP-2780 Gas Engineering:** Accurately distinguishes `12,000` warm self-transfer simulation gas from the `21,000` intrinsic broadcast gas floor (`gasLimit = 21000`, `gasUsed = 12000`, Fee = `1,632,000 wei`).
- **354 Automated Tests Passing:** 33 Vitest test suites + 12/12 Headless Chrome CDP E2E browser flows verified.

## Slide 9 — Modern AI FinTech Command Center UX
- **60-Second Guided Judge Walkthrough:** 7 one-click interactive verification scenarios (`#guided-demo`) clearly separating `LIVE` operations from `DEMO / SIMULATED` threat fixtures.
- **Real-State 6-Stage Pipeline Visualizer:** Live visual feedback for every security gate.
- **Transparent Pre-Execution Transaction Review:** Displays Sender, Verified Recipient, Asset Amount, Gas Floor, Policy Verdict, Simulation Result, and Post-Approval lifecycle before signing.

## Slide 10 — Commercial Value, Market Opportunity & Business Model (30% Weight)
- **Target Segments:**
  1. **Retail Multilingual Web3 Users:** Safe conversational onboarding across emerging markets (South Asia, SEA, LATAM, Greater Bay Area).
  2. **DAO & SME Corporate Treasuries:** Policy-gated AI co-pilots where junior operators propose transactions in natural language within strict on-chain/SQLite spend caps.
  3. **B2B Wallet-as-a-Service (WaaS) SDK:** Drop-in deterministic policy & IIP middleware for existing wallets and AI agent frameworks.
- **Revenue Model:** SaaS tiered policy seats for institutional treasuries + B2B SDK licensing + enterprise compliance audit trails.

## Slide 11 — Competitive Differentiation Matrix
| Feature | Naive LLM Agent Wallets | Traditional EOA Wallets (MetaMask) | SentinAI Guardian |
|---|---|---|---|
| **Multilingual Natural Language (EN/BN/Banglish)** | Partial | No | **Yes (Gemini + Groq + Local)** |
| **Non-Bypassable Deterministic Spend Caps** | No (Prompt-only) | No | **Yes (Gate 3 + Gate 6.5 SQLite BigInt)** |
| **Dual-Layer Negation & Injection Defense** | Vulnerable | N/A | **Yes (Pre-Builder + Provider Filters)** |
| **Keccak-256 Intent-to-Calldata Binding (IIP)** | No | No | **Yes (Cryptographic Digest Verification)** |
| **Crash-Safe Broadcast Recovery Journal** | No | Basic Nonce | **Yes (CAS Lock + On-Chain Recovery)** |

## Slide 12 — Production Roadmap & Institutional Scaling
- **Phase 1 (Completed — R8.5):** Full Two-Phase Deterministic Agent Wallet on Ethereum Sepolia with Gemini/Groq failover, SQLite WAL persistence, IIP digest, and confirmed on-chain execution.
- **Phase 2 (Q1 2027):** ERC-4337 Smart Account integration (Safe + Session Key Validators) moving policy enforcement directly into on-chain modular hooks.
- **Phase 3 (Q2 2027):** Hardware Enclave / AWS KMS enterprise key custody, PostgreSQL multi-tenant policy cluster, and Cross-Chain Intent Settlement (Arbitrum, Base, Polygon).
