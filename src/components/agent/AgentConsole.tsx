"use client";

import { useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import { processAgentCommand } from "@/app/actions/orchestrator";
import EvidencePanel from "./EvidencePanel";

export default function AgentConsole() {
  const [inputCommand, setInputCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim() || isProcessing) return;

    setIsProcessing(true);
    setResult(null);

    startTransition(async () => {
      try {
        const res = await processAgentCommand(inputCommand);
        setResult(res);
      } catch (error) {
        setResult({ success: false, error: String(error), step: "CLIENT_CATCH" });
      } finally {
        setIsProcessing(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Agent Command Center</h2>
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            disabled={isProcessing}
            placeholder="e.g., Send 0.05 ETH to alice"
            className="w-full bg-background border border-border rounded-lg pl-4 pr-12 py-3 text-foreground focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputCommand.trim()}
            className="absolute right-2 top-2 p-1.5 bg-accent-blue text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        {isProcessing && (
          <div className="mt-6 flex items-center gap-3 text-accent-blue">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium animate-pulse">Running Secure Pipeline... (Parsing -&gt; Policy -&gt; Simulating)</span>
          </div>
        )}
      </div>

      {result && <EvidencePanel result={result} />}
    </div>
  );
}
