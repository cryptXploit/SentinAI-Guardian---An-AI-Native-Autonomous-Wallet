# SENTINAI GUARDIAN — SECURITY RECOVERY & REAL EXECUTION READINESS REPORT (R8.3)

**Date:** October 15, 2026**Competition:** 2026 Shenzhen International FinTech Competition — Topic F: Autonomous Agent Wallet**Milestone:** R8.3 — Security Recovery & Real Execution Readiness**Status:** All Priority 1–5 Remediation Items Verified & Passing (`344/344` Automated Tests, `0` TypeScript Errors, `0` ESLint Errors, Production Build Passing, Live Sepolia RPC & Groq AI Verified)

---

## 1. Executive Summary

Following the Independent Real-World Verification Audit (`REAL_WORLD_VERIFICATION_REPORT.md` and `CRITICAL_SECURITY_FINDINGS.md`), all verified financial safety, execution state machine, configuration consistency, and UI/UX findings have been systematically remediated and verified against both automated adversarial suites and live Ethereum Sepolia (`Chain ID: 11155111`) + Groq AI (`openai/gpt-oss-120b`) endpoints.

| Priority | Finding / Area | Status | Key Implementation & Verification |
| :--- | :--- | :--- | :--- |
| **Priority 1 — CSF-01** | Live ERC-20 Simulation & Account Passing | ✅ **FIXED & VERIFIED** | [`simulateTransaction`](file:///e:/SentinAI%20Gaurdian/src/core/security/simulator.ts#L79-L181) now passes the configured wallet `account` to `publicClient.estimateGas`, checks `candidate.chainId === 11155111`, verifies contract bytecode via `getCode`, and classifies `WRONG_CHAIN`, `INVALID_TOKEN_CONTRACT`, `INSUFFICIENT_TOKEN_BALANCE`, `INSUFFICIENT_GAS_BALANCE`, `EXECUTION_REVERTED`, and `RPC_ERROR`. Fixed undeployed Sepolia DAI/USDT addresses in [`builder.ts`](file:///e:/SentinAI%20Gaurdian/src/core/transaction/builder.ts#L16-L35) and [`user-policy.ts`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L45-L97). |
| **Priority 1 — CSF-02** | Unsafe Default Recipient (`alice`) | ✅ **FIXED & VERIFIED** | Removed hardcoded third-party `alice` (`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`) from [`DEFAULT_EXECUTABLE_USER_POLICY`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L31-L40). Unconfigured aliases fail closed (`UNKNOWN`). Added explicit `APPROVED_TEST_RECIPIENT_ADDRESS` support, `FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES` guard, and authenticated SQLite policy persistence (`user_policies` + `policy_audit_log`). |
| **Priority 1 — CSF-03** | Fabricated `0n` Token Allowance | ✅ **FIXED & VERIFIED** | Added [`getTokenAllowance`](file:///e:/SentinAI%20Gaurdian/src/core/web3/wallet-service.ts#L101-L162) reading live ERC-20 `allowance(owner, spender)` on Sepolia and returning `REAL_ALLOWANCE`, `UNKNOWN_ALLOWANCE`, `RPC_FAILURE`, or `UNSUPPORTED_TOKEN`. Updated [`analyzeApprovalExposure`](file:///e:/SentinAI%20Gaurdian/src/core/security/approval-analyzer.ts#L61-L210) so unknown/failed reads are never presented as verified zero (`0n`). |
| **Priority 2** | 10 Execution Safety Vectors | ✅ **FIXED & VERIFIED** | Added Gate 6.5 Phase 2 independent semantic & policy re-verification in [`authorizeAndExecute`](file:///e:/SentinAI%20Gaurdian/src/app/actions/orchestrator.ts#L699-L730) and isolated Phase C (`markSubmitted`) from Phase B (`broadcastTransaction`) at [`orchestrator.ts`](file:///e:/SentinAI%20Gaurdian/src/app/actions/orchestrator.ts#L789-L805) so post-broadcast DB errors return `POST_BROADCAST_DB_FAILURE` and never mark an already-broadcast transaction as `FAILED_BEFORE_BROADCAST`. |
| **Priority 3** | Configuration & Documentation Consistency | ✅ **FIXED & VERIFIED** | Aligned `.env`, [`.env.example`](file:///e:/SentinAI%20Gaurdian/.env.example), [`env.ts`](file:///e:/SentinAI%20Gaurdian/src/core/config/env.ts), [`REAL_LIFE_FULL_TESTING_GUIDE_BN.md`](file:///e:/SentinAI%20Gaurdian/docs/reports/REAL_LIFE_FULL_TESTING_GUIDE_BN.md), and [`HUMAN_CLICK_BY_CLICK_TEST_BN.md`](file:///e:/SentinAI%20Gaurdian/docs/reports/HUMAN_CLICK_BY_CLICK_TEST_BN.md) on `OPERATOR_PASSWORD`, `1.0 ETH` transfer cap, `APPROVED_TEST_RECIPIENT_ADDRESS`, `openai/gpt-oss-120b`, and Chain ID `11155111`. |
| **Priority 4** | User Experience & Transparency | ✅ **FIXED & VERIFIED** | Functional sidebar anchor navigation in [`Sidebar.tsx`](file:///e:/SentinAI%20Gaurdian/src/components/layout/Sidebar.tsx), persistent SQLite proposal audit table in [`SecurityHistoryPanel.tsx`](file:///e:/SentinAI%20Gaurdian/src/components/agent/SecurityHistoryPanel.tsx), authenticated SQLite policy editor in [`PolicyManagementPanel.tsx`](file:///e:/SentinAI%20Gaurdian/src/components/agent/PolicyManagementPanel.tsx), accurate AI provider/model badges (`GROQ AI · openai/gpt-oss-120b`), and truthful allowance & confirmation states in [`IntentComparisonPanel.tsx`](file:///e:/SentinAI%20Gaurdian/src/components/agent/IntentComparisonPanel.tsx) and [`EvidencePanel.tsx`](file:///e:/SentinAI%20Gaurdian/src/components/agent/EvidencePanel.tsx). |

---

## 2. Priority 1 — Critical Financial Safety Remediation

### 2.1 Fix CSF-01: ERC-20 Simulation & Deployed Sepolia Token Contracts
- **Root Causes Identified:**
  1. `publicClient.estimateGas` in [`src/core/security/simulator.ts`](file:///e:/SentinAI%20Gaurdian/src/core/security/simulator.ts) previously omitted the `account` parameter, causing live Sepolia RPC nodes to simulate ERC-20 `transfer`/`approve` calls with `msg.sender = 0x0000000000000000000000000000000000000000` and revert with `ERC20: transfer/approve from the zero address`.
  2. On-chain Sepolia contract audit revealed a contract address mismatch between [`builder.ts`](file:///e:/SentinAI%20Gaurdian/src/core/transaction/builder.ts) and [`user-policy.ts`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts):
     - `DAI` in `builder.ts` was `0x3e622317F8c93f7328350cF0b56318C4cb595a97` (`0` bytes of bytecode on Sepolia), whereas `user-policy.ts` used the deployed Sepolia DAI contract `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` (`10,926` bytes, `symbol() === "DAI"`, `decimals() === 18`).
     - `USDT` in `user-policy.ts` was `0x7169D3882044463f11A3E45775678B78d3845610` (`0` bytes on Sepolia), whereas `builder.ts` used the deployed Sepolia USDT contract `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06` (`23,720` bytes, `symbol() === "USDT"`, `decimals() === 6`).
- **Implementation:**
  - Aligned [`SUPPORTED_TOKENS.DAI.address`](file:///e:/SentinAI%20Gaurdian/src/core/transaction/builder.ts#L30-L35) and [`DEFAULT_TOKEN_APPROVAL_POLICIES`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L45-L97) so all three supported ERC-20 tokens (`USDC`, `USDT`, `DAI`) point to verified deployed Sepolia contracts.
  - Updated [`simulateTransaction`](file:///e:/SentinAI%20Gaurdian/src/core/security/simulator.ts#L79-L181) to resolve the active wallet account (`senderAccount` or `getAgentWalletAddress().address`), verify `candidate.chainId === 11155111` (`WRONG_CHAIN`), verify on-chain bytecode via `publicClient.getCode` (`INVALID_TOKEN_CONTRACT`), pass `account` to `publicClient.estimateGas`, and classify reverts into `INSUFFICIENT_TOKEN_BALANCE`, `INSUFFICIENT_GAS_BALANCE`, `EXECUTION_REVERTED`, or `RPC_ERROR`.
- **Live Sepolia Verification Evidence (`task-4838`):**
  - `ETH_SIM_GAS`: `12000` gas (`0.0001 ETH` transfer from `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` to `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`)
  - `USDC_APPROVE_GAS`: `140030` gas (`50 USDC` approve for Uniswap Universal Router `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD`)
  - `USDT_APPROVE_GAS`: `131715` gas (`50 USDT` approve)
  - `DAI_APPROVE_GAS`: `129238` gas (`50 DAI` approve)
  - `USDC` transfer with `0 USDC` balance reverts with `ERC20: transfer amount exceeds balance` (`INSUFFICIENT_TOKEN_BALANCE`), proving `msg.sender` is now the real wallet account.

### 2.2 Fix CSF-02: Safe Recipient Configuration & Fail-Closed Contacts
- **Implementation:**
  - Removed hardcoded third-party `alice` (`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`) from [`DEFAULT_EXECUTABLE_USER_POLICY`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L31-L40).
  - Added [`FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L20-L24) blocking Vitalik's address (`0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`), the zero address (`0x0000...0000`), and the burn address (`0x0000...dEaD`) from being configured in executable policies.
  - Added [`getActiveUserPolicy`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L117-L168), [`updateActiveUserPolicy`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L173-L254), and [`getPolicyAuditLogs`](file:///e:/SentinAI%20Gaurdian/src/core/policy/user-policy.ts#L259-L290) backed by SQLite `user_policies` and `policy_audit_log` tables.
  - Configured `.env` `APPROVED_TEST_RECIPIENT_ADDRESS=0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` (the operator's own derived Sepolia test wallet address).

### 2.3 Fix CSF-03: Real On-Chain Allowance Reads
- **Implementation:**
  - Added [`getTokenAllowance`](file:///e:/SentinAI%20Gaurdian/src/core/web3/wallet-service.ts#L101-L162) to query live ERC-20 `allowance(owner, spender)` on Sepolia and return `AllowanceReadStatus` (`REAL_ALLOWANCE`, `UNKNOWN_ALLOWANCE`, `RPC_FAILURE`, `UNSUPPORTED_TOKEN`).
  - Updated [`prepareTransactionIntent`](file:///e:/SentinAI%20Gaurdian/src/app/actions/orchestrator.ts#L502-L520) and [`analyzeApprovalExposure`](file:///e:/SentinAI%20Gaurdian/src/core/security/approval-analyzer.ts#L61-L210) so unverified or failed allowance reads are never fabricated as `0n`.

---

## 3. Priority 2 — Execution Safety (10 Adversarial Vectors Verified)

All 10 execution safety vectors are enforced server-side in [`authorizeAndExecute`](file:///e:/SentinAI%20Gaurdian/src/app/actions/orchestrator.ts#L653-L855) and [`proposal.ts`](file:///e:/SentinAI%20Gaurdian/src/core/security/proposal.ts) and verified in [`r8-3-security-recovery.test.ts`](file:///e:/SentinAI%20Gaurdian/src/core/security/__tests__/r8-3-security-recovery.test.ts):

1. **Duplicate execution:** Rejected via `DUPLICATE_EXECUTION` (`authorizeProposal` / `lockProposalForExecution`).
2. **Concurrent execution:** Atomic SQLite `UPDATE ... WHERE status = 'AUTHORIZED'` ensures only one concurrent caller acquires the `SUBMITTING` lock.
3. **Modified recipient after approval:** Blocked by Gate 6 (`verifyIIPDigest` + `freshProposal.digest === iip.proofDigest`) and Gate 6.5 (`analyzeTransaction` + `evaluatePolicy` independent re-verification).
4. **Modified amount after approval:** Blocked even if `digest` and `proofDigest` are both forged in SQLite, because Gate 6.5 re-runs `evaluatePolicy` and `analyzeTransaction` against the operator's active policy before signing.
5. **Reused approval:** Terminal state `CONFIRMED` cannot transition back to `AUTHORIZED` or `SUBMITTING` (`ALLOWED_STATUS_TRANSITIONS`).
6. **Expired proposal:** Rejected via `PROPOSAL_EXPIRED` prior to signing.
7. **Invalid IIP digest:** Rejected via `TAMPERED_PAYLOAD` when stored `digest` or `iipData.proofDigest` is corrupted.
8. **RPC timeout after broadcast:** Transitions proposal to `RECONCILIATION_REQUIRED` and returns `RECEIPT_PENDING` with the broadcast `transactionHash`, preventing duplicate replay.
9. **Database transaction failure after broadcast:** Phase C (`markSubmitted`) is isolated from Phase B (`broadcastTransaction`) so a SQLite failure after broadcast returns `POST_BROADCAST_DB_FAILURE` and never marks an already-broadcast transaction as `FAILED_BEFORE_BROADCAST`.
10. **Unauthorized execution request:** Missing sessions throw `UNAUTHORIZED_ACCESS`; cross-operator sessions throw `OWNERSHIP_VIOLATION`.

---

## 4. Priority 5 — Verification Summary

- **Automated Test Suite (`npx vitest run`):** `32/32` test files passed, **`344/344` tests passing** (`0` failures).
- **TypeScript (`npx tsc --noEmit`):** Exit code `0` (`0` errors).
- **ESLint (`npm run lint`):** Exit code `0` (`0` errors, `0` warnings).
- **Next.js Production Build (`npm run build`):** Exit code `0` (compiled & type-checked cleanly).
- **Live Sepolia Read-Only RPC & Simulation (`task-4838`):** Verified live on Chain ID `11155111` (Block `#11921674`), wallet `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` balance `0.05 ETH`, ETH transfer gas `12000`, USDC approve gas `140030`, USDT approve gas `131715`, DAI approve gas `129238`, live on-chain `allowance` reads `0`.
- **Live Groq API Integration:** Verified `HTTP 200` from `openai/gpt-oss-120b` with structured JSON output.
- **No Unintended Broadcasts:** Zero transactions were signed or broadcast during verification.
