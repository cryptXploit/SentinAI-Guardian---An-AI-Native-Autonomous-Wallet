import AgentConsole from "@/components/agent/AgentConsole";
import { getLiveWalletOverview } from "@/core/web3/wallet-service";
import { Coins, ShieldCheck, Radio, Cpu, ExternalLink, Terminal, Sparkles } from "lucide-react";
import { connection } from "next/server";

// Opt out of instant-navigation validation because this segment is conditionally gated
// behind client-side AuthGate and performs dynamic per-connection live wallet state queries.
export const instant = false;

export default async function Home() {
  await connection();
  const wallet = await getLiveWalletOverview();

  // Determine active runtime mode (Milestone R6 Section 9)
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const isLiveAI = hasGemini || hasGroq;
  const runtimeMode = process.env.RUNTIME_MODE === 'LIVE_TESTNET'
    ? 'LIVE_TESTNET'
    : isLiveAI
    ? 'LIVE_READ_ONLY'
    : 'MOCK';

  const aiChainLabel = hasGemini && hasGroq
    ? "Gemini 3.8 Flash → Groq GPT-OSS-120B → Local"
    : hasGroq
    ? "Groq GPT-OSS-120B → Local"
    : hasGemini
    ? "Gemini 3.8 Flash → Local"
    : "Local Deterministic Parser";

  return (
    <div id="overview" className="max-w-5xl mx-auto space-y-6 scroll-mt-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface/60 border border-border rounded-2xl p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
              Topic F · Autonomous Agent Wallet
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Non-Bypassable Deterministic Risk Firewall
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Executive Financial Command Center
          </h1>
          <p className="text-sm text-gray-400 max-w-2xl">
            AI interprets natural-language intent across English, বাংলা, and Banglish — while deterministic TypeScript policy engines, Sepolia pre-flight simulations, and Keccak-256 Intent Integrity Proofs govern every signature.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-2.5 shrink-0">
          {/* Runtime Mode Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border text-xs">
            <Radio className={`w-3.5 h-3.5 ${runtimeMode === 'MOCK' ? 'text-amber-400' : 'text-success animate-pulse'}`} />
            <span className="text-gray-400">Environment:</span>
            <span className={`font-mono font-semibold ${runtimeMode === 'MOCK' ? 'text-amber-400' : 'text-success'}`}>
              {runtimeMode}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="#guided-demo"
              className="px-3 py-1.5 rounded-lg bg-accent-blue text-white hover:bg-blue-600 transition-colors text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>60s Judge Walkthrough</span>
            </a>
            <a
              href="#agent-console"
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-gray-200 hover:bg-surface-hover transition-colors text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5 text-accent-blue" />
              <span>Command Center</span>
            </a>
          </div>
        </div>
      </header>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Native ETH Balance */}
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-400">Native Asset Balance</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Sepolia Live
              </span>
            </div>
            <p className="text-3xl font-semibold mt-2 tabular-nums">
              {wallet.nativeBalance.formatted} <span className="text-xl font-normal text-gray-400">ETH</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400 truncate font-mono" title={wallet.address}>
              {wallet.isConfigured ? wallet.address : "Set AGENT_PRIVATE_KEY in .env"}
            </p>
            {wallet.isConfigured && (
              <a
                href={`https://sepolia.etherscan.io/address/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-accent-blue hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Etherscan</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Supported ERC-20 Tokens */}
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-400">Supported Token Balances</h3>
              <Coins className="w-4 h-4 text-accent-blue" />
            </div>
            <div className="mt-2.5 space-y-1.5">
              {wallet.tokens.map((token) => (
                <div key={token.symbol} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400 font-medium">{token.symbol}:</span>
                  <span className="font-semibold tabular-nums text-foreground font-mono">
                    {token.formattedBalance}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-border/60">
            Verified ERC-20 contracts on Sepolia (11155111)
          </p>
        </div>

        {/* Card 3: Network, AI Chain & Security Status */}
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-400">Network &amp; Security Posture</h3>
              <ShieldCheck className="w-4 h-4 text-success" />
            </div>
            <div className="mt-2.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Chain &amp; Block:</span>
                <span className="font-mono tabular-nums text-foreground">
                  Sepolia {wallet.latestBlock ? `#${wallet.latestBlock.toString()}` : "(11155111)"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Policy Firewall:</span>
                <span className="text-success font-medium font-mono">ARMED (Gate 3 + Gate 6.5)</span>
              </div>
              <div className="flex justify-between items-center text-xs gap-2">
                <span className="text-gray-400 shrink-0 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-accent-blue" />
                  AI Failover:
                </span>
                <span className="font-mono text-gray-200 truncate text-right" title={aiChainLabel}>
                  {aiChainLabel}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-border/60 font-mono">
            IIP Keccak-256 + CAS Lock + Recovery Journal Active
          </p>
        </div>
      </div>

      {/* Agent Command Center, Security Center, Policy Management & Architecture */}
      <div className="mt-8">
        <AgentConsole walletAddress={wallet.address} />
      </div>
    </div>
  );
}

