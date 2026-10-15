"use client";

import { useState, useTransition } from "react";
import { Send, Loader2, ShieldAlert } from "lucide-react";
import {
  prepareTransactionIntent,
  testSecurityFixtureAction,
  authorizeAndExecute,
  cancelProposalAction,
  PrepareResult,
  AuthorizeResult,
} from "@/app/actions/orchestrator";
import EvidencePanel from "./EvidencePanel";
import SecurityHistoryPanel from "./SecurityHistoryPanel";
import PolicyManagementPanel from "./PolicyManagementPanel";

const QUICK_DEMO_FIXTURES = [
  { id: "excessive-finite-approval", label: "Phishing: 1M USDC Approval", type: "threat" },
  { id: "wrong-spender", label: "Drainer: Attacker Spender", type: "threat" },
  { id: "wrong-token-contract", label: "Spoof: Contract Mismatch", type: "threat" },
  { id: "wrong-network", label: "Network: Mainnet Confusion", type: "threat" },
  { id: "safe-bounded-approval", label: "Safe: 50 USDC Approval", type: "safe" },
];

export default function AgentConsole({ walletAddress }: { walletAddress?: string }) {
  const [inputCommand, setInputCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null);
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null);
  const [executionResult, setExecutionResult] = useState<AuthorizeResult | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [, startTransition] = useTransition();

  const handlePrepare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim() || isProcessing || isAuthorizing) return;

    setIsProcessing(true);
    setSelectedFixture(null);
    setPrepareResult(null);
    setExecutionResult(null);

    startTransition(async () => {
      try {
        const res = await prepareTransactionIntent(inputCommand);
        setPrepareResult(res);
        setHistoryRefreshTrigger((c) => c + 1);
      } catch (error) {
        setPrepareResult({ success: false, error: (error as Error).message, step: "AUTH" });
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const handleRunFixture = async (scenarioId: string) => {
    if (isProcessing || isAuthorizing) return;

    setIsProcessing(true);
    setSelectedFixture(scenarioId);
    setPrepareResult(null);
    setExecutionResult(null);

    startTransition(async () => {
      try {
        const res = await testSecurityFixtureAction(scenarioId);
        setPrepareResult(res);
      } catch (error) {
        setPrepareResult({ success: false, error: (error as Error).message, step: "FIXTURE" });
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const handleAuthorize = async (proposalId: string) => {
    if (isAuthorizing) return;

    setIsAuthorizing(true);
    try {
      const res = await authorizeAndExecute(proposalId);
      setExecutionResult(res);
      setHistoryRefreshTrigger((c) => c + 1);
    } catch (error) {
      setExecutionResult({ success: false, proposalId, error: (error as Error).message });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleCancelProposal = async () => {
    const idToCancel = prepareResult?.proposalId;
    setPrepareResult(null);
    setExecutionResult(null);
    if (idToCancel) {
      try {
        await cancelProposalAction(idToCancel);
        setHistoryRefreshTrigger((c) => c + 1);
      } catch {
        // Ignore cancellation error if already terminal
      }
    }
  };

  return (
    <div className="space-y-8">
      <section id="agent-console" className="bg-surface border border-border rounded-xl p-6 scroll-mt-6">
        <h2 className="text-xl font-semibold mb-4">Agent Command Center</h2>
        <form onSubmit={handlePrepare} className="relative">
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            disabled={isProcessing || isAuthorizing}
            placeholder="e.g., 'Show my balance' or 'Send 0.01 ETH to alice'"
            className="w-full bg-background border border-border rounded-lg pl-4 pr-12 py-3 text-foreground focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isProcessing || isAuthorizing || !inputCommand.trim()}
            className="absolute right-2 top-2 p-1.5 bg-accent-blue text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        {/* Topic F Threat Scenario Demo Buttons */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              Controlled Threat Scenarios (Topic F Demonstration)
            </span>
            <span className="text-[11px] text-gray-500">Click to test instant semantic analysis</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_DEMO_FIXTURES.map((fix) => (
              <button
                key={fix.id}
                type="button"
                onClick={() => handleRunFixture(fix.id)}
                disabled={isProcessing || isAuthorizing}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  selectedFixture === fix.id
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : fix.type === "threat"
                    ? "bg-[#0B0F17] border-red-500/30 text-gray-300 hover:border-red-500/60 hover:text-red-300"
                    : "bg-[#0B0F17] border-emerald-500/30 text-gray-300 hover:border-emerald-500/60 hover:text-emerald-300"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${fix.type === "threat" ? "bg-red-400" : "bg-emerald-400"}`} />
                {fix.label}
              </button>
            ))}
          </div>
        </div>

        {isProcessing && (
          <div className="mt-6 flex items-center gap-3 text-accent-blue">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium animate-pulse">
              Phase 1: Analyzing Intent &amp; Evaluating Security Policy...
            </span>
          </div>
        )}

        {isAuthorizing && (
          <div className="mt-6 flex items-center gap-3 text-success">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium animate-pulse">
              Phase 2: Verifying Keccak-256 Digest &amp; Broadcasting Transaction...
            </span>
          </div>
        )}
      </section>

      <EvidencePanel
        prepareResult={prepareResult}
        executionResult={executionResult}
        onAuthorize={handleAuthorize}
        onCancel={handleCancelProposal}
        isAuthorizing={isAuthorizing}
      />

      <SecurityHistoryPanel refreshTrigger={historyRefreshTrigger} />

      <PolicyManagementPanel walletAddress={walletAddress} />
    </div>
  );
}
