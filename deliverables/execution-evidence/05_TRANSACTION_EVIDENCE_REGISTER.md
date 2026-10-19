# Phase 3: Transaction Evidence Register

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control**Database Source:** `sentinai.db` (`proposals`, `user_policies`, and `policy_audit_log` tables) + On-Chain Sepolia Archive RPC (`https://sepolia.drpc.org`)**Machine-Readable Snapshot:** [`evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`](../../evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json)

---

## 1. Confirmed On-Chain Blockchain Transactions

| # | Proposal ID | Created / Confirmed (UTC) | Action & Asset | Amount | Recipient (`alias` → `address`) | Unkeyed IIP Digest (`keccak256`) | Sepolia Tx Hash | Block | Gas Limit / Used | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` | Created `2026-10-17 18:54:46` / Mined `2026-10-17T18:55:12Z` | `TRANSFER` (`ETH`) | `0.00001 ETH` (`10000000000000 wei`) | `alice` → `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` | `0xce15d586c721266f52799b91c8a5ad043d9e89f90190bf02fe379f35d486b115` | `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` | `#11935960` (`0xb620d8`) | `21,000` / `12,000` | **CONFIRMED** (`0x1`) |

---

## 2. Complete SQLite Proposal Audit Register (`sentinai.db`)

All 6 proposals persisted in `sentinai.db` (`owner_id = 'operator-1'`), matching [`evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`](../../evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json) verbatim:

| Proposal ID | Created At (UTC) | Provenance | Executable | Action & Asset | Amount | Resolved Target Address | Status | Tx Hash | Notes / Audit Outcome |
|---|---|---|---|---|---|---|---|---|---|
| `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` | `2026-10-17 18:54:46` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` (`ETH`) | `0.00001` | `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` | `CONFIRMED` | `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` | **Authorized at `18:55:08.166Z`, signed, broadcast, and confirmed in Sepolia Block `#11935960`** |
| `d9389711-7895-41f7-b08e-462298a7153d` | `2026-10-13 15:02:36` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` (`ETH`) | `0.01` | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `PREPARED` (Expired) | `null` | Historical R7.4 pre-CSF-02 proposal; expired without broadcast |
| `7aec540f-f394-4377-86bb-b613f5a70129` | `2026-10-13 15:02:13` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` (`ETH`) | `0.01` | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `FAILED` | `null` | Historical R7.4 pre-CSF-02 proposal; failed pre-broadcast |
| `0cebcb71-6d0e-47dd-b4f5-5875058b53d2` | `2026-10-13 15:00:35` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` (`ETH`) | `0.05` | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `PREPARED` (Expired) | `null` | Historical R7.4 proposal; expired without broadcast |
| `2bde6ee6-3944-4c1a-ba40-e8df68a5bbf0` | `2026-10-13 15:00:01` | `UNVERIFIED` | `0` (`false`) | `UNKNOWN` (`ETH`) | `0` | `0x0000000000000000000000000000000000000000` | `PREPARED` (`is_executable=0`) | `null` | Non-executable blocked `UNKNOWN` intent record |
| `98192423-09d6-4c41-9aa9-8b540e689e1c` | `2026-10-13 13:33:50` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` (`ETH`) | `0.05` | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `FAILED` | `null` | Historical R7.4 pre-broadcast failure |

---

## 3. SQLite Policy & Audit Table State (`user_policies` & `policy_audit_log`)

- **`user_policies` rows:** `0` (`[]`) — When no custom SQLite row overrides the default policy, `getActiveUserPolicy()` in [`src/core/policy/user-policy.ts`](../../src/core/policy/user-policy.ts) returns `DEFAULT_EXECUTABLE_USER_POLICY` (`maxTransferAmountETH: "1.0"`, `allowUnlimitedApproval: false`) and dynamically binds `alice` to `process.env.APPROVED_TEST_RECIPIENT_ADDRESS` (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`).
- **`policy_audit_log` rows:** `0` (`[]`) — Populated whenever an operator mutates policy settings via `updateActiveUserPolicy()`.

---

## 4. Reconciling On-Chain Balance & Nonce State

- **Initial Testnet Funding:** `0.050000000000000000 ETH` (`50,000,000,000,000,000 wei`)
- **Confirmed Transaction (`0xfe315950...`):**
  - Self-transfer from `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` to `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` of `0.00001 ETH` (`value` remains in sender's balance; only gas fee is deducted).
  - Gas fee deducted: `12,000 gas * 136 wei = 1,632,000 wei` (`0.000000000001632 ETH`).
  - Resulting on-chain balance: `50,000,000,000,000,000 - 1,632,000 = 49,999,999,998,368,000 wei` (`0.049999999998368 ETH`).
  - Resulting on-chain nonce: `1`.
