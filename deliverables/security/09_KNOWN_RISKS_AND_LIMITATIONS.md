# Phase 5: Known Risks, Operational Assumptions & Limitations

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

In accordance with institutional security auditing standards, this document transparently discloses the current operational assumptions, known architectural boundaries, and production roadmap items for SentinAI Guardian.

---

## 1. Server-Held EOA Private Key & Custody Scope

- **Current Implementation (Hackathon / Sepolia Testnet):**
  - The autonomous agent wallet uses an EOA private key (`AGENT_PRIVATE_KEY`) loaded into server-side memory via `viem/accounts` (`privateKeyToAccount`) inside [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts).
  - The private key is never exposed to client bundles, browser storage, or AI providers, and `controller.ts` hard-restricts execution to Ethereum Sepolia (`Chain ID: 11155111`).
- **Residual Risk:**
  - If the host server OS, filesystem (`.env`), or Node.js process memory is compromised by a privileged attacker, the in-memory EOA private key can be extracted.
- **Production Remediation Roadmap:**
  - Replace raw environment private keys with **AWS KMS / HashiCorp Vault HSM signing**, **TEE enclaves**, or **ERC-4337 Smart Account Session Keys** with on-chain modular spend limits.

---

## 2. Unkeyed Intent Integrity Proof (IIP) vs. Hardware Signature

- **Current Implementation:**
  - `computeIIPDigest` in [`src/core/security/iip.ts`](../../src/core/security/iip.ts) computes an **unkeyed `keccak256(encodePacked(...))` integrity digest** over the canonical transaction candidate, intent, and policy decision.
- **Residual Risk:**
  - Because `computeIIPDigest` is an unkeyed hash rather than an asymmetric signature from an external hardware device, an attacker with direct write access to both the `digest` and `iip_data` columns in `sentinai.db` could recompute a matching digest. Its purpose is to catch accidental state drift or partial parameter mutation between Phase 1 and Phase 2.

---

## 3. Session Compromise & Single-Operator Trust Boundary

- **Current Implementation:**
  - Operator authentication uses a single shared `OPERATOR_PASSWORD` verified in constant time (`crypto.timingSafeEqual`), issuing an `httpOnly`, `sameSite: lax` HMAC-SHA256 session cookie (`sentinai_session`) backed by the SQLite `sessions` table (`30-minute` TTL).
- **Residual Risk:**
  - If an operator's browser session or machine is hijacked while authenticated, the attacker could trigger Phase 1 and Phase 2 actions within the configured `maxTransferAmountETH` and `trustedContacts` policy boundaries.

---

## 4. Per-Transaction Limit vs. Cumulative Rolling Window

- **Current Implementation:**
  - [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts) deterministically enforces a per-transaction native ETH cap (`maxTransferAmountETH`, default `1.0 ETH`), `allowUnlimitedApproval = false`, `trustedContacts`, and per-token approval ceilings (`tokenApprovalPolicies` for `USDC`, `USDT`, `DAI`).
- **Residual Risk:**
  - The policy engine evaluates each transaction proposal independently and does not currently aggregate cumulative ETH spent across multiple confirmed transactions over a rolling 24-hour window.

---

## 5. Single-Node SQLite Persistence, RPC Trust & Recovery Boundaries

- **Single-Node SQLite & Rate Limiter:**
  - `sentinai.db` (SQLite WAL) and the in-memory login IP rate limiter (`src/core/security/auth.ts`) are designed for single-node deployment and do not replicate across horizontally scaled serverless instances.
- **RPC Endpoint Trust & Historical Pruning:**
  - Pre-flight simulation (`simulator.ts`) and on-chain recovery (`findMatchingBroadcastTxOnChain`) rely on the configured Sepolia JSON-RPC endpoint returning accurate state. Additionally, free non-archive RPCs (such as PublicNode) prune `eth_getTransactionReceipt` records older than ~10,000 blocks, requiring an archive-capable RPC (`https://sepolia.drpc.org`) or Etherscan for older historical receipt lookups.
- **Broadcast Recovery Window:**
  - `findMatchingBroadcastTxOnChain` scans the latest 10 Sepolia blocks for matching `(from, to, value, data)` transactions when reconciling an interrupted broadcast (`EXECUTION_UNKNOWN`). If reconciliation is delayed by more than 10 blocks, manual operator verification via Etherscan is required.
