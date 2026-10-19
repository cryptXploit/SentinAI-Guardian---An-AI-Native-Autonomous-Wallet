"use client";

import Link from "next/link";
import { ShieldCheck, Shield, LayoutDashboard, Sparkles, Activity, Settings, FileCheck2, Cpu } from "lucide-react";
import { LogoutButton } from "@/components/auth/AuthGate";

export default function TopBar() {
  return (
    <header className="bg-surface/95 backdrop-blur border-b border-border sticky top-0 z-20">
      <div className="h-14 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex lg:hidden items-center gap-2">
            <Shield className="w-5 h-5 text-accent-blue" />
            <span className="font-bold text-sm text-foreground">SentinAI</span>
          </div>
          <span className="hidden lg:inline-block text-xs font-mono uppercase tracking-wider text-gray-400">
            Autonomous Wallet Command Center · Deterministic Risk Control
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-background border border-border text-xs"
            title="Target Blockchain Network: Ethereum Sepolia Testnet (Chain ID 11155111)"
          >
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-gray-300 font-mono text-[11px]">Sepolia (11155111)</span>
          </div>
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success text-xs font-medium border border-success/20"
            title="9-Gate Deterministic Policy & Calldata Verification Active"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>9-Gate Policy Armed</span>
          </div>
          <LogoutButton />
        </div>
      </div>

      {/* Responsive Mobile & Tablet Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="flex lg:hidden items-center gap-1 px-3 py-2 border-t border-border/60 overflow-x-auto text-xs bg-[#090d16]"
      >
        <Link
          href="/#overview"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-gray-300 hover:bg-surface-hover hover:text-white whitespace-nowrap"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-accent-blue" />
          Overview
        </Link>
        <Link
          href="/#guided-demo"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-purple-300 hover:bg-surface-hover whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Guided Demo
        </Link>
        <Link
          href="/#agent-console"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-gray-300 hover:bg-surface-hover hover:text-white whitespace-nowrap"
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          Workspace
        </Link>
        <Link
          href="/#policies"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-gray-300 hover:bg-surface-hover hover:text-white whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5 text-amber-400" />
          Policies
        </Link>
        <Link
          href="/#security-center"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-gray-300 hover:bg-surface-hover hover:text-white whitespace-nowrap"
        >
          <FileCheck2 className="w-3.5 h-3.5 text-accent-blue" />
          Evidence
        </Link>
        <Link
          href="/#architecture"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-gray-300 hover:bg-surface-hover hover:text-white whitespace-nowrap"
        >
          <Cpu className="w-3.5 h-3.5 text-purple-400" />
          Architecture
        </Link>
      </nav>
    </header>
  );
}
