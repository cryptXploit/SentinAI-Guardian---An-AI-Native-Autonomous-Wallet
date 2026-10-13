# SentinAI Guardian 🛡️

**An AI-Native Autonomous Wallet** built for the 2026 Shenzhen International FinTech Competition (International Track — Topic F: Autonomous Agent Wallet).

SentinAI Guardian bridges Large Language Models with EVM blockchains securely. It empowers autonomous agents and human operators to execute on-chain financial operations using natural language while enforcing absolute, deterministic security guarantees through strict mathematical policy engines, EVM calldata inspection, transaction state machines, and cryptographic Intent Integrity Proofs (IIP).

---

## Architecture Highlights

- **Pluggable AI Intent Engine:** Clean provider abstraction supporting live Google Gemini (`gemini-1.5-flash` with prompt-injection defense, 15s timeout ceiling, and 500-char input limit) and deterministic regex/keyword fallback (`mock`).
- **Two-Phase Human-in-the-Loop Execution:** All state-changing transactions require explicit operator authorization over a tamper-evident Keccak-256 digest before broadcast.
- **Read-Only vs State-Changing Query Routing:** Natural-language read queries (`QUERY_BALANCE`, `QUERY_NETWORK`) route directly to live Sepolia RPCs and *never* access private keys, signers, or create proposals.
- **Live Sepolia Wallet Intelligence:** Real-time on-chain tracking for native Sepolia ETH and verified ERC-20 testnet assets (USDC, USDT, DAI) using pure BigInt precision and a 10s rate-limit cache.
- **Fail-Closed RPC & Chain Safety:** Asserts Sepolia Chain ID (`11155111`) with zero silent fallback to Ethereum mainnet.
- **Durable SQLite State Machine:** SQLite backing with non-destructive migrations, atomic state transitions (`PREPARED` → `AUTHORIZED` → `SUBMITTING` → `SUBMITTED` → `CONFIRMED`), millisecond-precise expiration boundaries, and WAL checkpoint backups.
- **Strict Operator Authentication:** 256-bit cryptographic sessions stored in HTTP-only cookies with sliding-window rate limiting.

---

## Getting Started

### Prerequisites
- Node.js 18.17+ (or Node 20 / 22 / 24)
- npm or pnpm
- Ethereum Sepolia RPC URL (e.g. publicnode, Alchemy, Infura)
- Sepolia Testnet Wallet Private Key (for state-changing transactions)
- Google Gemini API Key (optional; automatically uses deterministic mock provider if omitted)

### 1. Installation
```bash
git clone https://github.com/cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet.git
cd SentinAI-Guardian---An-AI-Native-Autonomous-Wallet
npm install
```

### 2. Environment Configuration
Copy the example environment configuration:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```bash
# Operator Authentication
OPERATOR_PASSWORD="your-secure-operator-password"
SESSION_SECRET="your-32-byte-hex-session-secret"

# Blockchain Configuration (Sepolia Testnet ONLY - Chain ID: 11155111)
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
AGENT_PRIVATE_KEY="0x..." # Sepolia testnet private key only! Never use mainnet.

# AI Configuration (Optional: defaults to 'mock' if GEMINI_API_KEY is not set)
AI_PROVIDER="gemini" # or "mock"
GEMINI_API_KEY="your-gemini-api-key"
```

> **SECURITY NOTICE:** Never use a private key associated with real funds on Ethereum mainnet. This system strictly targets Ethereum Sepolia Testnet (`chainId: 11155111`).

### 3. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the SentinAI Guardian console.

### 4. Running the Production Build
```bash
npm run build
npm start
```

---

## Smoke Tests & Verification

### Gemini AI Smoke Test
```bash
npx tsx scripts/smoke-test-gemini.ts
```

### Automated Test Suite
Run all 140+ unit and integration tests across 19 suites:
```bash
npm test
```

### Type Checking & Linting
```bash
npx tsc --noEmit
npm run lint
```

---

## Documentation

For full architectural, security, and verification documentation:
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Self-Assessment Report](docs/SECURITY_ASSESSMENT.md)
- [Milestone R6 Live Integration Report](docs/reports/R6_LIVE_INTEGRATION_REPORT.md)
- [Milestone R5E Operational Integrity Report](docs/reports/R5E_OPERATIONAL_INTEGRITY_REPORT.md)
- [Milestone R5D Security Recovery Report](docs/reports/R5D_SECURITY_RECOVERY_REPORT.md)

---

## License
MIT
