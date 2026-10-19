# Phase 5: Known Risks, Operational Assumptions & Limitations

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

In accordance with institutional security auditing standards, this document transparently discloses the current operational assumptions, known architectural boundaries, and production roadmap items for SentinAI Guardian.

---

## 1. Cryptographic Signer & Key Management Scope

- **Current Implementation (Hackathon / Sepolia Testnet):**
  - The autonomous agent wallet uses an EOA private key (`AGENT_PRIVATE_KEY`) loaded into server-side memory via `viem/accounts` (`privateKeyToAccount`) inside `src/core/execution/controller.ts`.
  - The private key is never exposed to client bundles, browser storage, or AI providers, and is restricted to Ethereum Sepolia (`Chain ID: 11155111`).
- **Known Limitation:**
  - If the host server OS or environment variables are compromised by a privileged infrastructure attacker, an in-memory EOA key could be extracted.
- **Production Remediation Roadmap:**
  - Replace raw environment private keys with **AWS KMS / HashiCorp Vault HSM signing**, **TEE (Trusted Execution Environment) enclaves**, or **ERC-4337 Smart Account Session Keys** with on-chain module spending limits (e.g., Safe + Rhinestone / ZeroDev session validators).

---

## 2. Single-Node SQLite Persistence & Rate Limiting

- **Current Implementation:**
  - Proposals, user policies, policy audit logs, and daily spend tracking are persisted in a local SQLite database (`sentinai.db` using `better-sqlite3` in WAL mode).
  - Login rate limiting (`src/core/security/auth.ts`) uses an in-memory `Map` keyed by client IP.
- **Known Limitation:**
  - Local SQLite files and in-memory rate-limit maps are designed for single-instance deployment and do not natively replicate across horizontally scaled serverless workers.
- **Production Remediation Roadmap:**
  - Migrate persistence to **PostgreSQL with Serializable/Row-Level Locking** and move sliding-window rate limiting to **Redis / Upstash**.

---

## 3. Historical RPC Pruning on Free Public Nodes

- **Current Implementation:**
  - Default Sepolia RPC (`https://ethereum-sepolia-rpc.publicnode.com`) provides fast head-state queries (`eth_blockNumber`, `eth_getBalance`, `eth_estimateGas`, `eth_sendRawTransaction`).
- **Known Limitation:**
  - Free public RPC endpoints prune non-archive transaction receipts after ~10,000 blocks (~33 hours). Querying `eth_getTransactionReceipt` on a pruned node for older historical transactions returns `null` unless routed to an archive-capable endpoint (`https://sepolia.drpc.org` or Blockscout API).
- **Mitigation Implemented:**
  - SentinAI Guardian persists the confirmed transaction hash and status in SQLite (`proposals.tx_hash`, `status = 'CONFIRMED'`) at confirmation time and links directly to Sepolia Etherscan for permanent archive lookup.

---

## 4. Upstream Cloud LLM Availability & Latency Spikes

- **Current Implementation:**
  - Primary AI provider (`Gemini 3.8 Flash`) and secondary AI provider (`Groq openai/gpt-oss-120b`) are queried over HTTPS with a 10-second `AbortController` timeout.
- **Observed Operational Behavior:**
  - Under burst traffic, free-tier Gemini API endpoints occasionally return `HTTP 429 (Quota Exceeded)` or `HTTP 503 / Timeout`.
- **Mitigation Implemented:**
  - `FallbackIntentProvider` automatically fails over from Gemini to live Groq (`~800ms–1500ms` latency) and finally to the local deterministic parser, while explicitly labeling the active provider (`GROQ AI`, `GEMINI AI`, or `FALLBACK PARSER`) in the UI.

---

## 5. Competition Team Composition Requirement Flag

- **Official Competition Rule Note:**
  - Per the 2026 Shenzhen International FinTech Competition rules (documented in [`docs/competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md`](../competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md)), formal qualification requires **2 to 5 currently enrolled university students** (with $\ge 60\%$ non-Chinese nationals for the International Track). Solo entrants must register at least one eligible university teammate prior to the October 20, 2026 23:59 UTC+8 deadline.
