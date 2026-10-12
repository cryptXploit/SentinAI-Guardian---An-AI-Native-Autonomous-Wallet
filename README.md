# SentinAI Guardian 🛡️

**An AI-Native Autonomous Wallet** built for the 2026 Shenzhen International FinTech Competition (Topic F - Agent Wallet).

SentinAI Guardian bridges Large Language Models with EVM-compatible blockchains securely. It allows users to execute on-chain intents using natural language while maintaining absolute, deterministic security guarantees through strict mathematical policy engines and EVM state simulations.

## Key Features
- **AI Intent Parsing:** Powered by Gemini 1.5 Flash.
- **Deterministic Risk Control:** Strict spending limits and whitelist validation independent of the AI.
- **EVM Simulation:** Dry-runs transactions via `viem` to prevent on-chain reverts and gas waste.
- **Intent Integrity Proof (IIP):** A unified cryptographic gatekeeper ensuring execution safety.
- **Premium UI:** A secure Next.js Server Component shell featuring `lucide-react`.

## Getting Started

### Prerequisites
- Node.js 18.17 or later
- npm or pnpm

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet.git
cd SentinAI-Guardian---An-AI-Native-Autonomous-Wallet
npm install
```

### 2. Configuration
Create a `.env.local` file in the root directory:
```bash
# .env.local
GEMINI_API_KEY="your-gemini-api-key"
RPC_URL="https://ethereum-sepolia-rpc.publicnode.com" # Or your Infura/Alchemy Sepolia URL
AGENT_PRIVATE_KEY="0x..." # Your Sepolia Testnet Wallet Private Key
```
**SECURITY WARNING:** Do NOT use a mainnet wallet for testing. This application is hardcoded to the Sepolia Testnet (`chainId: 11155111`).

### 3. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Agent Console.

## Documentation
Please refer to the `docs/` folder for competition-specific technical details:
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Self-Assessment Report](docs/SECURITY_ASSESSMENT.md)

## Testing
To run the deterministic pipeline threat-model tests:
```bash
npm run test
```

## License
MIT
