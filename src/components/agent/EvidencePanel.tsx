"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldX,
  ShieldAlert,
  ArrowRight,
  Loader2,
  Clock,
  Wallet,
  Coins,
  Activity,
  Lock,
  Sparkles,
} from "lucide-react";
import { PrepareResult, AuthorizeResult } from "@/app/actions/orchestrator";
import IntentComparisonPanel from "./IntentComparisonPanel";

interface EvidencePanelProps {
  prepareResult?: PrepareResult | null;
  executionResult?: AuthorizeResult | null;
  onAuthorize?: (proposalId: string) => Promise<void>;
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

  // Phase 0: Read-Only Financial Intelligence Query (Milestone R6)
  if (prepareResult?.isQuery && prepareResult.queryResult) {
    const q = prepareResult.queryResult;
    const isBalance = q.action === 'QUERY_BALANCE';

    return (
      <div className="border border-accent-blue/30 bg-surface rounded-xl overflow-hidden shadow-lg">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isBalance ? (
                <div className="p-2.5 rounded-xl bg-accent-blue/10 text-accent-blue">
                  <Wallet className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-accent-blue/10 text-accent-blue">
                  <Activity className="w-6 h-6" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  {isBalance ? "Live Wallet Intelligence" : "Sepolia Network Status"}
                </h3>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                  READ-ONLY · NO SIGNER REQUIRED
                </span>
              </div>

              <p className="text-sm text-gray-300 mt-2">{q.summary}</p>

              {isBalance && q.overview && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <p className="text-xs text-gray-400 font-medium">Native ETH</p>
                    <p className="text-lg font-semibold mt-1 tabular-nums">{q.overview.nativeBalance.formatted} ETH</p>
                  </div>
                  {q.overview.tokens.map((token) => (
                    <div key={token.symbol} className="p-3 bg-background rounded-lg border border-border">
                      <p className="text-xs text-gray-400 font-medium">{token.symbol}</p>
                      <p className="text-lg font-semibold mt-1 tabular-nums">{token.formattedBalance} {token.symbol}</p>
                    </div>
                  ))}
                </div>
              )}

              {q.overview?.latestBlock && (
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Sepolia Block #{q.overview.latestBlock.toString()} · Data verified on-chain</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2 Completed: Execution outcome
  if (executionResult) {
    const isSuccess = executionResult.success && executionResult.executionResult?.success;
    const isPendingReceipt = !isSuccess && Boolean(executionResult.error?.includes("RECEIPT_PENDING"));

    const cardBorder = isSuccess
      ? 'border-success/20 bg-success/5'
      : isPendingReceipt
      ? 'border-amber-500/20 bg-amber-500/5'
      : 'border-danger/20 bg-danger/5';

    const titleColor = isSuccess
      ? 'text-success'
      : isPendingReceipt
      ? 'text-amber-400'
      : 'text-danger';

    return (
      <div className={`border rounded-xl overflow-hidden shadow-lg ${cardBorder}`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isSuccess ? (
                <CheckCircle2 className="w-8 h-8 text-success" />
              ) : isPendingReceipt ? (
                <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
              ) : (
                <ShieldX className="w-8 h-8 text-danger" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${titleColor}`}>
                {isSuccess
                  ? "Transaction Authorized & Confirmed"
                  : isPendingReceipt
                  ? "Transaction Broadcast — Pending On-Chain Confirmation"
                  : "Execution Blocked / Failed"}
              </h3>

              {isSuccess && executionResult.executionResult?.transactionHash ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-300 break-all">
                    <span className="font-medium text-gray-400">Tx Hash:</span> {executionResult.executionResult.transactionHash}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="font-medium text-gray-400">Proposal ID:</span> {executionResult.proposalId}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="font-medium text-gray-400">Status:</span> {executionResult.executionResult.receiptStatus || "confirmed"}
                  </p>
                </div>
              ) : isPendingReceipt ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-300">
                    {executionResult.error}
                  </p>
                  {executionResult.proposalId && (
                    <p className="text-sm text-gray-400">
                      <span className="font-medium text-gray-400">Proposal ID:</span> {executionResult.proposalId}
                    </p>
                  )}
                  <p className="text-xs text-amber-400/80 mt-1">
                    Evidence safely locked in database. You may reconcile this transaction once block confirmation completes.
                  </p>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-gray-400">Error:</span> {executionResult.error || executionResult.executionResult?.error || "Transaction blocked"}
                  </p>
                  {executionResult.proposalId && (
                    <p className="text-sm text-gray-400">
                      <span className="font-medium text-gray-400">Proposal ID:</span> {executionResult.proposalId}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expandable Verification Data */}
        <div className="border-t border-border/50">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 transition-colors bg-surface-hover/50"
          >
            <span>View Server Proposal Record</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="p-6 bg-background border-t border-border/50 overflow-x-auto">
              <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 1: Semantic Verification & Risk Evidence (Milestone R7 / R7.1)
  const summary = prepareResult?.summary;
  const analysis = prepareResult?.analysis;
  const isDemo = Boolean(prepareResult?.isDemo || prepareResult?.provenance === 'SECURITY_FIXTURE');
  const isBlocked = !prepareResult?.success || Boolean(analysis && !analysis.canExecute);
  const isReadyForAuth = !isBlocked && !isDemo && Boolean(prepareResult?.proposalId && summary);
  const proposalId = prepareResult?.proposalId;

  return (
    <div className="space-y-6">
      {/* 1. Milestone R7 / R7.1 Intent Comparison Panel */}
      {analysis && (
        <IntentComparisonPanel
          analysis={analysis}
          exposure={prepareResult?.exposure}
          explanation={prepareResult?.explanation}
          summary={summary}
          isBlocked={isBlocked}
          isDemo={isDemo}
          error={prepareResult?.error}
        />
      )}

      {/* Demo Fixture Isolation Card (R7.1 Priority A) */}
      {isDemo && (
        <div className="border border-purple-500/40 bg-purple-950/15 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h5 className="font-semibold text-sm text-purple-300">
                  Controlled Security Demonstration Fixture
                </h5>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  DEMO / SIMULATED
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                This scenario is an educational simulation. By architectural design, security demonstration fixtures are permanently isolated from the wallet signing key and cannot be broadcast to the blockchain.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            NON-EXECUTABLE DEMO
          </span>
        </div>
      )}

      {/* 2. Phase 1 Authorization Gate (Live Verified Proposals ONLY) */}
      {isReadyForAuth && proposalId && summary && (
        <div className="border border-emerald-500/30 bg-surface rounded-xl overflow-hidden shadow-lg p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <h4 className="font-semibold text-foreground text-sm">
                  Human-in-the-Loop Execution Gate
                </h4>
              </div>
              <p className="text-xs text-gray-400">
                All deterministic policy checks, calldata verifications, and Sepolia simulations passed. Explicit authorization required before blockchain broadcast.
              </p>
              <div className="text-[11px] font-mono text-gray-500 pt-1">
                Proposal ID: <span className="text-accent-blue">{proposalId}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAuthorize && onAuthorize(proposalId)}
              disabled={isAuthorizing}
              className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm text-sm"
            >
              {isAuthorizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authorizing &amp; Signing...
                </>
              ) : (
                <>
                  Confirm &amp; Execute Transaction
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Blocked Security Barrier (for genuine blocked live commands) */}
      {isBlocked && !isDemo && (
        <div className="border border-red-500/30 bg-red-950/10 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-semibold text-sm text-red-300">
                Execution Permanently Prohibited
              </h5>
              <p className="text-xs text-gray-400 mt-0.5">
                The agent signing key is strictly isolated and will not sign or broadcast this transaction.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            NON-EXECUTABLE PROPOSAL
          </span>
        </div>
      )}

      {/* 3. Expandable Proposal Audit Record */}
      {prepareResult && (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-surface">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between text-xs text-gray-400 hover:text-gray-200 transition-colors bg-surface-hover/50"
          >
            <span>View Full Diagnostic &amp; Proposal Audit Trail</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="p-6 bg-background border-t border-border/50 overflow-x-auto">
              <pre className="text-xs text-gray-400 font-mono">
                {JSON.stringify(prepareResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
