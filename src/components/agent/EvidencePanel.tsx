"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ShieldX, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { IntentIntegrityProof } from "@/core/security/iip";
import { PrepareResult, AuthorizeResult } from "@/app/actions/orchestrator";

interface EvidencePanelProps {
  prepareResult?: PrepareResult | null;
  executionResult?: AuthorizeResult | null;
  onAuthorize?: (iip: IntentIntegrityProof) => Promise<void>;
  isAuthorizing?: boolean;
}

export default function EvidencePanel({
  prepareResult,
  executionResult,
  onAuthorize,
  isAuthorizing = false,
}: EvidencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!prepareResult && !executionResult) {
    return null;
  }

  // Phase 2 Completed: Execution outcome
  if (executionResult) {
    const isSuccess = executionResult.success && executionResult.executionResult?.success;

    return (
      <div className={`border rounded-xl overflow-hidden ${isSuccess ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'}`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isSuccess ? (
                <CheckCircle2 className="w-8 h-8 text-success" />
              ) : (
                <ShieldX className="w-8 h-8 text-danger" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${isSuccess ? 'text-success' : 'text-danger'}`}>
                {isSuccess ? "Transaction Authorized & Executed" : "Execution Blocked / Failed"}
              </h3>

              {isSuccess && executionResult.executionResult?.transactionHash ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-300 break-all">
                    <span className="font-medium text-gray-400">Tx Hash:</span> {executionResult.executionResult.transactionHash}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="font-medium text-gray-400">Status:</span> {executionResult.executionResult.receiptStatus || "confirmed"}
                  </p>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-gray-400">Error:</span> {executionResult.error || executionResult.executionResult?.error || "Transaction blocked"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expandable IIP Data */}
        <div className="border-t border-border/50">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 transition-colors bg-surface-hover/50"
          >
            <span>View Intent Integrity Proof (IIP) Cryptographic Digest</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="p-6 bg-background border-t border-border/50 overflow-x-auto">
              <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(executionResult.iip || executionResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 1 Outcome: Either Ready for Human Authorization or Blocked by Policy/Simulation
  const iip = prepareResult?.iip;
  const isReadyForAuth = prepareResult?.success && iip?.finalDecision === "ALLOW_FOR_AUTHORIZATION";

  if (isReadyForAuth && iip) {
    return (
      <div className="border border-accent-blue/30 bg-surface rounded-xl overflow-hidden shadow-lg">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <ShieldCheck className="w-8 h-8 text-accent-blue" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Transaction Verified — Authorization Required
                </h3>
                <span className="text-xs px-2.5 py-1 rounded-full bg-accent-blue/10 text-accent-blue font-mono border border-accent-blue/20">
                  Dual-Gated Verification
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/60 p-4 rounded-lg border border-border">
                <div>
                  <span className="text-xs text-gray-400">Action & Asset</span>
                  <p className="text-sm font-semibold text-foreground">{iip.intent.action} {iip.intent.amount} {iip.intent.asset}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Recipient Address</span>
                  <p className="text-sm font-mono text-gray-300 truncate" title={iip.candidate.to}>
                    {iip.intent.recipientAlias} ({iip.candidate.to})
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Policy Evaluation</span>
                  <p className="text-sm text-success flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Passed Rules
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">EVM Simulation</span>
                  <p className="text-sm text-success flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dry-Run Passed ({iip.simulation.gasEstimated?.toString()} gas)
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between flex-wrap gap-4 pt-2">
                <div className="text-xs text-gray-400 font-mono">
                  <span className="text-gray-500">IIP Keccak-256 Digest: </span>
                  <span className="text-accent-blue">{iip.proofDigest.slice(0, 10)}...{iip.proofDigest.slice(-8)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onAuthorize && onAuthorize(iip)}
                  disabled={isAuthorizing}
                  className="px-5 py-2.5 bg-success text-white font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
                >
                  {isAuthorizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Authorizing Transaction...
                    </>
                  ) : (
                    <>
                      Approve & Execute
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable IIP Raw Data */}
        <div className="border-t border-border/50">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 transition-colors bg-surface-hover/50"
          >
            <span>View Intent Integrity Proof (IIP) Raw Payload</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="p-6 bg-background border-t border-border/50 overflow-x-auto">
              <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(iip, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 1 Blocked / Failed
  return (
    <div className="border border-danger/20 bg-danger/5 rounded-xl overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="mt-1">
            <ShieldX className="w-8 h-8 text-danger" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-danger">
              Transaction Blocked by Security Policy
            </h3>
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-300">
                <span className="font-medium text-gray-400">Error:</span> {prepareResult?.error || "Policy check blocked transaction"}
              </p>
              {prepareResult?.step && (
                <p className="text-sm text-gray-300">
                  <span className="font-medium text-gray-400">Failed at Step:</span> {prepareResult.step}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {iip && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 transition-colors bg-surface-hover/50"
          >
            <span>View Intent Integrity Proof (IIP) Raw Data</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="p-6 bg-background border-t border-border/50 overflow-x-auto">
              <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(iip, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
