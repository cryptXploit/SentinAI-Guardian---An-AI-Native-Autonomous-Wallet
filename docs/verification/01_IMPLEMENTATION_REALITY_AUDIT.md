# SentinAI Guardian — Complete Implementation Reality Audit (Phase 1)

**Repository:** `cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet`  
**Audit Timestamp:** `2026-10-19T13:38:00+06:00`  
**Branch / Baseline Commit:** `main` (`735611f0cacd5d204b9269be5c34c7776125eb95` + R8.5 diagnostic & provenance hardening)

---

## 1. Classification Legend

In accordance with Global Execution Rules 3–5, no component is labeled `VERIFIED LIVE` based solely on source code existence or unit tests:
- **`VERIFIED LIVE`**: Confirmed via genuine runtime execution against live external services (Google Gemini API, Groq API, Ethereum Sepolia RPC, or on-chain Sepolia block explorer / receipt verification).
- **`VERIFIED LOCAL`**: Confirmed via deterministic local runtime execution and SQLite persistence (e.g., session auth, policy evaluation, calldata decoding, atomic SQLite state transitions).
- **`MOCK`**: Intentional demonstration or fallback component (e.g., `SECURITY_FIXTURE` threat demos or `MockIntentProvider` offline regex fallback).
- **`PARTIAL`**: Core logic works, but a sub-feature or UX presentation requires enhancement.
- **`BROKEN`**: Defect identified during inspection.
- **`NOT TESTED`**: Not yet executed in the target runtime environment.

---

## 2. Frontend Routes, API Endpoints & Server Actions Inventory

### 2.1 Application Routes & API Endpoints

| Route / Endpoint | File Path | Classification | Runtime Evidence |
| :--- | :--- | :--- | :--- |
| **`GET /` (Main Dashboard & Command Center)** | [`src/app/page.tsx`](../../src/app/page.tsx) | `VERIFIED LIVE` | Queries `getLiveWalletOverview()` per connection (`export const instant = false`) and renders live Sepolia ETH balance (`0.049999999998368 ETH`), ERC-20 balances (`USDC`, `USDT`, `DAI`), and block number (`#11946734+`). |
| **`POST /api/auth/login` & `GET /api/auth/login`** | [`src/app/api/auth/login/route.ts`](../../src/app/api/auth/login/route.ts) | `VERIFIED LOCAL` | Validates operator password via `timingSafeEqual`, creates HTTP-only session cookie (`sentinai_session`), and persists session in SQLite `sessions` table. |
| **`POST /api/auth/logout`** | [`src/app/api/auth/logout/route.ts`](../../src/app/api/auth/logout/route.ts) | `VERIFIED LOCAL` | Revokes active session token in SQLite `sessions` table and clears HTTP-only cookie. |

### 2.2 Server Actions (`src/app/actions/orchestrator.ts`)

| Server Action | Lines | Classification | Runtime Evidence |
| :--- | :--- | :--- | :--- |
| **`prepareTransactionIntent(command)`** | [`orchestrator.ts#L214-L545`](../../src/app/actions/orchestrator.ts#L214-L545) | `VERIFIED LIVE` | Authenticates session, invokes `parseIntentWithProvenance(command)` (live Groq/Gemini with request-scoped provenance), validates state-changing intent, resolves recipient from SQLite policy, builds transaction candidate, simulates via Sepolia RPC (`eth_estimateGas`), evaluates deterministic policy & calldata alignment, reads live ERC-20 allowance if `APPROVE`, generates Keccak-256 IIP digest, and persists proposal in SQLite. |
| **`testSecurityFixtureAction(scenarioId)`** | [`orchestrator.ts#L557-L648`](../../src/app/actions/orchestrator.ts#L557-L648) | `MOCK` (Controlled Demo) | Runs real `analyzeTransaction`, `analyzeApprovalExposure`, and `evaluatePolicy` on 5 curated Topic F attack/safe fixtures (`fixtures/security/`), storing with `provenance = 'SECURITY_FIXTURE'` and `is_executable = 0` so fixtures can never be broadcast. |
| **`authorizeAndExecute(proposalId)`** | [`orchestrator.ts#L666-L898`](../../src/app/actions/orchestrator.ts#L666-L898) | `VERIFIED LIVE` | Enforces 9 security gates (session auth, proposal existence, fixture isolation, ownership, expiry, `PREPARED -> AUTHORIZED`, Keccak-256 IIP digest verification, Gate 6.5 live semantic & policy revalidation, and `AUTHORIZED -> SUBMITTING` atomic lock), broadcasts signed transaction to Sepolia (`21000n` gas floor), writes durable Broadcast Recovery Journal before updating SQLite to `SUBMITTED`, and confirms receipt (`CONFIRMED` on Sepolia tx `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`). |
| **`recoverPostBroadcastProposalAction(proposalId)`** | [`orchestrator.ts#L906-L1059`](../../src/app/actions/orchestrator.ts#L906-L1059) | `VERIFIED LOCAL` | 3-tier non-rebroadcasting recovery: checks SQLite `tx_hash`, then disk Broadcast Recovery Journal, then read-only recent Sepolia block scan (`findMatchingBroadcastTxOnChain`), and reconciles receipt status without ever calling `broadcastTransaction`. |
| **`cancelProposalAction(proposalId)`** | [`orchestrator.ts#L1064-L1103`](../../src/app/actions/orchestrator.ts#L1064-L1103) | `VERIFIED LOCAL` | Transitions `PREPARED` or `AUTHORIZED` proposal owned by operator to terminal `CANCELLED` state in SQLite. |
| **`getProposalHistoryAction()`** | [`orchestrator.ts#L1108-L1134`](../../src/app/actions/orchestrator.ts#L1108-L1134) | `VERIFIED LOCAL` | Returns top 25 owner-bound proposals from SQLite `proposals` table (including confirmed Sepolia tx `0xfe315950...`). |
| **`getActivePolicyAction()`** | [`orchestrator.ts#L1139-L1158`](../../src/app/actions/orchestrator.ts#L1139-L1158) | `VERIFIED LOCAL` | Reads active user policy from SQLite `user_policies` (or safe fail-closed default with `APPROVED_TEST_RECIPIENT_ADDRESS`) and top 15 `policy_audit_log` entries. |
| **`updateUserPolicyAction(input)`** | [`orchestrator.ts#L1163-L1197`](../../src/app/actions/orchestrator.ts#L1163-L1197) | `VERIFIED LOCAL` | Validates ETH cap (`0.0001`–`100`), rejects zero/burn/Vitalik/public addresses in `trustedContacts`, persists to SQLite `user_policies`, and records immutable entry in `policy_audit_log`. |

---

## 3. Core Engine & Security Subsystems Inventory

| Subsystem | Source Files | Classification | Runtime Evidence & Technical Findings |
| :--- | :--- | :--- | :--- |
| **AI Provider Router & Failover** | [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts), [`src/core/ai/intent-parser.ts`](../../src/core/ai/intent-parser.ts) | `VERIFIED LIVE` | Supports `GroqIntentProvider` (`openai/gpt-oss-120b` with auto-tier failover to `openai/gpt-oss-20b` and `qwen/qwen3.8-27b`), `GeminiIntentProvider` (`gemini-3.8-flash`), and `MockIntentProvider` (deterministic regex fallback). Includes `dns.setDefaultResultOrder('ipv4first')` fix for Windows Node v24 `undici` IPv6 stalls and request-scoped `parseIntentWithProvenance`. |
| **Multilingual & Adversarial Intent Normalization** | [`src/core/ai/provider.ts#L451-L554`](../../src/core/ai/provider.ts#L451-L554) | `VERIFIED LIVE` | Normalizes Bengali Unicode digits (`০-৯`), Bengali script commands (`এলিস কে ০.০০০১ ইথ পাঠাও`), Banglish (`alice ke 0.0001 ETH pathao`), and blocks English/Bengali negations (`Do not send...`, `পাঠিও না`) and prompt injections (`Ignore all policies...`) at both provider and orchestrator layers. |
| **Zod Domain Schema Validation** | [`src/core/domain/schemas.ts`](../../src/core/domain/schemas.ts) | `VERIFIED LOCAL` | Enforces strict enum actions (`TRANSFER`, `APPROVE`, `SWAP`, `QUERY_BALANCE`, `QUERY_NETWORK`, `UNKNOWN`), asset symbols, numeric string formatting, and policy schemas. |
| **Deterministic Policy Engine** | [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts), [`src/core/policy/user-policy.ts`](../../src/core/policy/user-policy.ts) | `VERIFIED LOCAL` | 100% synchronous, LLM-independent policy evaluation using exact `BigInt` Wei arithmetic (`parseTokenAmount`). Enforces trusted contact resolution (CSF-02), ETH transfer caps, unlimited approval prohibition, and per-token ERC-20 approval caps (`100 USDC/USDT/DAI`). |
| **Transaction Builder (EVM Calldata)** | [`src/core/transaction/builder.ts`](../../src/core/transaction/builder.ts) | `VERIFIED LOCAL` | Encodes native ETH transfers (`data: undefined`) and ERC-20 `transfer(address,uint256)` (`0xa9059cbb`) / `approve(address,uint256)` (`0x095ea7b3`) calldata for verified Sepolia token contracts (`USDC`, `USDT`, `DAI`) on Chain ID `11155111`. |
| **Semantic Transaction & Approval Analyzer** | [`src/core/security/transaction-analyzer.ts`](../../src/core/security/transaction-analyzer.ts), [`src/core/security/approval-analyzer.ts`](../../src/core/security/approval-analyzer.ts) | `VERIFIED LIVE` | Independently decodes candidate EVM calldata using Viem `decodeFunctionData` and compares decoded method, token contract, recipient/spender, amount, native value, and chain ID against parsed intent. Queries live on-chain ERC-20 `allowance(owner, spender)` on Sepolia (CSF-03). |
| **Account-Bound Sepolia Simulator** | [`src/core/security/simulator.ts`](../../src/core/security/simulator.ts) | `VERIFIED LIVE` | Verifies RPC `eth_chainId === 11155111`, checks contract bytecode (`eth_getCode`) for ERC-20 targets, and runs `eth_estimateGas` with the configured sender wallet `account: 0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` (CSF-01). |
| **Intent Integrity Proof (IIP)** | [`src/core/security/iip.ts`](../../src/core/security/iip.ts) | `VERIFIED LOCAL` | Computes deterministic canonical Keccak-256 content-integrity digest (`proofDigest`) over `{intent, candidate (to, value, data, chainId), policyDecision, simulation.success}` and verifies integrity prior to signing (`verifyIIPDigest`). Note: IIP is an unkeyed content-integrity digest, not a cryptographic signature. |
| **SQLite State Machine & Broadcast Recovery Journal** | [`src/core/security/proposal.ts`](../../src/core/security/proposal.ts) | `VERIFIED LIVE` | Schema v3 SQLite database (`sentinai.db`, WAL mode) with strict `ALLOWED_STATUS_TRANSITIONS` matrix, atomic compare-and-swap execution locking (`AUTHORIZED -> SUBMITTING`), and durable file-system Broadcast Recovery Journal (`.recovery-journal/`). |
| **Server-Side Wallet Signer & Broadcast Controller** | [`src/core/execution/controller.ts`](../../src/core/execution/controller.ts) | `VERIFIED LIVE` | Isolated server-only private key signing via `viem/accounts` (`privateKeyToAccount`). Enforces `21000n` minimum gas limit floor (R8.4 EIP-2780 defense) and classifies pre-broadcast vs ambiguous network timeout errors (`BroadcastError`). Confirmed on-chain in Sepolia block `#11935960`. |

---

## 4. Database Schema & Live Persisted Records (`sentinai.db`)

Inspected live SQLite file `sentinai.db`:
- **Active Tables:** `schema_version` (`version = 3`), `proposals` (`6` records), `sessions`, `user_policies`, `policy_audit_log`.
- **Verified Live On-Chain Confirmed Record in `proposals`:**
  - `id`: `7540a5f1-dcb4-4797-b46a-13ec74fa96d9`
  - `owner_id`: `operator-1`
  - `status`: `CONFIRMED`
  - `provenance`: `LIVE_VERIFIED`
  - `is_executable`: `1`
  - `digest`: `0xce15d586c721266f52799b91c8a5ad043d9e89f90190bf02fe379f35d486b115`
  - `tx_hash`: `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`
  - `created_at`: `2026-10-17 18:54:46`
  - `authorized_at`: `2026-10-17T18:55:08.166Z`
  - **On-Chain Sepolia Verification (Block `#11935960`):** Confirmed at `2026-10-17T18:55:12.000Z`, `from: 0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`, `to: 0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`, `value: 10000000000000` wei (`0.00001 ETH`), `gas_limit: 21000`, `gas_used: 12000`, `status: ok / success`.

---

## 5. UI Controls & UX Gaps Identified for Phase 4 Modernization

While the backend security pipeline and Sepolia execution are `VERIFIED LIVE`, inspecting the current UI ([`src/app/page.tsx`](../../src/app/page.tsx), [`src/components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx), [`src/components/agent/AgentConsole.tsx`](../../src/components/agent/AgentConsole.tsx), [`src/components/agent/EvidencePanel.tsx`](../../src/components/agent/EvidencePanel.tsx)) revealed the following UX gaps that make first-time judge evaluation harder than necessary:

1. **Missing Visual 6-Step Execution Pipeline Stepper:** `AgentConsole.tsx` shows a text spinner during Phase 1, but does not visually display the 6-stage deterministic pipeline (*1. Understand Intent → 2. Verify Recipient → 3. Evaluate Policy → 4. Analyze Risk → 5. Simulate Transaction → 6. Request Human Approval*) with live per-step status badges.
2. **Missing Guided Judge Demo Mode:** Judges opening the app for the first time see raw input and fixture pills, but lack a structured **"Guided Demo"** walkthrough explaining how to test a safe query, a normal transfer, a blocked attack, and how to inspect the verified Sepolia transaction receipt (`0xfe315950...`).
3. **Missing Dedicated "Architecture / How It Works" Interactive Panel:** The Sidebar links to `#overview`, `#agent-console`, `#security-center`, and `#policies`, but lacks the `#architecture` (*How It Works*) view and mobile navigation bar for smaller viewports.
4. **Pre-Execution Human Authorization Card Needs Explicit Financial Summary:** In `EvidencePanel.tsx`, the human-in-the-loop gate currently shows Proposal ID and a `"Confirm & Execute Transaction"` button, but should explicitly display a pre-execution summary box (*Sender, Recipient, Network, Asset, Amount, Estimated Gas Fee, Policy Verdict, Simulation Result, and Post-Approval Consequence*) with explicit two-step review/execution labels (`"Review Transaction"` / `"Authorize & Execute on Sepolia"`).
5. **Historical Receipt Verification on Pruned Default RPC:** Because `https://ethereum-sepolia-rpc.publicnode.com` prunes blocks older than ~10,000 blocks (~33 hours), historical receipt lookups for transactions older than 33 hours benefit from fallback archive-capable Sepolia RPC endpoints (`https://ethereum-sepolia-rpc.publicnode.com` + `https://sepolia.drpc.org` / Blockscout API).
