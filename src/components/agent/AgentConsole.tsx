"use client";

import { useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import { prepareTransactionIntent, authorizeAndExecute, PrepareResult, AuthorizeResult } from "@/app/actions/orchestrator";
import EvidencePanel from "./EvidencePanel";

export default function AgentConsole() {
  const [inputCommand, setInputCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null);
  const [executionResult, setExecutionResult] = useState<AuthorizeResult | null>(null);
  
  const [, startTransition] = useTransition();

  const handlePrepare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim() || isProcessing || isAuthorizing) return;

    setIsProcessing(true);
    setPrepareResult(null);
    setExecutionResult(null);

    startTransition(async () => {
      try {
        const res = await prepareTransactionIntent(inputCommand);
        setPrepareResult(res);
      } catch (error) {
        setPrepareResult({ success: false, error: (error as Error).message, step: "AUTH" });
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
    } catch (error) {
      setExecutionResult({ success: false, proposalId, error: (error as Error).message });
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Agent Command Center</h2>
        <form onSubmit={handlePrepare} className="relative">
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            disabled={isProcessing || isAuthorizing}
            placeholder="e.g., 'Show my balance' or 'Send 0.05 ETH to alice'"
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
      </div>

      <EvidencePanel
        prepareResult={prepareResult}
        executionResult={executionResult}
        onAuthorize={handleAuthorize}
        isAuthorizing={isAuthorizing}
      />
    </div>
  );
}
