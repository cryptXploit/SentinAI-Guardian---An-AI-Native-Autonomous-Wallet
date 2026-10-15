# SENTINAI GUARDIAN — R8.4 EXECUTION INTEGRITY VERIFICATION REPORT

**Audit Date:** 2026-10-15**Role:** Independent Blockchain Security Engineer**Target Repository:** `e:\SentinAI Gaurdian`**Network:** Ethereum Sepolia Testnet (`chainId = 11155111` / `0xaa36a7`)**Configured Test Wallet:** `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` (`0.05 ETH` on Sepolia)**Transactions Broadcast During Audit:** **0 (Strictly Zero)**

---

## Executive Summary & Final Verdict

### **VERDICT: READY FOR ONE HUMAN-CONTROLLED SEPOLIA SELF-TRANSFER TEST**

Following an independent forensic investigation of the R8.3 implementation, raw Sepolia JSON-RPC behavior, execution state machine transitions, crash-recovery boundaries, and mid-flight policy revalidation:

1. **The `ETH_SIM_GAS = 12000` observation is real, unmanipulated Sepolia RPC behavior under EIP-2780** on Alchemy's `reth/v2.7.0-3d592ec/x86_64-unknown-linux-gnu` execution client when `from === to` (a self-transfer). We proved via raw JSON-RPC `eth_estimateGas` and `eth_call` that `12,000` (`0x2ee0`) is the exact intrinsic gas floor for a self-transfer on Sepolia Reth v2.7.0 (`gas: 0x2ee0` succeeds; `gas: 0x2edf` / `11,999` reverts with `"intrinsic gas too low"`), while external funded EOA transfers (`from !== to`, `value > 0`) return `21,000` (`0x5208`).
2. **Defense-in-Depth Broadcast Gas Floor Added:** While [`src/core/security/simulator.ts`](../../src/core/security/simulator.ts) preserves the exact RPC gas estimate (`12000n`) without fabricating or overriding RPC evidence, [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts) (`broadcastTransaction`) now enforces a `21,000` gas limit compatibility floor whenever `iip.simulation?.gasEstimated < 21000n` so that no downstream mempool peer enforcing legacy `21,000` gas limits can reject a self-transfer.
3. **Two Execution Integrity Gaps Were Found in R8.3 and Remediated in R8.4:**
   - **Gap 1 — Post-Broadcast DB Failure + Server Restart Recovery (Section 3):** In R8.3, if `broadcastTransaction()` succeeded (Step 1) and SQLite `markSubmitted()` failed (Step 2), followed by a server restart (Step 3), the in-memory `txHash` was lost and `tx_hash` in SQLite remained `NULL`. In R8.4, we implemented a durable file-backed **Broadcast Recovery Journal** (`writeBroadcastRecoveryJournal`, `readBroadcastRecoveryJournal`, `clearBroadcastRecoveryJournal`) in [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) written **before** `markSubmitted`, plus a 3-tier `recoverPostBroadcastProposalAction` in [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts) (Tier 1: SQLite `tx_hash`, Tier 2: Disk Recovery Journal, Tier 3: Read-only recent block scan `findMatchingBroadcastTxOnChain`) that recovers the original `txHash` and receipt **without ever broadcasting a second transaction**.
   - **Gap 2 — Mid-Flight Policy Change Revalidation & Proposal Cancellation Persistence (Sections 4 & 5):** In R8.3, Gate 6.5 in `authorizeAndExecute` fell back to cached `iip.policyDecision.resolvedAddress` and merged `MOCK_USER_POLICY`, which allowed a `PREPARED` proposal to still pass Gate 6.5 if the operator removed or rebound a contact in SQLite before clicking Authorize. In R8.4, Gate 6.5 strictly re-evaluates against the live `getActiveUserPolicy(session.userId)` and live `resolveRecipientFromPolicy(...)`, immediately invalidating (`FAILED`) any `PREPARED` proposal whose recipient was removed/rebound or whose amount exceeds a newly lowered `maxTransferAmountETH`. Additionally, `cancelProposalAction` was added and wired to `AgentConsole.tsx` so cancelling a proposal persists `CANCELLED` in SQLite.

---

## 1. Investigation of ETH Gas Anomaly (`ETH_SIM_GAS = 12000`)

### 1.1 Exact Raw JSON-RPC Requests & Responses Captured from Sepolia

All requests below were executed directly against the configured Alchemy Sepolia endpoint (`RPC_URL` on chain `11155111`) with zero code overrides:

1. **Execution Client Version (`web3_clientVersion`):**
   - **Request:** `{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}`
   - **Response:** `{"jsonrpc":"2.0","id":1,"result":"reth/v2.7.0-3d592ec/x86_64-unknown-linux-gnu"}`

2. **Sender Account Inspection (`eth_getCode` & `eth_getBalance`):**
   - **Sender Address:** `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`
   - **`eth_getCode` Response:** `{"jsonrpc":"2.0","id":1,"result":"0x"}` (Confirmed pure EOA; no EIP-7702 delegation bytecode)
   - **`eth_getBalance` Response:** `{"jsonrpc":"2.0","id":1,"result":"0xb1a2bc2ec50000"}` (`50,000,000,000,000,000` wei = `0.05 ETH`)

3. **Case A — Self-Transfer (`from === to`, `value = 0.001 ETH` / `0x5af3107a4000`, `data = "0x"`):**
   - **Request:**
     ```json
     {
       "jsonrpc": "2.0",
       "id": 1,
       "method": "eth_estimateGas",
       "params": [{
         "from": "0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148",
         "to": "0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148",
         "value": "0x5af3107a4000",
         "data": "0x"
       }]
     }
     ```
   - **Exact RPC Response:**
     ```json
     {"jsonrpc":"2.0","id":1,"result":"0x2ee0"}
     ```
     (`0x2ee0` = **`12,000` gas**)

4. **Boundary Proof via `eth_call` at `12,000` (`0x2ee0`) vs `11,999` (`0x2edf`):**
   - **`eth_call` with `gas: "0x2ee0"` (`12,000`):**
     - **Response:** `{"jsonrpc":"2.0","id":1,"result":"0x"}` (Execution succeeds)
   - **`eth_call` with `gas: "0x2edf"` (`11,999`):**
     - **Response:** `{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"intrinsic gas too low"}}`

5. **Case B — Transfer to External Funded EOA (`from !== to`, `value = 0.001 ETH`):**
   - **Request (`to = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, `value = "0x5af3107a4000"`):**
   - **Exact RPC Response:**
     ```json
     {"jsonrpc":"2.0","id":1,"result":"0x5208"}
     ```
     (`0x5208` = **`21,000` gas**)

6. **Case C — Zero-Value Call to External Funded EOA (`from !== to`, `value = 0x0`):**
   - **Request (`to = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, `value = "0x0"`):**
   - **Exact RPC Response:**
     ```json
     {"jsonrpc":"2.0","id":1,"result":"0x3a98"}
     ```
     (`0x3a98` = **`15,000` gas** = `12,000` base + `3,000` cold recipient access)

7. **Case D — Transfer to Empty / Non-Existent EOA (`from !== to`, `value = 0.001 ETH`):**
   - **Request (`to = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, `value = "0x5af3107a4000"`):**
   - **Exact RPC Response:**
     ```json
     {"jsonrpc":"2.0","id":1,"result":"0x9635"}
     ```
     (`0x9635` = **`38,453` gas**, including empty account creation cost)

### 1.2 Why `12000` Appeared & Verification Against Ethereum Rules

- **Root Cause:** Alchemy's Sepolia node (`reth/v2.7.0-3d592ec`) enforces **EIP-2780 (Reduced Intrinsic Transaction Gas)**, which decomposes the legacy flat `21,000` intrinsic gas into:
  - Base transaction intrinsic cost: **`12,000` gas**
  - Cold recipient account access cost (`from !== to`): **`+3,000` gas** (`= 15,000` for zero-value transfer to an existing external EOA)
  - State leaf balance modification (`from !== to` and `value > 0` to existing account): **`+6,000` gas** (`= 21,000` for positive-value transfer to an existing external EOA)
- When `from === to` (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` sending ETH to itself), the recipient is already warm (identical to `tx.origin` / `sender`) and no second account balance leaf is updated, so the exact intrinsic gas required by the protocol is `12,000` (`0x2ee0`).
- **Implementation Hardening:**
  - [`src/core/security/simulator.ts`](../../src/core/security/simulator.ts) (`simulateTransaction`) passes `account: senderAddress as Address` to `publicClient.estimateGas` and `publicClient.call` and returns the **exact, unmanipulated RPC estimate** (`12000n` for self-transfer, `21000n` for external EOA transfer).
  - [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts) (`broadcastTransaction`) now applies a `21000n` gas limit compatibility floor when `iip.simulation?.gasEstimated < 21000n` (`...(gasOverride ? { gas: gasOverride } : {})`), ensuring that even if a downstream peer enforces the legacy `21,000` gas limit floor, the transaction is never rejected (unused gas above `12,000` is refunded).

---

## 2. Execution State Machine Audit

### 2.1 State Transition Matrix (`ALLOWED_STATUS_TRANSITIONS` in `src/core/security/proposal.ts`)

| Source State | Permitted Target States | Terminal? | Can Ever Transition Back to `PREPARED` / `AUTHORIZED` / `SUBMITTING`? |
|---|---|---|---|
| `PREPARED` | `AUTHORIZED`, `CANCELLED`, `EXPIRED`, `FAILED` | No | No |
| `AUTHORIZED` | `SUBMITTING`, `CANCELLED`, `EXPIRED`, `FAILED` | No | No (`PREPARED` forbidden) |
| `SUBMITTING` | `SUBMITTED`, `CONFIRMED`, `REVERTED`, `FAILED_BEFORE_BROADCAST`, `FAILED`, `RECONCILIATION_REQUIRED`, `EXECUTION_UNKNOWN` | No | **No** |
| `SUBMITTED` | `CONFIRMED`, `REVERTED`, `RECONCILIATION_REQUIRED`, `EXECUTION_UNKNOWN` | No | **No** |
| `RECONCILIATION_REQUIRED` | `CONFIRMED`, `REVERTED`, `FAILED` | No | **No** |
| `EXECUTION_UNKNOWN` | `CONFIRMED`, `REVERTED`, `FAILED` | No | **No** |
| `CONFIRMED` | *(None — Empty Set)* | **Yes** | **No** |
| `REVERTED` | *(None — Empty Set)* | **Yes** | **No** |
| `FAILED` | *(None — Empty Set)* | **Yes** | **No** |
| `EXPIRED` | *(None — Empty Set)* | **Yes** | **No** |
| `CANCELLED` | *(None — Empty Set)* | **Yes** | **No** |
| `FAILED_BEFORE_BROADCAST` | *(None — Empty Set)* | **Yes** | **No** |

### 2.2 Adversarial State Machine Test Verification

| # | Adversarial Scenario | Gate / Function | Outcome | Verified By Test |
|---|---|---|---|---|
| 1 | **Concurrent requests** (`Promise.allSettled([authorizeAndExecute(id), authorizeAndExecute(id)])`) | Gate 5 (`authorizeProposal`) + Gate 7 (`lockProposalForExecution`) atomic SQLite `UPDATE ... WHERE status = 'AUTHORIZED'` | Exactly 1 request acquires lock and broadcasts; the concurrent request is rejected with `DUPLICATE_EXECUTION` | `r8-3-security-recovery.test.ts` (Vector 2) |
| 2 | **Duplicate clicks** (re-invoking `authorizeAndExecute(id)` after `CONFIRMED` or while `SUBMITTING`) | Gate 5 (`currentStatus !== 'AUTHORIZED'`) & Gate 7 (`lockProposalForExecution`) | Rejected with `DUPLICATE_EXECUTION`; zero additional signing calls | `r8-3-security-recovery.test.ts` (Vector 1 & 5) |
| 3 | **Expired approvals** (`expires_at <= now`) | Gate 4 (`isProposalExpired`) & SQL `WHERE expires_at > ?` in `authorizeProposal` / `lockProposalForExecution` | Rejected with `PROPOSAL_EXPIRED` before signing | `r8-3-security-recovery.test.ts` (Vector 6) |
| 4 | **Modified recipient** (tampered `candidate.to` in DB or policy contact rebind after `PREPARED`) | Gate 6 (`verifyIIPDigest`) + Gate 6.5 (`analyzeTransaction` & live `resolveRecipientFromPolicy`) | Proposal marked `FAILED`; rejected with `TAMPERED_PAYLOAD` | `r8-3-security-recovery.test.ts` (Vector 3), `r8-4-execution-integrity.test.ts` |
| 5 | **Modified amount** (tampered `candidate.value` even with forged digest, or lowered policy cap) | Gate 6.5 (`analyzeTransaction` `AMOUNT_MISMATCH` + live `evaluatePolicy`) | Proposal marked `FAILED`; rejected with `TAMPERED_PAYLOAD` | `r8-3-security-recovery.test.ts` (Vector 4), `r8-4-execution-integrity.test.ts` |
| 6 | **Wrong chain** (`candidate.chainId = 1` Mainnet instead of `11155111` Sepolia) | Gate 6.5 (`analyzeTransaction` `CHAIN_MISMATCH: candidate targets chain 1, expected Sepolia 11155111`) | Proposal marked `FAILED`; rejected with `TAMPERED_PAYLOAD` before signing | `r8-4-execution-integrity.test.ts` |
| 7 | **Invalid transaction digest** (mismatch between column `digest`, `iip.proofDigest`, or recomputed Keccak-256) | Gate 6 (`freshProposal.digest !== iip.proofDigest \|\| !verifyIIPDigest(iip)`) | Proposal marked `FAILED`; rejected with `TAMPERED_PAYLOAD` | `r8-3-security-recovery.test.ts` (Vector 7) |
| 8 | **RPC timeout during broadcast / receipt** | Phase B (`BroadcastError('BROADCAST_OUTCOME_UNKNOWN')` -> `EXECUTION_UNKNOWN`) / Phase D (`waitForReceipt` timeout -> `RECONCILIATION_REQUIRED`) | Proposal locked in non-replayable state; automatic replay strictly forbidden | `r7-3-broadcast-recovery.test.ts` (N1–N5), `r8-3-security-recovery.test.ts` (Vector 8) |
| 9 | **Broadcast success followed by SQLite failure** (`markSubmitted` throws `SQLITE_BUSY`) | Phase C (`writeBroadcastRecoveryJournal` before `markSubmitted`, isolated `catch (dbErr)`) | Never marked `FAILED_BEFORE_BROADCAST`; `txHash` preserved in disk journal and response; proposal remains locked | `r8-3-security-recovery.test.ts` (Vector 9), `r8-4-execution-integrity.test.ts` |
| 10 | **Restart during transaction submission** (server crashes while status is `SUBMITTING`) | SQLite persistent `SUBMITTING` state + `authorizeAndExecute` Gate 5 | Subsequent `authorizeAndExecute` rejected with `DUPLICATE_EXECUTION`; recoverable via `recoverPostBroadcastProposalAction` | `r8-4-execution-integrity.test.ts` |

---

## 3. Post-Broadcast Recovery Verification

### 3.1 Four-Step Failure Sequence Analysis

We tested the exact 4-step crash scenario in [`src/core/security/__tests__/r8-4-execution-integrity.test.ts`](../../src/core/security/__tests__/r8-4-execution-integrity.test.ts):

1. **Step 1 — Blockchain accepts transaction:**
   - `authorizeAndExecute(proposalId)` locks the proposal in `SUBMITTING` (Gate 7) and calls `broadcastTransaction()`, which returns `hash = 0x99998888...`.
   - Immediately upon receiving `hash` (before touching SQLite in Phase C), `orchestrator.ts` calls `writeBroadcastRecoveryJournal(proposalId, hash, session.userId)`, persisting `{ proposalId, txHash, ownerId, recordedAt }` to disk.
2. **Step 2 — Database update fails:**
   - Both `markSubmitted(proposalId, hash)` and fallback `recordTxHash(proposalId, hash)` throw `SQLITE_BUSY: database is locked`.
   - `authorizeAndExecute` returns `POST_BROADCAST_DB_FAILURE` with `transactionHash: hash` and `broadcastOutcome: 'BROADCAST_SUBMITTED'`.
3. **Step 3 — Server restarts:**
   - In-memory state is lost. In SQLite, `tx_hash` is `NULL` (because Step 2 failed) and `status` is `SUBMITTING` or `RECONCILIATION_REQUIRED`.
   - On disk, the Broadcast Recovery Journal still holds `proposalId -> 0x99998888...`.
4. **Step 4 — User retries execution / triggers recovery:**
   - **4a (`authorizeAndExecute` retry):** Immediately rejected with `DUPLICATE_EXECUTION` because the proposal is locked in `SUBMITTING` / `RECONCILIATION_REQUIRED`. `broadcastTransaction` call count remains `1` (never re-broadcasts).
   - **4b (`recoverPostBroadcastProposalAction(proposalId)`):**
     - Recovers `txHash` via 3-tier lookup:
       1. **Tier 1:** SQLite `proposal.txHash`
       2. **Tier 2:** Durable disk Broadcast Recovery Journal (`readBroadcastRecoveryJournal(proposalId)`)
       3. **Tier 3:** Read-only scan of recent Sepolia blocks (`findMatchingBroadcastTxOnChain`) matching `(from, to, value, data)`
     - Backfills `recordTxHash(proposalId, recoveredHash)` into SQLite.
     - Calls `waitForReceipt(recoveredHash, rpcUrl)` (**zero calls to `broadcastTransaction`**).
     - Reconciles the proposal in SQLite to `CONFIRMED` (or `REVERTED`) and clears the recovery journal entry.
   - **Conservative `EXECUTION_UNKNOWN` Handling:** If an ambiguous network timeout occurred during broadcast and no transaction hash is found in Tier 1, Tier 2, or Tier 3 on-chain blocks, `recoverPostBroadcastProposalAction` keeps the proposal locked in `EXECUTION_UNKNOWN` (`RECOVERY_TX_HASH_UNKNOWN`) and never resets it to an executable state.

---

## 4. Verification of R8.3 & R8.4 Security Fixes

| Security Control | Implementation Location | Verification Evidence | Status |
|---|---|---|---|
| **ERC-20 sender account passed to simulation** | `src/core/security/simulator.ts` (`simulateTransaction` lines 127–138) | Passes `account: senderAddress as Address` to both `estimateGas` and `call`. Verified with live Sepolia `USDC` `approve` (`gasEstimated = 45834n`) and `transfer` (`INSUFFICIENT_TOKEN_BALANCE`). | **VERIFIED** |
| **Token contract addresses verified on Sepolia** | `src/core/transaction/builder.ts` (`SUPPORTED_TOKENS`) & `simulator.ts` (`getCode`) | `USDC` (`0x1c7D...7238`), `DAI` (`0xFF34...a357`), and `USDT` (`0x7169...BA06`) all verified to have non-empty EVM bytecode on Sepolia; undeployed contracts fail closed with `INVALID_TOKEN_CONTRACT`. | **VERIFIED** |
| **Actual `allowance(owner, spender)` reads & unknown state distinction** | `src/core/web3/wallet-service.ts` (`getTokenAllowance`) & `src/core/security/approval-analyzer.ts` | Reads live on-chain ERC-20 `allowance`. Distinguishes `REAL_ALLOWANCE`, `UNKNOWN_ALLOWANCE`, `RPC_FAILURE`, and `UNSUPPORTED_TOKEN` without fabricating `0n` on error. | **VERIFIED** |
| **Safe recipient allowlist (no hardcoded third-party Alice)** | `src/core/policy/user-policy.ts` (`DEFAULT_EXECUTABLE_USER_POLICY`, `FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES`) | `DEFAULT_EXECUTABLE_USER_POLICY.trustedContacts` has no `alice` or `bob`. Vitalik (`0xd8dA...6045`), zero, and burn addresses are permanently forbidden in `updateActiveUserPolicy`. | **VERIFIED** |
| **SQLite policy persistence & audit logging** | `src/core/policy/user-policy.ts` (`user_policies`, `policy_audit_log` tables) | Policy updates are persisted in SQLite inside a transaction with full before/after JSON audit logs. | **VERIFIED** |
| **Authenticated policy updates** | `src/app/actions/orchestrator.ts` (`getActivePolicyAction`, `updateUserPolicyAction`) | Enforces `verifySession()` before reading or updating policy; unauthenticated calls throw `UNAUTHORIZED_ACCESS`. | **VERIFIED** |
| **Execution-time policy revalidation & mid-flight invalidation** | `src/app/actions/orchestrator.ts` (`authorizeAndExecute` Gate 6.5) | Re-evaluates `resolveRecipientFromPolicy` and `evaluatePolicy` against live `getActiveUserPolicy(session.userId)`. Lowering `maxTransferAmountETH`, removing `alice`, or rebinding `alice` after `PREPARED` immediately blocks execution and marks the proposal `FAILED`. | **VERIFIED** |
| **AI provider provenance (`LIVE_AI` vs `LOCAL_FALLBACK`)** | `src/core/ai/provider.ts` & `src/components/agent/EvidencePanel.tsx` | Live Groq (`llama-3.3-70b-versatile`) returns `provenance: 'LIVE_AI'`, `providerName: 'groq'`; deterministic fallback returns `LOCAL_FALLBACK` when API keys are absent. | **VERIFIED** |

---

## 5. Human Browser & UI Action Verification

> **Explicit Tooling Disclosure:** No GUI browser automation tool (such as Playwright or Puppeteer) is installed in this environment. Per audit rules, we **do not claim** GUI browser click tests were executed. Instead, all 10 UI user flows were verified via direct Server Action integration tests and component wiring inspection:

1. **Login (`/api/auth/login`):** Verified constant-time `scryptSync` + `timingSafeEqual` authentication and SQLite session creation (`src/app/api/auth/__tests__/auth-routes.test.ts`).
2. **Navigate to Security Center (`#security-center`):** Verified `Sidebar.tsx` hash navigation and `SecurityHistoryPanel.tsx` calling `getProposalHistoryAction()`.
3. **Navigate to Policies (`#policies`):** Verified `PolicyManagementPanel.tsx` calling `getActivePolicyAction()`.
4. **Save Policy:** Verified `updateUserPolicyAction` persists `maxTransferAmountETH` and `trustedContacts` to SQLite `user_policies` and appends to `policy_audit_log`.
5. **Bind Alice to My Test Wallet (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`):** Verified `handleBindAliceToSelf` in `PolicyManagementPanel.tsx` binds `alice` to the configured test wallet address and persists it in SQLite.
6. **Submit Intent (`Send 0.001 ETH to alice`):** Verified `prepareTransactionIntent` parses via Groq `llama-3.3-70b-versatile`, evaluates live policy, runs Sepolia `estimateGas` (`12,000` gas for self-transfer), generates Keccak-256 IIP digest, and stores `PREPARED` proposal in SQLite.
7. **Cancel Proposal:** Verified `handleCancelProposal` in `AgentConsole.tsx` calls `cancelProposalAction(proposalId)`, transitioning the proposal to `CANCELLED` in SQLite so it can never be executed later.
8. **Verify Live AI Badge:** Verified `EvidencePanel.tsx` renders `LIVE AI (groq · llama-3.3-70b-versatile)` when `aiProvenance === 'LIVE_AI'` and `LOCAL DETERMINISTIC FALLBACK` when `aiProvenance === 'LOCAL_FALLBACK'`.
9. **Verify Transaction History & Post-Broadcast Reconcile Button:** Verified `SecurityHistoryPanel.tsx` lists proposals from SQLite and renders a **Reconcile Receipt** button for `RECONCILIATION_REQUIRED`, `SUBMITTING`, `SUBMITTED`, and `EXECUTION_UNKNOWN` records wired to `recoverPostBroadcastProposalAction`.
10. **Verify Blocked Transactions Cannot Be Executed:** Verified `EvidencePanel.tsx` hides the Authorize button whenever `!analysis.canExecute || prepareResult.isDemo`, and `authorizeAndExecute` independently blocks `SECURITY_FIXTURE`, `UNVERIFIED`, and policy-violating proposals on the backend.

---

## 6. Complete Regression Suite Results

1. **Vitest Full Suite (`npx vitest run`):**
   - **Test Files:** `33 passed (33)`
   - **Tests:** `354 passed (354)` (`0` failures)
2. **TypeScript Typecheck (`npx tsc --noEmit`):**
   - **Result:** `0` errors
3. **ESLint (`npm run lint`):**
   - **Result:** `0` errors, `0` warnings
4. **Production Build (`npm run build`):**
   - **Result:** Next.js `16.4.0 (Turbopack)` compiled and generated all static/dynamic routes with `0` errors and `0` warnings.
5. **Transactions Broadcast:**
   - **Result:** `0` transactions signed or broadcast.

---

## 7. Final Readiness Assessment & Residual Boundaries

- **Verdict:** **READY FOR ONE HUMAN-CONTROLLED SEPOLIA SELF-TRANSFER TEST**
- **Why:**
  - The configured wallet (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`) holds `0.05` Sepolia ETH on chain `11155111`.
  - Binding `alice` to `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` via the authenticated Policy Management UI keeps test funds inside the same wallet (only Sepolia gas is spent).
  - The EIP-2780 self-transfer gas estimate (`12,000`) is paired with a `21,000` gas limit floor at broadcast time in `controller.ts`.
  - Post-broadcast database failures and server restarts are protected by the durable Broadcast Recovery Journal and 3-tier `recoverPostBroadcastProposalAction` without risking duplicate broadcasts.
- **Residual Limitations (No 100% Security Claim):**
  - The application uses a server-side `AGENT_PRIVATE_KEY` in `.env` intended strictly for single-operator Sepolia testnet evaluation, not multi-tenant production custody or mainnet funds.
  - A step-by-step Bengali human test checklist for executing one controlled Sepolia self-transfer is provided in [`docs/reports/SEPOLIA_SELF_TRANSFER_CHECKLIST_BN.md`](./SEPOLIA_SELF_TRANSFER_CHECKLIST_BN.md).
