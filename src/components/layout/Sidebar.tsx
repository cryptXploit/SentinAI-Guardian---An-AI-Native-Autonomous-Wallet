import Link from 'next/link';
import {
  Shield,
  Wallet,
  Activity,
  Settings,
  LayoutDashboard,
  Cpu,
  FileCheck2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { getAgentWalletAddress } from '@/core/web3/wallet-service';

export default function Sidebar() {
  const walletInfo = getAgentWalletAddress();
  const displayAddress = walletInfo.isConfigured
    ? `${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`
    : walletInfo.address;

  return (
    <aside
      aria-label="Primary Sidebar Navigation"
      className="w-64 h-screen bg-surface border-r border-border hidden lg:flex flex-col sticky top-0 shrink-0 select-none"
    >
      {/* Brand Identity */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/25 text-accent-blue">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground leading-none">
              SentinAI Guardian
            </h1>
            <p className="text-[11px] text-gray-400 mt-1 font-mono">
              Topic F · Autonomous Wallet
            </p>
          </div>
        </div>
      </div>

      {/* Primary Information Architecture Navigation */}
      <nav className="flex-1 py-5 px-3 space-y-6 overflow-y-auto">
        <div>
          <p className="px-3 mb-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-500">
            Command Center
          </p>
          <div className="space-y-1">
            <Link
              href="/#overview"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-accent-blue shrink-0" />
              <span className="font-medium">Overview</span>
            </Link>
            <Link
              href="/#guided-demo"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="font-medium">Guided Judge Demo</span>
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                DEMO
              </span>
            </Link>
            <Link
              href="/#agent-console"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">Agent Workspace</span>
            </Link>
          </div>
        </div>

        <div>
          <p className="px-3 mb-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-500">
            Governance &amp; Audit
          </p>
          <div className="space-y-1">
            <Link
              href="/#policies"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-medium">Security Policies</span>
            </Link>
            <Link
              href="/#security-center"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <FileCheck2 className="w-4 h-4 text-accent-blue shrink-0" />
              <span className="font-medium">Activity &amp; Evidence</span>
            </Link>
            <Link
              href="/#architecture"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="font-medium">How It Works</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Configured Sepolia Agent Wallet Footer */}
      <div className="p-4 border-t border-border bg-[#090d16]">
        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
          <span className="font-medium flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-accent-blue" />
            Agent Signer
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
            SEPOLIA
          </span>
        </div>
        <div
          className="text-xs font-mono text-gray-200 truncate bg-surface px-2.5 py-1.5 rounded border border-border flex items-center justify-between gap-2"
          title={walletInfo.address}
        >
          <span className="truncate tabular-nums">{displayAddress}</span>
          {walletInfo.isConfigured && (
            <a
              href={`https://sepolia.etherscan.io/address/${walletInfo.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-accent-blue shrink-0"
              title="Inspect Agent Wallet on Sepolia Etherscan"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
