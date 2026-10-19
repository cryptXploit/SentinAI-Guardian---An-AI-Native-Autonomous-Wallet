# SENTINAI GUARDIAN — R8.5 DIAGNOSTIC RECOVERY & PRE-FLIGHT E2E VERIFICATION REPORT

**Date:** 2026-10-17  
**Network:** Ethereum Sepolia Testnet (`chainId = 11155111`)  
**Configured Test Wallet (Sender & Self-Transfer Recipient `alice`):** `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`  
**Transactions Signed or Broadcast by Agent:** **0 (Strictly Zero)**

---

## Task 1 — Root Cause Investigation of Previous Empty Log & Abort

We investigated all four questions regarding why the earlier inline/scratch diagnostic commands failed or produced an empty log:

1. **Why did `task-5029` (`npx tsx -e "..."`) produce an empty log and hang?**
   - `tsx` (invoked from the npm `npx` cache because `tsx` is not a local dependency in `package.json`) does **not** support the `-e` inline evaluation flag the way `node -e` does. When passed `-e "..."`, `tsx` ignored the inline script and entered an interactive Node REPL waiting indefinitely on `stdin`, producing `0` bytes of `stdout`/`stderr` until canceled.
2. **Why did `task-5013` (`verify_r8_5.ts` in `scratch/`) fail with `Cannot find module 'viem'`?**
   - The file was placed in `<local-env-path>`, which is outside the project workspace `.`. Node's module resolution walks parent directories of the script file and therefore could not find `node_modules\viem`.
3. **Why did `task-5017` fail with `validateParsedIntentAgainstCommand is not a function` and `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`?**
   - `src/core/ai/provider.ts` exports `ParsedIntentSchema` and `isTransactionNegationOrCancellation` (not `validateParsedIntentAgainstCommand`), and calling `process.exit(1)` synchronously inside `.catch()` on Windows Node.js `v24.13.0` while HTTP/SQLite handles are still open triggers a libuv `UV_HANDLE_CLOSING` assertion instead of draining cleanly via `process.exitCode = 1`.
4. **Why did `task-5041` (`probeGroqHttpRaw`) abort after `10,000ms` (`This operation was aborted`)?**
   - **Confirmed Real Runtime Defect Fixed in [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts):** On Windows Node.js `v24.13.0`, Node's built-in `fetch` (`undici`) defaults to `verbatim` DNS ordering, attempting IPv6 connections to Cloudflare-fronted `api.groq.com` first. On networks where IPv6 routing stalls, the connection hangs past `GroqIntentProvider`'s `10,000ms` `AbortController` timeout.
   - **Fix Applied:** Added `dns.setDefaultResultOrder('ipv4first')` in [`src/core/ai/provider.ts`](../../src/core/ai/provider.ts) and [`scripts/verify-r8-5-preflight.ts`](../../scripts/verify-r8-5-preflight.ts). With IPv4-first DNS resolution enabled, `api.groq.com` responded with **HTTP 200 in `1,076ms–2,212ms`**.

---

## Task 2, 3 & 4 — Live Diagnostic & Pre-Flight Verification Evidence

Executed via [`scripts/verify-r8-5-preflight.ts`](../../scripts/verify-r8-5-preflight.ts) (`npx tsx scripts/verify-r8-5-preflight.ts`, exit code `0`, total duration `16,779ms`):

| Check | Actual Result | PASS/FAIL | Evidence |
|---|---|---|---|
| **Environment Configuration** | All 7 required keys loaded (`true`) | ✅ **PASS** | `GEMINI_API_KEY=true`, `GROQ_API_KEY=true`, `RPC_URL=true`, `AGENT_PRIVATE_KEY=true` (values never printed) |
| **Groq HTTP Status** | **HTTP `200 OK`** (`2,212ms` raw probe / `1,076ms` provider) | ✅ **PASS** | `POST https://api.groq.com/openai/v1/chat/completions` returned `200` with `dns.setDefaultResultOrder('ipv4first')` |
| **Actual AI Provider & Model** | **Groq:** `openai/gpt-oss-120b` (`LIVE_AI`)<br>**Primary Tiered:** `gemini` / `gemini-3.8-flash` (`LIVE_AI`, `6,356ms`) | ✅ **PASS** | `GroqIntentProvider` (`1,076ms`) and `parseIntentWithProvenance` (`6,356ms`) both verified live |
| **Raw Structured AI Response** | `{"action":"TRANSFER","asset":"ETH","amount":"0.0001","recipientAlias":"alice"}` | ✅ **PASS** | Exact JSON payload returned by `openai/gpt-oss-120b` and `gemini-3.8-flash` |
| **Parsed Intent Fields** | `action=TRANSFER`, `asset=ETH`, `amount=0.0001`, `recipientAlias=alice` | ✅ **PASS** | Matches human command `"Send 0.0001 ETH to alice"` 100% |
| **Deterministic Validation** | `schemaValid=true`, `notNegated=true`, `exactMatch=true` | ✅ **PASS** | `ParsedIntentSchema.safeParse` + `isTransactionNegationOrCancellation` |
| **Sepolia Chain ID** | `11155111` (Latest Block: `11934396`) | ✅ **PASS** | Verified via live `publicClient.getChainId()` and `EXPECTED_CHAIN_ID === 11155111` |
| **Sender Matches Private Key** | `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` | ✅ **PASS** | `privateKeyToAccount(AGENT_PRIVATE_KEY).address === AGENT_WALLET_ADDRESS` |
| **Recipient `alice` Resolution** | `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` (`RESOLVED`) | ✅ **PASS** | Resolves to the exact owner-controlled self-transfer wallet |
| **Unknown Recipient Handling** | `status="UNKNOWN"` (Fails Closed) | ✅ **PASS** | `resolveRecipientFromPolicy('mallory_unknown')` blocked |
| **Transaction Candidate** | `to=0xaeb8...2148`, `value=100000000000000` wei (`0.0001 ETH`), `data=0x`, `chainId=11155111` | ✅ **PASS** | Built via `buildTransaction` |
| **Policy Decision** | `ALLOW` (`Policy requirements met`) | ✅ **PASS** | `0.0001 ETH <= 1.0 ETH` cap and `alice` is whitelisted |
| **Live Sepolia Simulation** | `success=true`, `gasEstimated=12000` (EIP-2780 self-transfer), `broadcastGasFloor=21000` | ✅ **PASS** | `simulateTransaction` on Sepolia `reth/v2.7.0` (`gasPrice = 26 wei`) |
| **Sufficient Gas Balance** | `50000000000000000` wei (`0.05 ETH`) > `100000000546000` wei (`0.000100000000546 ETH`) | ✅ **PASS** | Wallet holds `500x` the required transfer + gas amount |
| **Sender & Recipient Code** | `senderCode=0x` (EOA), `recipientCode=0x` (EOA) | ✅ **PASS** | Verified via `publicClient.getCode` |
| **IIP Digest Verification** | `PASS` (`0x21113aab7128a9f854b6ee89459c3c9d78a6d984137f76acab00aefc90a52735`) | ✅ **PASS** | `verifyIIPDigest(iip) === true`, `finalDecision === 'ALLOW_FOR_AUTHORIZATION'` |
| **Tampered IIP Rejection** | `REJECTED` (`verifyIIPDigest(tamperedIip) === false`) | ✅ **PASS** | `+1 wei` mutation immediately invalidates Keccak-256 digest |
| **Transaction Analyzer** | `canExecute=true`, `mismatches=[]` | ✅ **PASS** | `analyzeTransaction` confirms zero semantic mismatches |

---

## Status Classification Across R8.5 Phases

- **Phase 1 — Pre-Flight Security:** ✅ **VERIFIED LIVE**
- **Phase 2 — Real AI Verification (`Groq` & `Gemini`):** ✅ **VERIFIED LIVE**
- **Phase 3 — Read-Only Blockchain Verification (Sepolia `11155111`):** ✅ **VERIFIED LIVE**
- **Phase 4 — Human Browser Test Instructions & Server Action Readiness:** 🟡 **PARTIALLY VERIFIED** (Backend Server Actions verified; GUI browser interaction requires human execution)
- **Phase 5 — One Human-Controlled Transaction:** ⚪ **NOT TESTED** (Awaiting human operator click; AI agent strictly prohibited from clicking Authorize & Sign)
- **Phase 6 — On-Chain Receipt Verification:** ⚪ **NOT TESTED** (Pending human execution in Phase 5; current wallet nonce on Sepolia is `0`)
- **Phase 7 — Post-Confirmation Refresh & Duplicate Protection:** 🟡 **PARTIALLY VERIFIED** (Verified in automated test suite `r8-4-execution-integrity.test.ts`; live post-tx check pending Phase 5)

---

## Final Verdict

**2. READY FOR HUMAN-CONTROLLED TESTNET EXECUTION**  
**READY FOR MANUAL SELF-TRANSFER: YES**
