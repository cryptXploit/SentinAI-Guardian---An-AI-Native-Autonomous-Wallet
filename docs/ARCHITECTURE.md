# Architecture Overview: SentinAI Guardian

SentinAI Guardian is an AI-Native Autonomous Wallet designed for the 2026 Shenzhen International FinTech Competition (Topic F - Agent Wallet). It provides a secure, deterministic framework bridging Large Language Models (LLMs) with EVM-compatible blockchains.

## System Architecture

The application is built on **Next.js 16 (App Router)** utilizing a strict Server-Side modular pipeline. This guarantees that private keys and AI API credentials never leak to the browser.

### The 6-Stage Execution Pipeline

When a user submits a natural language command via the Agent Console (Client Component), it is routed through the `processAgentCommand` Server Action, triggering a secure pipeline:

1. **Intent Parsing (M2):** The command is passed to Gemini 1.5 Flash. The model is strictly configured (`responseMimeType: application/json`, `temperature: 0`) to deterministically parse the intent into a rigid Zod schema (`ParsedIntent`).
2. **Policy Engine (M3):** A mathematically pure, synchronous policy engine evaluates the `ParsedIntent` against the user's whitelist and spending limits. This completely segregates AI logic from Risk Control.
3. **Transaction Builder (M4):** If the policy passes, the system converts the high-level intent into an EVM canonical payload (`TransactionCandidate`) targeting the Sepolia Testnet (`chainId: 11155111`). It uses strict BigInt conversion to prevent precision bugs.
4. **Simulation Engine (M5):** The system connects to a public RPC node and dry-runs the payload using `estimateGas`. This ensures the transaction is mathematically valid and will not revert, protecting users from honeypots.
5. **Intent Integrity Proof (IIP) (M6):** The outputs of parsing, policy, building, and simulation are cryptographically bound into a single, tamper-evident object. The IIP acts as the ultimate deterministic gatekeeper.
6. **Execution Controller (M7):** This is the *only* module permitted to access the agent's private key. It verifies the IIP's `finalDecision`. If authorized, it signs and broadcasts the payload using `viem`.

## Competition Requirements Met
- **Asset Management:** Users can safely monitor balances and execute Native ETH transfers securely.
- **Transaction Execution:** Viem is used natively for payload generation, offline signing, and broadcast monitoring (`waitForTransactionReceipt`).
- **Risk Control:** The deterministic policy engine prevents AI prompt injections from accessing unauthorized funds or unlisted addresses.
