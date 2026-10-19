# Security Self-Assessment Report

**Project:** SentinAI Guardian**Topic:** F — Autonomous Agent Wallet**Competition:** 2026 Shenzhen International FinTech Competition**Milestone:** R8.5 — Final Competition Release (See [`docs/security/08_SECURITY_SELF_ASSESSMENT.md`](./security/08_SECURITY_SELF_ASSESSMENT.md)–[`10_THREAT_MODEL.md`](./security/10_THREAT_MODEL.md) for comprehensive security & threat model documentation)
This document provides a realistic, technically rigorous security self-assessment for SentinAI Guardian, detailing supported security controls, threat models, verified mitigations, and residual risk boundaries.

---

## 1. Threat Model & Verified Mitigations

### 1.1 Approval Phishing & Excessive Allowance Requests
- **Threat Vector:** A malicious decentralized application or compromised agent attempts to request an excessive or unlimited token allowance (e.g. 1,000,000 USDC or MaxUint256) when the user only intended to trade 50 USDC.
- **Mitigation:**
  - *Calldata Decoding:* `transaction-analyzer.ts` independently parses the candidate calldata using Viem's `decodeFunctionData`.
  - *Approval Amount Verification:* Compares the decoded allowance against the user's authorized intent amount. Any discrepancy triggers `APPROVAL_AMOUNT_MISMATCH` and blocks execution.
  - *Unlimited Allowance Policy Gate:* Unlimited allowance requests ($2^{255}$ or MaxUint256) are checked against `policy.allowUnlimitedApproval`. If disabled, execution is blocked with `UNLIMITED_APPROVAL_REQUEST`.
  - *Exposure Analysis:* `approval-analyzer.ts` calculates allowance deltas and explains the financial scope of the permission before human authorization.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA6, TA7), `approval-analyzer.test.ts` (AA2, AA3).

### 1.2 Spender Substitution & Phishing Drainers
- **Threat Vector:** Calldata substitutes the intended spender (e.g. Uniswap Router) with an unverified attacker contract address.
- **Mitigation:**
  - *Spender Address Match:* Decoded spender address from calldata is strictly matched against the authorized contact's address.
  - *Spender Mismatch Detection:* Any deviation triggers `SPENDER_MISMATCH` and permanently blocks proposal execution.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA8).

### 1.3 Token Contract Spoofing
- **Threat Vector:** An attacker tricks the agent into interacting with a malicious token contract instead of the official verified testnet token.
- **Mitigation:**
  - *Verified Token Registry:* Transactions are verified against `SUPPORTED_TOKENS` (official Sepolia contracts for USDC, USDT, DAI).
  - *Contract Address Match:* If the destination contract address differs from the verified token address, execution is blocked with `TOKEN_CONTRACT_MISMATCH`.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA4).

### 1.4 Method Transmutation (Transfer vs Approval Confusion)
- **Threat Vector:** A user asks to "send" tokens, but the transaction builder or an attacker crafts `approve` calldata instead, paving the way for a delayed drain.
- **Mitigation:**
  - *Method Selector Integrity:* Verifies that `intent.action === 'TRANSFER'` corresponds to `transfer(address,uint256)` or native transfer, and `intent.action === 'APPROVE'` corresponds to `approve(address,uint256)`.
  - *Mismatch Detection:* Any transmutation triggers `TRANSACTION_METHOD_MISMATCH` and blocks execution.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA9).

### 1.5 Unexpected Native Value Bundling
- **Threat Vector:** An attacker attaches a native ETH transfer (`candidate.value > 0`) to an ERC-20 contract call to secretly drain ETH while user focuses on token approval.
- **Mitigation:**
  - *Native Value Guard:* ERC-20 operations (`transfer` / `approve`) strictly assert `candidate.value === 0n`. Any attached ETH triggers `UNEXPECTED_NATIVE_VALUE` and blocks execution.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA10).

### 1.6 AI Prompt Injection & Jailbreaking
- **Threat Vector:** Adversarial user input attempts to override system prompts or coerce the LLM into generating malicious instructions.
- **Mitigation:**
  - *Input Sanitization:* Input truncated at 500 characters; prompt injection delimiters (`SYSTEM:`, `USER:`, `<script>`) stripped.
  - *Decoupled Decision Architecture:* The AI is strictly an intent parser and educational explainer. The deterministic policy engine and transaction analyzer make all security decisions.
  - *Invariant Immutability:* Explanations cannot modify the `canExecute` boolean or analysis status.
  - *Verification Suite:* `prompt-injection.test.ts` (PI1-PI4), `security-explainer.test.ts` (SE2).

### 1.7 Cross-Network Execution & Chain Confusion
- **Threat Vector:** Misconfiguration or malicious calldata targets Ethereum Mainnet, putting real user capital at risk.
- **Mitigation:**
  - *Fail-Closed Chain Guard:* All candidates must have `chainId === 11155111`. If not, `WRONG_CHAIN` blocks execution immediately.
  - *RPC Connection Verification:* `rpc-service.ts` asserts `actualChainId === 11155111` upon connection.
  - *Verification Suite:* `transaction-analyzer.test.ts` (TA11), `rpc-service.test.ts`.

### 1.8 Replay, Race Conditions & Concurrency
- **Threat Vector:** Duplicate execution submissions or replaying previously executed proposals.
- **Mitigation:**
  - *Durable SQLite State Machine:* Transitions (`PREPARED` → `AUTHORIZED` → `SUBMITTING` → `SUBMITTED` → `CONFIRMED`) are enforced atomically in SQLite with an explicit transition matrix.
  - *Millisecond Expiration Boundaries:* Expired proposals cannot be authorized or executed.
  - *Verification Suite:* `sqlite-security.test.ts` (S1-S7), `time-handling.test.ts`.

---

## 2. Security Invariants & Verification Matrix

| Security Invariant | Enforcement Layer | Verification Suite | Status |
|:---|:---|:---|:---:|
| **Zero Private Key in Queries** | `orchestrator.ts` read-only routing | `orchestrator.test.ts` (Cat H) | **PASS** |
| **Independent Calldata Decoding** | `transaction-analyzer.ts` Viem ABI | `transaction-analyzer.test.ts` | **PASS** |
| **Approval Amount Mismatch Guard** | `transaction-analyzer.ts` | `transaction-analyzer.test.ts` (TA6) | **PASS** |
| **Spender Mismatch Guard** | `transaction-analyzer.ts` | `transaction-analyzer.test.ts` (TA8) | **PASS** |
| **Token Contract Mismatch Guard** | `transaction-analyzer.ts` | `transaction-analyzer.test.ts` (TA4) | **PASS** |
| **Method Transmutation Guard** | `transaction-analyzer.ts` | `transaction-analyzer.test.ts` (TA9) | **PASS** |
| **Unexpected Native Value Guard** | `transaction-analyzer.ts` | `transaction-analyzer.test.ts` (TA10) | **PASS** |
| **Chain Isolation (Sepolia Only)** | `transaction-analyzer.ts`, `rpc-service.ts` | `transaction-analyzer.test.ts` (TA11) | **PASS** |
| **AI Invariant Immutability** | `security-explainer.ts` | `security-explainer.test.ts` (SE2) | **PASS** |
| **Durable State Transition Matrix** | `proposal.ts` SQLite engine | `sqlite-security.test.ts` | **PASS** |
| **BigInt Financial Precision** | `financial.ts`, `wallet-service.ts` | `financial.test.ts`, `builder.test.ts` | **PASS** |
| **Controlled Scenario Verification** | `fixtures/security/` (15 scenarios) | `fixtures.test.ts` (16 tests) | **PASS** |

---

## 3. Residual Risks & Technical Limitations

1. **Simulation Scope (Time-of-Check to Time-of-Use):** EVM simulation using `estimateGas` and `eth_call` dry-runs transactions against the current block state. It does not protect against state changes, oracle manipulations, or MEV front-running that occurs between simulation and mining.
2. **Supported Method & Token Scope:** Only Native ETH Transfers, ERC-20 `transfer`, and ERC-20 `approve` for `USDC`, `USDT`, and `DAI` are classified. Complex multi-calls and unlisted contract methods fail closed (`UNSUPPORTED_CALLDATA`).
3. **Server-Side Private Key Boundary:** Private keys reside in server `.env` memory (`SIGNER_PRIVATE_KEY`) rather than HSM/MPC or EIP-4337 smart account signers. Compromising the host server OS exposes the testnet hot wallet key.
4. **Intent Integrity Proof (IIP) Boundary:** `computeIIPDigest` computes an unkeyed `keccak256(encodePacked(...))` integrity digest over transaction fields to detect inadvertent mutation; an attacker with direct write access to `sentinai.db` could modify both the payload and the stored digest simultaneously.
5. **Per-Transaction Policy Scope & Single-Operator Prototype:** `evaluatePolicy` enforces per-transaction ETH limits (`maxTransferAmountETH = "1.0"`), trusted contacts, and per-token approval boundaries, not cumulative 24-hour rolling velocity limits. Authentication uses a single-operator password + HMAC-SHA256 session cookie (`sentinai_session`) rather than multi-user WebAuthn/Passkeys.
6. **Public RPC Pruning & Reliability:** Public testnet RPCs may prune historical receipts after ~10,000 blocks or experience rate limits. Multi-RPC fallback and archive RPC endpoints are recommended for long-term receipt lookups.
