# Phase 8: Presenter Notes & Judge Q&A Defense Guide

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

---

## 1. Slide-by-Slide Speaker Script (5-Minute Pitch)

- **Slide 1–2 (0:00–0:45) — Hook & Problem:**
  > "Judges, autonomous AI agents are rapidly becoming financial actors on-chain. Yet giving an LLM direct access to a wallet's private key is a security disaster waiting to happen: LLMs are probabilistic, susceptible to prompt injection, and prone to misinterpreting negations, whereas blockchain transactions are deterministic and irreversible. SentinAI Guardian bridges this divide."
- **Slide 3–4 (0:45–1:45) — Architecture & Privilege Separation:**
  > "Our core architectural principle is Strict Privilege Separation. In SentinAI Guardian, Gemini 3.8 Flash and Groq GPT-OSS-120B live in an untrusted advisory zone. They translate English, Bengali, or Banglish commands into a strict candidate schema—and nothing more. Every candidate must traverse six deterministic server-side gates before a human operator can authorize signing."
- **Slide 5–7 (1:45–3:00) — Deep Technical Innovation (Policy, Calldata, IIP & Gate 6.5):**
  > "Let's look at what happens under the hood. First, our dual-layer negation and injection filter stops attacks like `'Do not send 0.1 ETH'` or `'Ignore all policies'` before transaction construction. Second, our policy engine uses exact string-to-BigInt integer math—zero floating-point rounding—to enforce per-transaction ETH spend caps (`maxTransferAmountETH = 1.0 ETH`) and per-token ERC-20 approval policies. Third, we decode raw EVM calldata to catch unlimited ERC-20 approvals and spoofed token contracts, simulate the call on Ethereum Sepolia, and lock the result into an unkeyed Keccak-256 Intent Integrity Proof digest. At execution time, Gate 6.5 revalidates the live SQLite policy, acquires an atomic Compare-And-Swap lock, writes a crash-recovery journal, and enforces the 21,000 intrinsic gas floor."
- **Slide 8–9 (3:00–4:00) — Live Proof & Command Center UX:**
  > "This isn't a mockup. Proposal `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` (`0.00001 ETH` self-transfer to `alice`) was parsed, verified, authorized, and confirmed on Ethereum Sepolia in Block `#11935960` under transaction hash `0xfe315950...88da`. And inside our Executive Command Center, judges can evaluate all 7 live and threat-isolated scenarios in 60 seconds."
- **Slide 10–12 (4:00–5:00) — Security Boundaries, Commercial Value & Roadmap:**
  > "We are equally transparent about our current security boundaries: `AGENT_PRIVATE_KEY` is isolated server-side for Sepolia, IIP is an unkeyed integrity digest backed by SQLite, and cumulative 24-hour multi-transaction velocity tracking is scheduled for Phase 2 alongside ERC-4337 smart account session keys. Commercially, SentinAI Guardian serves multilingual retail onboarding, policy-governed treasury co-pilots, and a B2B risk-firewall SDK. Thank you—we welcome your questions."

*(Note for 10-Minute Finals Format: If the Shenzhen on-site finals allocate a 10-minute presentation slot, spend `0:00–5:00` on the 12 slides above, `5:00–8:00` demonstrating the live application and confirmed Sepolia transaction `0xfe315950...88da`, and `8:00–10:00` walking through the 4 defense-in-depth Q&A proofs below.)*

---

## 2. Tough Judge Q&A Defense Guide

### Q1: "What happens if an attacker uses a novel jailbreak prompt that tricks both Gemini and Groq into outputting a 1,000 ETH transfer to an attacker address?"
- **Defense:** "Even if the LLM is 100% compromised and outputs `TRANSFER 1000 ETH to 0xAttacker`, it still cannot move funds. Why? Because `resolveRecipientFromPolicy` rejects any address or alias not already in the operator's SQLite `trustedContacts` registry (failing closed at Gate 3), and `evaluatePolicy` blocks any amount exceeding `maxTransferAmountETH` (`1.0 ETH` default) using deterministic `BigInt` comparisons. The LLM has no ability to alter SQLite policy."

### Q2: "Why did `eth_estimateGas` return `12,000` gas on Sepolia during simulation when Ethereum's minimum transaction gas is `21,000`?"
- **Defense:** "We investigated this exact anomaly during Milestone R8.4. Under EIP-2780 / Sepolia RPC estimation rules, a self-transfer (`from === to`) estimates at `12,000` intrinsic gas for warm account access. However, broadcasting a top-level transaction with `gasLimit < 21000` fails at the mempool level. Therefore, `simulator.ts` faithfully records the raw RPC simulation estimate (`12000`), while `controller.ts` enforces `MIN_STANDARD_TX_GAS_LIMIT = 21000n` at broadcast. Our confirmed Sepolia transaction (`0xfe315950...88da`, `0.00001 ETH`) proves this on-chain: `gasLimit = 21,000`, `gasUsed = 12,000`, `status = 0x1`."

### Q3: "What happens if the user changes their security policy *after* a transaction proposal is prepared, but *before* someone clicks 'Confirm & Execute'?"
- **Defense:** "That is a classic Time-of-Check to Time-of-Use (TOCTOU) vulnerability, and we specifically engineered **Gate 6.5** inside `authorizeAndExecute` (`orchestrator.ts`) to prevent it. Immediately before acquiring the execution lock, the server reloads the active policy from SQLite (`getActiveUserPolicy`) and re-runs `evaluatePolicy` and `analyzeTransaction` against the live policy parameters. If `maxTransferAmountETH` was tightened or the recipient was removed from `trustedContacts` in the meantime, the proposal transitions immediately to `BLOCKED` and refuses to sign."

### Q4: "What if the RPC connection drops right after `sendRawTransaction` is called? Couldn't clicking retry cause a double-spend?"
- **Defense:** "No. Before calling `sendTransaction`, we transition the proposal to `SUBMITTING` via an atomic SQLite Compare-And-Swap (`CAS`) query and write a durable `.recovery-journal.json` file. If the RPC times out mid-broadcast, the proposal is locked in `EXECUTION_UNKNOWN`—never returned to `PREPARED`—so retries cannot re-sign. Instead, `findMatchingBroadcastTxOnChain` scans recent Sepolia blocks for a matching `(from, to, value, data)` transaction to reconcile the receipt safely."
