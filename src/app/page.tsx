import AgentConsole from "@/components/agent/AgentConsole";
import { getLiveWalletOverview } from "@/core/web3/wallet-service";
import { Coins, ShieldCheck, Radio } from "lucide-react";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const wallet = await getLiveWalletOverview();

  // Determine active runtime mode (Milestone R6 Section 9)
  const isLiveAI = Boolean(process.env.GEMINI_API_KEY);
  const runtimeMode = process.env.RUNTIME_MODE === 'LIVE_TESTNET'
    ? 'LIVE_TESTNET'
    : isLiveAI
    ? 'LIVE_READ_ONLY'
    : 'MOCK';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Overview</h1>
          <p className="text-gray-400 mt-1">Autonomous wallet intelligence &amp; deterministic risk engine.</p>
        </div>

        {/* Runtime Mode Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-xs">
          <Radio className={`w-3.5 h-3.5 ${runtimeMode === 'MOCK' ? 'text-amber-400' : 'text-success animate-pulse'}`} />
          <span className="text-gray-400">Environment:</span>
          <span className={`font-mono font-medium ${runtimeMode === 'MOCK' ? 'text-amber-400' : 'text-success'}`}>
            {runtimeMode}
          </span>
        </div>
      </header>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Native ETH Balance */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Native Asset Balance</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-border text-gray-300">Sepolia</span>
          </div>
          <p className="text-3xl font-semibold mt-2 tabular-nums">
            {wallet.nativeBalance.formatted} <span className="text-xl font-normal text-gray-400">ETH</span>
          </p>
          <p className="text-xs text-gray-500 mt-2 truncate font-mono" title={wallet.address}>
            {wallet.isConfigured ? `Address: ${wallet.address}` : "Set AGENT_PRIVATE_KEY in .env.local"}
          </p>
        </div>

        {/* Card 2: Supported ERC-20 Tokens */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Supported Token Balances</h3>
            <Coins className="w-4 h-4 text-accent-blue" />
          </div>
          <div className="mt-2 space-y-1">
            {wallet.tokens.map((token) => (
              <div key={token.symbol} className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-medium">{token.symbol}:</span>
                <span className="font-semibold tabular-nums text-foreground">{token.formattedBalance}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Verified ERC-20 contracts on Sepolia
          </p>
        </div>

        {/* Card 3: Network & Security Status */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Network &amp; Security</h3>
            <ShieldCheck className="w-4 h-4 text-success" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Chain:</span>
              <span className="font-mono text-foreground">Sepolia (11155111)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Block:</span>
              <span className="font-mono tabular-nums text-foreground">
                {wallet.latestBlock ? `#${wallet.latestBlock.toString()}` : "Unavailable"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Policy Engine:</span>
              <span className="text-success font-medium">Armed (Deterministic)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Command Center */}
      <div className="mt-8">
        <AgentConsole />
      </div>
    </div>
  );
}
