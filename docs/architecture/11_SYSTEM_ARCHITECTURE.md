# System Architecture — SentinAI Guardian

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F: Agent Wallet / Autonomous On-chain Wallet)  

---

## 1. High-Level Architectural Overview

SentinAI Guardian is built on a **Two-Phase Deterministic Gated Architecture** that decouples **probabilistic natural-language intent interpretation** from **deterministic financial policy enforcement and cryptographic signing**.

```mermaid
flowchart TB
    subgraph Client["Presentation & Operator Layer (React 19 / Next.js App Router)"]
        AuthUI["Operator Login Gate (AuthGate)"]
        CommandCenter["Executive Financial Command Center (#overview)"]
        GuidedWalkthrough["60s Guided Judge Walkthrough (#guided-demo)"]
        AgentConsole["Multilingual Agent Console (#agent-console)"]
        EvidenceUI["Intent Comparison & Pre-Execution Review Gate"]
        PolicyUI["Dynamic SQLite Policy Firewall Editor (#policies)"]
        HistoryUI["Proposal & On-Chain Receipt Audit Trail (#security-center)"]
    end

    subgraph Server["Server Enforcement Orchestrator (src/app/actions/orchestrator.ts)"]
        SessionGuard["HMAC-SHA256 Session & Owner Identity Verifier"]
        NegationGate["Pre-Builder Negation & Injection Filter"]
        AIRouter["Multi-Provider AI Failover Chain (Gemini -> Groq -> Local)"]
        IntentValidator["Strict Zod Schema & parseTokenAmount BigInt Validator"]
        RecipientResolver["Fail-Closed Trusted Recipient Resolver"]
        TxBuilder["Canonical Transaction Builder (ETH / USDC / USDT / DAI)"]
        PolicyEngine["Deterministic Financial Policy Engine"]
        Analyzer["Semantic Calldata & Approval Exposure Analyzer"]
        Simulator["Sepolia Pre-Flight RPC Simulator (viem)"]
        IIPEngine["Unkeyed Keccak-256 Intent Integrity Proof (IIP)"]
        Gate65["Gate 6.5 Live Policy Revalidator"]
        ExecutionCtrl["Isolated Viem Signer & Broadcast Recovery Controller"]
    end

    subgraph External["Persistence & External Infrastructure"]
        SQLite[("SQLite WAL Database (sentinai.db)")]
        RecoveryJournal[("Durable Broadcast Recovery Journal")]
        GeminiAPI["Google Gemini 3.8 Flash API"]
        GroqAPI["Groq openai/gpt-oss-120b API"]
        SepoliaRPC["Ethereum Sepolia Testnet RPC (Chain ID: 11155111)"]
    end

    AuthUI --> SessionGuard
    GuidedWalkthrough --> AgentConsole
    AgentConsole --> SessionGuard
    SessionGuard --> NegationGate
    NegationGate --> AIRouter
    AIRouter --> GeminiAPI
    AIRouter --> GroqAPI
    AIRouter --> IntentValidator
    IntentValidator --> RecipientResolver
    RecipientResolver --> TxBuilder
    TxBuilder --> PolicyEngine
    PolicyEngine <--> SQLite
    PolicyEngine --> Analyzer
    Analyzer --> Simulator
    Simulator <--> SepoliaRPC
    Simulator --> IIPEngine
    IIPEngine --> SQLite
    IIPEngine --> EvidenceUI
    EvidenceUI -->|"Phase 2 Human Authorization"| Gate65
    Gate65 <--> SQLite
    Gate65 --> ExecutionCtrl
    ExecutionCtrl <--> RecoveryJournal
    ExecutionCtrl <--> SepoliaRPC
    ExecutionCtrl --> HistoryUI
    PolicyUI <--> SQLite
```

---

## 2. Layered Component Breakdown

| Layer | Module Path | Responsibility |
|---|---|---|
| **Presentation Layer** | `src/app/page.tsx`, `src/components/agent/*`, `src/components/layout/*` | Renders live Sepolia telemetry, 60-second Guided Judge Walkthrough, 6-stage pipeline stepper, side-by-side User Intent vs. Actual Transaction comparison, Pre-Execution Review card, and SQLite policy/history editors. |
| **Authentication Layer** | `src/core/security/auth.ts`, `src/app/api/auth/*` | Verifies operator password using `crypto.timingSafeEqual`, issues `httpOnly` HMAC-SHA256 session cookies (`sentinai_session`) persisted in SQLite `sessions`, enforces per-IP login rate limits, and binds sessions to the operator ID. |
| **AI Intent Layer** | `src/core/ai/provider.ts`, `src/core/ai/intent-parser.ts`, `src/core/ai/security-explainer.ts` | Translates English, Bengali (`বাংলা`), and Banglish commands into structured JSON (`ParsedIntentSchema`) via `parseIntentWithProvenance` (`GeminiIntentProvider` → `GroqIntentProvider` → `MockIntentProvider`). |
| **Domain & Precision Layer** | `src/core/domain/schemas.ts`, `src/core/utils/financial.ts` | Enforces strict Zod schemas (`TRANSFER`, `APPROVE`, `QUERY_BALANCE`, `QUERY_NETWORK`, `UNKNOWN`) and exact integer `BigInt` decimal conversion via `parseTokenAmount(amount, decimals)` without floating-point rounding. |
| **Deterministic Policy Layer** | `src/core/policy/engine.ts`, `src/core/policy/user-policy.ts` | Evaluates every transaction candidate against SQLite-persisted `maxTransferAmountETH` (`1.0 ETH`), `allowUnlimitedApproval` (`false`), `trustedContacts`, and per-token `tokenApprovalPolicies` (`USDC`, `USDT`, `DAI`). |
| **Semantic Security & Simulation Layer** | `src/core/security/transaction-analyzer.ts`, `src/core/security/approval-analyzer.ts`, `src/core/security/simulator.ts`, `src/core/security/iip.ts` | Decodes raw calldata (`0xa9059cbb`, `0x095ea7b3`), detects unlimited/excessive token approvals, simulates execution on Sepolia (`eth_estimateGas` / `simulateContract`), and computes the unkeyed `keccak256(encodePacked(...))` Intent Integrity Proof digest. |
| **Persistence & Execution Layer** | `src/core/security/proposal.ts`, `src/core/execution/controller.ts` | Manages SQLite proposal state transitions (`PREPARED` → `AUTHORIZED` → `SUBMITTING` → `SUBMITTED` → `CONFIRMED`), atomic CAS locking, pre-broadcast recovery journaling, `21,000` gas floor enforcement, and Sepolia receipt reconciliation. |
