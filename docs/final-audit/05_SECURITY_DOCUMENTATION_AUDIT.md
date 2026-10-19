# 05 — Security Documentation & Code-to-Claim Forensic Audit

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet  
**Competition:** 2026 Shenzhen International FinTech Competition (International Track — Topic F)  
**Audited Documents:**  
- [`docs/security/08_SECURITY_SELF_ASSESSMENT.md`](../security/08_SECURITY_SELF_ASSESSMENT.md)  
- [`docs/security/09_KNOWN_RISKS_AND_LIMITATIONS.md`](../security/09_KNOWN_RISKS_AND_LIMITATIONS.md)  
- [`docs/security/10_THREAT_MODEL.md`](../security/10_THREAT_MODEL.md)  
- [`docs/SECURITY_ASSESSMENT.md`](../SECURITY_ASSESSMENT.md)  
**Audit Date:** 2026-10-19  

---

## 1. Code-to-Security-Claim Verification Matrix

Every security claim in `docs/security/08`–`10` was audited directly against the TypeScript implementation in `src/core/`:

| Security Control Claimed | Source File & Function | Actual Code Behavior | Audit Verdict |
| :--- | :--- | :--- | :---: |
| **Zero Private Key Exposure to AI** | [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts) (`GeminiIntentProvider`, `GroqIntentProvider`, `MockIntentProvider`) | AI providers receive only sanitized natural-language text (max 500 chars) and return `ParsedIntent` JSON (`action`, `asset`, `amount`, `recipientAlias`). `SIGNER_PRIVATE_KEY` is never imported or accessible in `src/core/ai/`. | **VERIFIED** |
| **Multilingual & Adversarial Negation Filter** | [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts) (`isTransactionNegationOrCancellation`, `normalizeBengaliInput`, `isAdversarialPolicyOverride`) | Enforces pre- and post-LLM checks blocking `"do not send"`, `"cancel"`, Bengali `"পাঠিও না"`, and policy-override prompts (`"ignore all policies"`), forcing `action = 'UNKNOWN'`. | **VERIFIED** |
| **Exact Integer Token Parsing (No IEEE-754 Float Drift)** | [`src/core/utils/financial.ts`](../../src/core/utils/financial.ts) (`parseTokenAmount`, `formatTokenAmount`) |Splits decimal strings on `.` and computes exact `BigInt` base units ($10^{18}$ for `ETH`/`DAI`, $10^6$ for `USDC`/`USDT`), rejecting fractional precision overflow. | **VERIFIED** |
| **Deterministic Policy Firewall** | [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts) (`evaluatePolicy`) & [`user-policy.ts`](../../src/core/policy/user-policy.ts) | Enforces `maxTransferAmountETH` (`"1.0"` ETH default), `allowUnlimitedApproval` (`false` default), `trustedContacts` whitelist (`alice`), and per-token `tokenApprovalPolicies`. | **VERIFIED** |
| **Independent 10-Rule EVM Calldata Analyzer** | [`src/core/security/transaction-analyzer.ts`](../../src/core/security/transaction-analyzer.ts) (`analyzeTransaction`) | Independently decodes candidate calldata via `viem.decodeFunctionData` and checks 10 rules (`RECIPIENT_MISMATCH`, `TOKEN_CONTRACT_MISMATCH`, `TRANSFER_AMOUNT_MISMATCH`, `APPROVAL_AMOUNT_MISMATCH`, `UNLIMITED_APPROVAL_REQUEST`, `SPENDER_MISMATCH`, `TRANSACTION_METHOD_MISMATCH`, `UNEXPECTED_NATIVE_VALUE`, `WRONG_CHAIN`, `UNSUPPORTED_CALLDATA`). | **VERIFIED** |
| **Intent Integrity Proof (IIP) Digest** | [`src/core/security/iip.ts`](../../src/core/security/iip.ts) (`computeIIPDigest`, `verifyIIPDigest`) | Computes an **unkeyed `keccak256(encodePacked(...))` integrity digest** over `[to, value, BigInt(chainId), action, asset, policyStatus, data]` at Phase 1 and verifies it before Phase 2 signing. | **VERIFIED** |
| **Durable SQLite Execution State Machine & CAS Lock** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) & [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts) | Enforces atomic `PREPARED -> AUTHORIZED -> SUBMITTING -> SUBMITTED -> CONFIRMED/FAILED` transitions in SQLite WAL with millisecond expiration checks and `is_executable = 0` fixture isolation. | **VERIFIED** |
| **Crash-Safe Broadcast Recovery Journal** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) & [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts) (`writeBroadcastRecoveryJournal` + 10-block Sepolia scan) | Writes recovery journal before/after RPC broadcast and scans the last 10 Sepolia blocks on startup to reconcile `SUBMITTING` proposals if SQLite fails post-broadcast. | **VERIFIED** |

---

## 2. Discrepancies Identified & Corrected During Forensic Audit

During Phase 7 inspection, we identified and remediated three subtle documentation overstatements so that all security documents are 100% faithful to the codebase:

1. **IIP Cryptographic Nature Clarified:**
   - *Finding:* Earlier prose referred to IIP loosely as a "cryptographic binding" without specifying whether it was keyed (HMAC/signature) or unkeyed.
   - *Fix Applied:* Explicitly documented across `README.md`, `08_SECURITY_SELF_ASSESSMENT.md`, `09_KNOWN_RISKS_AND_LIMITATIONS.md`, `10_THREAT_MODEL.md`, `12_ALGORITHM_DESIGN.md`, and Slide 7/10 of the Pitch Deck that `computeIIPDigest` is an **unkeyed `keccak256(encodePacked(...))` integrity digest** designed to detect accidental or TOCTOU parameter drift between Phase 1 and Phase 2, and that it relies on SQLite database integrity rather than an asymmetric signature.
2. **Per-Transaction Policy Scope vs. Rolling 24-Hour Limit Clarified:**
   - *Finding:* `evaluatePolicy` in `src/core/policy/engine.ts` enforces per-transaction `maxTransferAmountETH = "1.0"`, not a cumulative 24-hour rolling spend window (`dailyLimitEth`).
   - *Fix Applied:* Removed any reference to `dailyLimitEth` and explicitly documented cumulative velocity tracking as a known limitation in `09_KNOWN_RISKS_AND_LIMITATIONS.md` and `10_THREAT_MODEL.md`.
3. **Supported Token Registry Alignment:**
   - *Finding:* `SUPPORTED_TOKENS` in `src/core/transaction/builder.ts` supports `USDC`, `USDT`, and `DAI` (plus native `ETH`), not `LINK`.
   - *Fix Applied:* Standardized all documentation tables to `ETH`, `USDC`, `USDT`, and `DAI`.

---

## 3. Verification of Honest Residual Risk Disclosure (`09_KNOWN_RISKS_AND_LIMITATIONS.md`)

We verified that `docs/security/09_KNOWN_RISKS_AND_LIMITATIONS.md` explicitly and transparently discloses all 8 architectural boundaries:
1. **Server-Side Hot Private Key (`SIGNER_PRIVATE_KEY` in `.env`):** Not stored in an HSM/MPC enclave or ERC-4337 smart contract account in this prototype.
2. **Unkeyed IIP Digest (`keccak256`):** Does not defend against an attacker with direct OS/filesystem write access to `sentinai.db` who rewrites both the candidate JSON and `iip_digest` column simultaneously.
3. **Per-Transaction Spend Limit Only:** Enforces per-transaction `maxTransferAmountETH` (`1.0 ETH`), not cumulative 24-hour rolling velocity limits.
4. **Simulation TOCTOU Window:** `eth_estimateGas` / `eth_call` simulation at Phase 1 cannot guarantee identical EVM state at Phase 2 block inclusion if external contract state changes in between.
5. **Bounded Method & Asset Scope:** Supports Native ETH transfer, ERC-20 `transfer`, and ERC-20 `approve` for `USDC`, `USDT`, and `DAI` on Sepolia (`11155111`); DeFi `SWAP` intents and arbitrary contract calls fail closed.
6. **Single-Operator Session Model:** Uses a single-operator password and HMAC-SHA256 cookie (`sentinai_session`) rather than multi-user WebAuthn/Passkeys.
7. **Single-Node SQLite Persistence:** Uses local `better-sqlite3` WAL file storage rather than a distributed multi-region database.
8. **Public Sepolia RPC Pruning & Rate Limits:** Free public Sepolia RPC nodes (e.g., PublicNode) prune historical transaction receipts after ~10,000 blocks, requiring multi-RPC fallback (e.g., dRPC) or archive nodes for older receipt lookups.

### Audit Verdict for Phase 7: **COMPLETE & VERIFIED**
