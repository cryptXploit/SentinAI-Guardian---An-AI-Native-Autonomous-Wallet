# Phase 3: Transaction Evidence Register

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Database Source:** `sentinai.db` (`proposals` & `policy_audit_logs` tables) + On-Chain Sepolia Archive RPC (`https://sepolia.drpc.org` & Blockscout API)

---

## 1. Confirmed On-Chain Blockchain Transactions

| # | Proposal ID | Timestamp (UTC) | Action & Asset | Amount | Recipient (`alias` → `address`) | IIP Digest (`keccak256`) | Sepolia Tx Hash | Block | Gas Limit / Used | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` | `2026-10-17T18:55:12Z` | `TRANSFER` (`ETH`) | `0.00001 ETH` (`10000000000000 wei`) | `alice` → `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` | `0xce15d586c721266f52799b91c8a5ad043d9e89f90190bf02fe379f35d486b115` | `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` | `#11935960` | `21,000` / `12,000` | **CONFIRMED** (`0x1`) |

---

## 2. Complete SQLite Proposal Audit Register (`sentinai.db`)

All 6 historical proposals recorded in `sentinai.db` by the operator wallet (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`):

| Proposal ID | Created At (UTC) | Provenance | Executable | Action | Asset | Amount | Recipient Alias | Status | Tx Hash | Notes / Audit Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| `de4957ac-1dd9-46ee-bb69-e455c42e9e02` | `2026-10-14T15:39:11.678Z` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` | `ETH` | `0.0001` | `alice` | `PREPARED` (Expired) | `null` | Prepared during R8.5 pre-flight verification; intentionally not broadcast |
| `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` | `2026-10-17T18:54:51.999Z` | `LIVE_VERIFIED` | `1` (`true`) | `TRANSFER` | `ETH` | `0.00001` | `alice` | `CONFIRMED` | `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` | **Authorized by human operator, signed, broadcast, and mined in Sepolia Block `#11935960`** |
| `04073580-3de8-49ba-ad9a-86962a840eb6` | `2026-10-17T18:56:15.324Z` | `SECURITY_FIXTURE` | `0` (`false`) | `APPROVE` | `USDC` | `1000000` | `unverified- phish-spender` | `BLOCKED` | `null` | Topic F Phishing Fixture (`excessive-finite-approval`); isolated from signer |
| `de68a5ae-a2f2-4a2b-8730-1a953cb63df2` | `2026-10-17T18:56:16.925Z` | `SECURITY_FIXTURE` | `0` (`false`) | `APPROVE` | `USDC` | `100` | `attacker-drainer` | `BLOCKED` | `null` | Topic F Drainer Fixture (`wrong-spender`); isolated from signer |
| `0cbacbf9-ab9b-4176-82ed-8f03923c04f1` | `2026-10-17T18:56:19.167Z` | `SECURITY_FIXTURE` | `0` (`false`) | `APPROVE` | `USDC` | `100` | `trusted-vault` | `BLOCKED` | `null` | Topic F Spoofed Contract Fixture (`wrong-token-contract`); isolated from signer |
| `76502fa5-5bb9-41ac-bfcf-f5f3c87b05f4` | `2026-10-17T18:56:20.431Z` | `SECURITY_FIXTURE` | `0` (`false`) | `TRANSFER` | `ETH` | `0.1` | `alice` | `BLOCKED` | `null` | Topic F Mainnet Confusion Fixture (`wrong-network`); isolated from signer |

---

## 3. SQLite Policy Audit Log Register (`policy_audit_logs`)

| Log ID | Updated At (UTC) | Changed Fields | Summary |
|---|---|---|---|
| `1` | `2026-10-14T15:39:11.097Z` | `["trustedRecipients"]` | Initialized default policy and bound `alice` to owner-controlled Sepolia test wallet `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` |
| `2` | `2026-10-17T18:57:04.265Z` | `["dailyLimitEth","perTxLimitEth","maxSlippageBps","allowedAssets","allowedChains","trustedRecipients","approvedSpenders","updatedAt"]` | Operator policy update via Policy Management UI |

---

## 4. Reconciling Historical Balance & Nonce State

- **Initial Testnet Funding:** `0.050010000000000000 ETH` (before self-transfer fee) / `0.050000000000000000 ETH`
- **Confirmed Transaction (`0xfe315950...`):**
  - Self-transfer from `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` to `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` of `0.00001 ETH` (`value` remains in wallet; only gas fee is deducted).
  - Gas fee deducted: `12,000 gas * 136 wei = 1,632,000 wei` (`0.000000000001632 ETH`).
  - Resulting on-chain balance: `50,000,000,000,000,000 - 1,632,000 = 49,999,999,998,368,000 wei` (`0.049999999998368 ETH`).
  - Resulting on-chain nonce: `1`.
- **Mathematical Proof:** The live on-chain balance (`49,999,999,998,368,000 wei`) and account nonce (`1`) match the exact gas fee (`1,632,000 wei`) of Transaction `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` to the single wei.
