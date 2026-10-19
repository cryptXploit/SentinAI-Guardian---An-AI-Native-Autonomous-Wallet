"use client";

import { useState } from "react";
import {
  Cpu,
  ShieldCheck,
  SearchCode,
  Activity,
  Lock,
  Blocks,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
} from "lucide-react";

const ARCHITECTURE_STAGES = [
  {
    step: "01",
    title: "AI Intent Interpretation",
    layer: "Untrusted Advisory Layer",
    badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    icon: Cpu,
    summary:
      "Natural-language commands (English, Bengali, Banglish) are parsed into strict JSON via Groq (openai/gpt-oss-120b) or Google Gemini (gemini-3.8-flash), with deterministic regex fallback.",
    guarantee:
      "AI output is validated by Zod schema and negation/injection filters. The AI has zero access to signing keys, policies, or RPC broadcast.",
  },
  {
    step: "02",
    title: "Deterministic Policy Engine",
    layer: "Synchronous Rule Core",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: ShieldCheck,
    summary:
      "Evaluates the parsed intent against SQLite-persisted operator policies using exact BigInt Wei arithmetic (no floating-point rounding).",
    guarantee:
      "Unknown recipients fail closed (CSF-02). Transfers exceeding maxTransferAmountETH or unlimited ERC-20 approvals are deterministically blocked.",
  },
  {
    step: "03",
    title: "Semantic & Risk Analysis",
    layer: "Calldata Verification Core",
    badgeColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    icon: SearchCode,
    summary:
      "Independently decodes EVM bytecode (0xa9059cbb / 0x095ea7b3) and compares target contract, spender/recipient, amount, and chain ID against user intent.",
    guarantee:
      "Queries real on-chain ERC-20 allowance(owner, spender) on Sepolia (CSF-03) and blocks any intent-to-calldata mismatch.",
  },
  {
    step: "04",
    title: "Account-Bound Simulation",
    layer: "Pre-Execution Dry Run",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Activity,
    summary:
      "Executes eth_chainId (11155111), eth_getCode, and eth_estimateGas on Ethereum Sepolia using the configured sender wallet account (CSF-01).",
    guarantee:
      "Detects on-chain reverts and gas anomalies before any signature is requested, and binds all results into a Keccak-256 Intent Integrity Proof (IIP) digest.",
  },
  {
    step: "05",
    title: "Human Authorization Gate",
    layer: "Two-Phase Privilege Boundary",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: Lock,
    summary:
      "Presents full pre-execution parameters (Sender, Recipient, Asset, Amount, Gas, Policy Verdict, IIP Digest) for explicit human review and authorization.",
    guarantee:
      "Enforces 9 server-side gates at execution time, including Gate 6.5 live policy revalidation, IIP digest verification, and atomic SQLite CAS locking.",
  },
  {
    step: "06",
    title: "Sepolia Broadcast & Recovery",
    layer: "Isolated Signer & Ledger",
    badgeColor: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
    icon: Blocks,
    summary:
      "Signs the verified transaction server-side (enforcing a 21,000 gas floor), broadcasts to Ethereum Sepolia, and writes a durable Broadcast Recovery Journal.",
    guarantee:
      "Prevents duplicate replay on RPC timeouts or post-broadcast DB crashes via 3-tier non-rebroadcasting receipt reconciliation.",
  },
];

export default function ArchitecturePanel() {
  const [showTrustMatrix, setShowTrustMatrix] = useState(false);

  return (
    <section
      id="architecture"
      aria-labelledby="architecture-heading"
      className="bg-surface border border-border rounded-xl p-6 scroll-mt-20 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-purple-400" />
            <h2 id="architecture-heading" className="text-xl font-semibold text-foreground">
              Architecture &amp; How It Works
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-surface-elevated text-gray-300 border border-border">
              ARCHITECTURAL REFERENCE
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Separation of privilege between probabilistic AI intent parsing and deterministic financial security enforcement.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTrustMatrix((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background border border-border text-gray-300 hover:text-white hover:border-accent-blue transition-colors self-start sm:self-auto"
        >
          <span>{showTrustMatrix ? "Hide Trust Boundaries" : "Inspect Trust Boundaries"}</span>
          {showTrustMatrix ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Visual 6-Stage Architecture Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ARCHITECTURE_STAGES.map((stage, idx) => {
          const IconComponent = stage.icon;
          return (
            <div
              key={stage.step}
              className="bg-background border border-border rounded-xl p-4 flex flex-col justify-between relative group hover:border-border-strong transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gray-500">
                      STEP {stage.step}
                    </span>
                    {idx < ARCHITECTURE_STAGES.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-gray-600 hidden lg:inline" />
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${stage.badgeColor}`}
                  >
                    {stage.layer}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 mb-2">
                  <div className="p-1.5 rounded-lg bg-surface border border-border text-accent-blue shrink-0">
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                </div>

                <p className="text-xs text-gray-300 leading-relaxed">{stage.summary}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-border/60">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="font-semibold text-emerald-400">Security Invariant: </span>
                  {stage.guarantee}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expandable Trust Boundary & Attack Rejection Matrix */}
      {showTrustMatrix && (
        <div className="bg-background border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              Trust Boundary &amp; Attack Rejection Matrix
            </h3>
            <span className="text-[11px] font-mono text-gray-400">
              Note: IIP Digest is an unkeyed Keccak-256 content-integrity hash, not a digital signature.
            </span>
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface border-b border-border text-gray-400">
                  <th className="py-2.5 px-3 font-medium">Component</th>
                  <th className="py-2.5 px-3 font-medium">Trust Level</th>
                  <th className="py-2.5 px-3 font-medium">Private Key Access</th>
                  <th className="py-2.5 px-3 font-medium">Primary Attack Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="py-2.5 px-3 font-mono text-purple-300">AI Intent Parser (Groq / Gemini)</td>
                  <td className="py-2.5 px-3 text-amber-400 font-medium">Untrusted Advisory</td>
                  <td className="py-2.5 px-3 font-mono text-emerald-400">NONE</td>
                  <td className="py-2.5 px-3 text-gray-300">Prompt injection, negation traps, schema hallucination</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-300">Deterministic Policy Engine</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-medium">Trusted Local Core</td>
                  <td className="py-2.5 px-3 font-mono text-emerald-400">NONE</td>
                  <td className="py-2.5 px-3 text-gray-300">Untrusted recipients (CSF-02), excessive ETH transfers, unlimited approvals</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-blue-300">Transaction &amp; Approval Analyzer</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-medium">Trusted Local Core</td>
                  <td className="py-2.5 px-3 font-mono text-emerald-400">NONE</td>
                  <td className="py-2.5 px-3 text-gray-300">Blind signing, spoofed token contracts, drainer spenders, wrong chain</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-amber-300">Phase 2 Execution Gate (9 Gates)</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-medium">Enforced Server Boundary</td>
                  <td className="py-2.5 px-3 font-mono text-amber-400">Gated (Post-Lock Only)</td>
                  <td className="py-2.5 px-3 text-gray-300">TOCTOU policy drift (Gate 6.5), expired proposals, concurrent double-spend, fixture execution</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
