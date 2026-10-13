# SentinAI Guardian 🛡️

**An Intent-Aware Autonomous Wallet** built for the 2026 Shenzhen International FinTech Competition (International Track — Topic F: Autonomous Agent Wallet).

SentinAI Guardian bridges Large Language Models with EVM blockchains securely. Its core technical differentiator is **Intent-to-Transaction Semantic Verification**: the deterministic engine independently compares what the user intended against what the compiled EVM calldata actually executes, blocking approval-phishing, contract spoofing, parameter tampering, and unauthorized network interactions before any transaction reaches the signing key.

---

## Architectural Differentiators (Milestone R7)

- **Intent-to-Transaction Semantic Verification:** Independently decodes EVM calldata (`candidate.data`) using Viem ABI parsers and checks 10 distinct security vectors (recipient mismatch, token contract mismatch, transfer amount mismatch, approval amount mismatch, unlimited approval requests, spender mismatch, transaction method mismatch, unexpected native value, unauthorized network, and unsupported calldata).
- **Approval Exposure Intelligence:** Analyzes ERC-20 allowances against configured spending limits and previous permissions, distinguishing between a spending permission and an actual token transfer.
- **Modern Google Gemini Integration:** Powered by the official `@google/genai` SDK (`gemini-2.5-flash` or `gemini-1.5-flash`), featuring true `AbortController` cancellation, a 15-second ceiling, input sanitization, and structured JSON schema enforcement.
- **Grounded Security Explanations:** Gemini provides plain-language educational explanations strictly grounded in deterministic findings. Crucially, the AI has **zero authority** to approve, unblock, or override security policy.
- **Two-Phase Human-in-the-Loop Authorization:** All state-changing transactions require explicit operator confirmation over a tamper-evident Keccak-256 Intent Integrity Proof (IIP) digest before signing.
- **Controlled Threat Scenario Fixtures:** Includes 15 deterministic security fixtures in `fixtures/security/` allowing judges and developers to test threat detections (phishing approvals, drainer spenders, token spoofing) with instant visual evidence.
- **Durable SQLite State Machine:** Backed by SQLite (`better-sqlite3`) with non-destructive migrations, an unbypassable state transition matrix, millisecond expiration precision, and safe WAL checkpoint backups.
- **Live Sepolia Wallet Intelligence:** Real-time on-chain tracking for native ETH and verified testnet tokens (USDC, USDT, DAI) with BigInt base unit precision and isolated 10s caching.

---

## Supported Methods & Scope Limitations

- **Target Blockchain:** Ethereum Sepolia Testnet Only (`chainId: 11155111`). All other networks fail closed with `WRONG_CHAIN`.
- **Supported State-Changing Methods:**
  - Native ETH Transfers (`transfer` / zero-calldata transactions)
  - ERC-20 `transfer(address to, uint256 amount)`
  - ERC-20 `approve(address spender, uint256 amount)`
- **Unsupported Methods:** Arbitrary smart contract interactions, multi-calls, and unknown method selectors fail closed (`UNSUPPORTED_CALLDATA`).
- **Simulation Disclaimer:** EVM simulation is conducted via RPC `estimateGas`. Simulation verifies execution state at the current block; it does not protect against future front-running or time-delayed contract state changes.

---

## Getting Started

### Prerequisites
- Node.js 18.17+ (Node 20, 22, or 24 supported; verified on Node v24.13.0 on Windows)
- npm or pnpm
- Ethereum Sepolia RPC URL (e.g. publicnode, Alchemy, Infura)
- Sepolia Testnet Wallet Private Key (for state-changing transactions; read-only operations require only a public address)
- Google Gemini API Key (optional; automatically uses deterministic mock provider if omitted)

### 1. Installation
```bash
git clone https://github.com/cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet.git
cd SentinAI-Guardian---An-AI-Native-Autonomous-Wallet
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```bash
# Operator Authentication (Session Cookie Protection)
OPERATOR_PASSWORD="your-secure-operator-password"
SESSION_SECRET="your-32-byte-hex-session-secret"

# Blockchain Configuration (Sepolia Testnet ONLY - Chain ID: 11155111)
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
AGENT_PRIVATE_KEY="0x..." # Sepolia testnet private key only! Never use mainnet.

# Optional: Public address for read-only mode without private key custody
AGENT_WALLET_ADDRESS="0x..."

# AI Configuration (Optional: defaults to 'mock' if GEMINI_API_KEY is not set)
AI_PROVIDER="gemini" # or "mock"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
```

> **SECURITY NOTICE:** Never use a private key associated with real funds on Ethereum mainnet. This system strictly targets Ethereum Sepolia Testnet (`chainId: 11155111`).

### 3. Running the Application
```bash
# Development Server
npm run dev

# Production Build & Start
npm run build
npm start
```
Access the application at [http://localhost:3000](http://localhost:3000).

---

## Evaluator & Judging Demonstration Guide (Windows PowerShell)

For competition judges and evaluators running on Windows PowerShell:

### Step 1: Run Full Automated Verification
```powershell
# Run all 177 unit, integration, and security invariant tests
npm test

# Verify TypeScript type correctness
npx tsc --noEmit

# Verify ESLint code standards
npm run lint

# Verify Next.js 16 Turbopack production build
npm run build
```

### Step 2: Test Gemini AI Provider (Safe Smoke Test)
```powershell
npx tsx scripts/smoke-test-gemini.ts
```
*(If no API key is set, cleanly reports `LIVE_AI_NOT_VERIFIED` without crashing or falsely claiming live AI connectivity).*

### Step 3: Interactive Demo Workflows
Start the development server:
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:

1. **Login:** Enter the configured `OPERATOR_PASSWORD` to establish an authenticated session.
2. **Read-Only Balance Query:** Type `"Show my Sepolia wallet balance"` in the command center. Observe that read queries route directly to on-chain RPC services without creating proposals or touching private keys.
3. **Controlled Threat Scenario (Approval Phishing):** Click the **"Phishing: 1M USDC Approval"** button in the Command Center. Observe:
   - Status: `BLOCKED`
   - Comparison Table: Highlights authorized amount `50 USDC` vs actual calldata `1,000,000 USDC`.
   - Security Finding: `APPROVAL_AMOUNT_MISMATCH (Excessive Allowance)`.
   - Approval Exposure Card: Flags `HIGH EXPOSURE` exceeding spending ceiling.
   - Execution Button: Disabled with non-executable proposal status.
4. **Controlled Threat Scenario (Attacker Spender):** Click **"Drainer: Attacker Spender"**. Observe `SPENDER_MISMATCH` detection.
5. **Controlled Threat Scenario (Token Spoofing):** Click **"Spoof: Contract Mismatch"**. Observe `TOKEN_CONTRACT_MISMATCH` detection.
6. **Controlled Threat Scenario (Wrong Network):** Click **"Network: Mainnet Confusion"**. Observe `WRONG_CHAIN` detection blocking execution.
7. **Safe Bounded Approval:** Click **"Safe: 50 USDC Approval"**. Observe:
   - Status: `POLICY_COMPLIANT`
   - Comparison Table: All rows green, 0 mismatches.
   - Human-in-the-Loop Gate: Renders the "Confirm & Execute Transaction" button with server proposal ID.

---

## Technical Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Self-Assessment Report](docs/SECURITY_ASSESSMENT.md)
- [Milestone R7 Implementation Report](docs/reports/R7_INTENT_SECURITY_ANALYZER_REPORT.md)
- [Milestone R6 Live Integration Report](docs/reports/R6_LIVE_INTEGRATION_REPORT.md)
- [Milestone R5E Operational Integrity Report](docs/reports/R5E_OPERATIONAL_INTEGRITY_REPORT.md)

---

## License
MIT
