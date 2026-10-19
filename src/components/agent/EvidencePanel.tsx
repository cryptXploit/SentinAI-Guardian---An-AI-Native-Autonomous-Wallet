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
  X,
  XCircle,
  Eye,
} from "lucide-react";
import { PrepareResult, AuthorizeResult } from "@/app/actions/orchestrator";
import IntentComparisonPanel from "./IntentComparisonPanel";

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => (typeof val === "bigint" ? val.toString() : val),
    2
  );
}

interface EvidencePanelProps {
  prepareResult?: PrepareResult | null;
  executionResult?: AuthorizeResult | null;
  onAuthorize?: (proposalId: string) => Promise<void>;
  onCancel?: () => void;
  isAuthorizing?: boolean;
  walletAddress?: string;
}

export default function EvidencePanel({
  prepareResult,
  executionResult,
  onAuthorize,
  onCancel,
  isAuthorizing = false,
  walletAddress,
}: EvidencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPreExecutionReview, setShowPreExecutionReview] = useState(true);
  const [dismissedModalProposalId, setDismissedModalProposalId] = useState<string | null>(null);

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
                <div className="flex items-center gap-2">
                  {prepareResult.aiProvenance && (
                    <span className={`px-2.5 py-1 text-xs font-mono font-medium rounded-full border ${
                      prepareResult.aiProvenance === 'LIVE_AI'
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}>
                      {prepareResult.aiProvenance === 'LIVE_AI'
                        ? prepareResult.aiProviderUsed === 'groq'
                          ? `GROQ AI · ${prepareResult.aiModelUsed || 'openai/gpt-oss-120b'}`
                          : prepareResult.aiProviderUsed === 'gemini'
                          ? `GEMINI AI · ${prepareResult.aiModelUsed || 'gemini-3.8-flash'}`
                          : 'LIVE AI'
                        : 'FALLBACK PARSER'}
                    </span>
                  )}
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                    READ-ONLY · NO SIGNER REQUIRED
                  </span>
                </div>
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
    const isPendingReceipt =
      !isSuccess &&
      Boolean(
        executionResult.error?.includes("RECEIPT_PENDING") ||
          executionResult.error?.includes("POST_BROADCAST_DB_FAILURE")
      );
    const isBroadcastUncertain =
      !isSuccess && Boolean(executionResult.error?.includes("BROADCAST_UNCERTAIN"));
    const isRevertedOnChain =
      !isSuccess && executionResult.executionResult?.receiptStatus === "reverted";
    const txHash = executionResult.executionResult?.transactionHash;

    const cardBorder = isSuccess
      ? "border-success/20 bg-success/5"
      : isPendingReceipt || isBroadcastUncertain
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-danger/20 bg-danger/5";

    const titleColor = isSuccess
      ? "text-success"
      : isPendingReceipt || isBroadcastUncertain
      ? "text-amber-400"
      : "text-danger";

    return (
      <div className={`border rounded-xl overflow-hidden shadow-lg ${cardBorder}`}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {isSuccess ? (
                <CheckCircle2 className="w-8 h-8 text-success" />
              ) : isPendingReceipt || isBroadcastUncertain ? (
                <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
              ) : (
                <ShieldX className="w-8 h-8 text-danger" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${titleColor}`}>
                {isSuccess
                  ? "Transaction Authorized & Confirmed On-Chain"
                  : isPendingReceipt
                  ? "Transaction Broadcast — Pending On-Chain Confirmation"
                  : isBroadcastUncertain
                  ? "Broadcast Outcome Uncertain — Locked Against Duplicate Replay"
                  : isRevertedOnChain
                  ? "Transaction Mined — Execution Reverted On-Chain"
                  : "Execution Blocked / Failed Before Broadcast"}
              </h3>

              {isSuccess && txHash ? (
                <div className="mt-2 space-y-1.5">
                  <p className="text-sm text-gray-300 break-all font-mono">
                    <span className="font-sans font-medium text-gray-400">Tx Hash:</span> {txHash}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="font-medium text-gray-400">Proposal ID:</span> {executionResult.proposalId}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="font-medium text-gray-400">On-Chain State:</span>{" "}
                    <span className="text-success font-mono uppercase">
                      {executionResult.executionResult?.receiptStatus || "CONFIRMED"}
                    </span>
                  </p>
                  <div className="pt-1">
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:underline"
                    >
                      View Verified Receipt on Sepolia Etherscan
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : isPendingReceipt || isBroadcastUncertain ? (
                <div className="mt-2 space-y-1.5">
                  <p className="text-sm text-gray-300">{executionResult.error}</p>
                  {txHash && (
                    <p className="text-xs font-mono text-gray-300 break-all">
                      Tx Hash: {txHash}
                    </p>
                  )}
                  {executionResult.proposalId && (
                    <p className="text-sm text-gray-400">
                      <span className="font-medium text-gray-400">Proposal ID:</span> {executionResult.proposalId}
                    </p>
                  )}
                  <p className="text-xs text-amber-400/90 mt-1">
                    Proposal is locked in non-replayable state ({isBroadcastUncertain ? "EXECUTION_UNKNOWN" : "RECONCILIATION_REQUIRED"}) so retries cannot cause a duplicate transfer.
                  </p>
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-gray-400">Reason:</span>{" "}
                    {executionResult.error || executionResult.executionResult?.error || "Transaction blocked"}
                  </p>
                  {txHash && (
                    <p className="text-xs font-mono text-gray-400 break-all">
                      Tx Hash: {txHash}
                    </p>
                  )}
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
                {safeJsonStringify(executionResult)}
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
  const isApprovalModalOpen = Boolean(
    isReadyForAuth && proposalId && dismissedModalProposalId !== proposalId
  );

  return (
    <div className="space-y-6">
      {/* POPUP MODAL: Human-in-the-Loop Execution Gate (Appears automatically for valid live proposals) */}
      {isApprovalModalOpen && proposalId && summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hitl-modal-title"
        >
          <div className="w-full max-w-2xl bg-[#121824] border-2 border-emerald-500/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-emerald-950/30 border-b border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 id="hitl-modal-title" className="text-base font-bold text-white">
                      Human-in-the-Loop Authorization Required
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      STAGE 06 · READY FOR SIGNING
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mt-0.5">
                    All 5 pre-execution security gates passed. Review and explicitly approve or decline this transaction.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissedModalProposalId(proposalId)}
                disabled={isAuthorizing}
                title="Close popup to inspect full technical evidence"
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-border">
                  <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px] block">
                    Action &amp; Verified Amount
                  </span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block tabular-nums">
                    {summary.action}: {summary.amount} {summary.asset}
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Network: Ethereum Sepolia (11155111)
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-border">
                  <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px] block">
                    Verified Recipient ({summary.recipientAlias})
                  </span>
                  <span
                    className="font-mono text-gray-200 mt-1 block break-all text-xs"
                    title={summary.recipientAddress}
                  >
                    {summary.recipientAddress}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-border">
                  <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px] block">
                    Deterministic Policy &amp; Simulation
                  </span>
                  <span className="text-emerald-300 font-semibold mt-1 block">
                    PASS — Allowed by SQLite Policy
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Simulated Gas: {summary.gasEstimated || "12000"} units (Floor: 21000)
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-border">
                  <span className="text-gray-400 uppercase tracking-wider font-semibold text-[10px] block">
                    Proposal ID &amp; AI Provenance
                  </span>
                  <span className="font-mono text-accent-blue mt-1 block truncate" title={proposalId}>
                    {proposalId}
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Source: {prepareResult?.aiProvenance || "LIVE_AI"} ({prepareResult?.aiProviderUsed || "groq"})
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0B0F17] border border-border/80">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block">
                  IIP Keccak-256 Cryptographic Digest (Tamper-Proof Commitment)
                </span>
                <code className="text-[11px] font-mono text-accent-blue break-all mt-1 block">
                  {summary.proofDigest}
                </code>
              </div>
            </div>

            {/* Modal Footer with Decline / Inspect / Approve Buttons */}
            <div className="px-6 py-4 bg-[#0B0F17]/90 border-t border-border flex items-center justify-between flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setDismissedModalProposalId(proposalId)}
                disabled={isAuthorizing}
                className="px-3.5 py-2.5 bg-surface border border-border text-gray-300 font-medium rounded-lg hover:bg-surface-hover hover:text-white transition-colors text-xs flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Inspect Full Evidence First
              </button>

              <div className="flex items-center gap-2.5 flex-wrap">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={isAuthorizing}
                    className="px-4 py-2.5 bg-red-950/40 border border-red-500/40 text-red-300 font-medium rounded-lg hover:bg-red-900/50 hover:text-white disabled:opacity-50 transition-colors text-sm flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Decline / Cancel Proposal
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onAuthorize && onAuthorize(proposalId)}
                  disabled={isAuthorizing}
                  className="px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-md text-sm"
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
          </div>
        </div>
      )}

      {/* 1. Phase 1 Authorization Gate (Placed at TOP of EvidencePanel so it is immediately visible inline) */}
      {isReadyForAuth && proposalId && summary && (
        <div className="border-2 border-emerald-500/40 bg-surface rounded-xl overflow-hidden shadow-lg p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Lock className="w-4 h-4 text-emerald-400" />
                <h4 className="font-semibold text-foreground text-sm">
                  Human-in-the-Loop Execution Gate
                </h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  PREPARED · READY FOR SIGNING
                </span>
              </div>
              <p className="text-xs text-gray-400">
                All deterministic policy checks, calldata verifications, and Sepolia simulations passed. Explicit human authorization is required before blockchain broadcast.
              </p>
              <div className="text-[11px] font-mono text-gray-500 pt-1">
                Proposal ID: <span className="text-accent-blue">{proposalId}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {dismissedModalProposalId === proposalId && (
                <button
                  type="button"
                  onClick={() => setDismissedModalProposalId(null)}
                  className="px-3.5 py-2 bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 font-medium rounded-lg hover:bg-emerald-900/40 transition-colors text-xs"
                >
                  Open Approval Popup
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPreExecutionReview((prev) => !prev)}
                className="px-3.5 py-2 bg-background border border-border text-gray-300 font-medium rounded-lg hover:bg-surface-hover hover:text-white transition-colors text-xs"
              >
                {showPreExecutionReview ? "Hide Review Card" : "Review Transaction"}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isAuthorizing}
                  className="px-4 py-2.5 bg-red-950/30 border border-red-500/40 text-red-300 font-medium rounded-lg hover:bg-red-900/40 hover:text-white disabled:opacity-50 transition-colors text-sm"
                >
                  Cancel Proposal
                </button>
              )}
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

          {showPreExecutionReview && (
            <div className="border-t border-border/60 pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-background border border-border">
                  <span className="text-gray-500 uppercase tracking-wider font-semibold text-[10px] block">
                    Sender Wallet
                  </span>
                  <span className="font-mono text-gray-200 mt-1 block truncate" title={walletAddress || "Configured Agent Signer"}>
                    {walletAddress || "Owner Agent Wallet"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <span className="text-gray-500 uppercase tracking-wider font-semibold text-[10px] block">
                    Verified Recipient ({summary.recipientAlias})
                  </span>
                  <span className="font-mono text-gray-200 mt-1 block truncate" title={summary.recipientAddress}>
                    {summary.recipientAddress}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <span className="text-gray-500 uppercase tracking-wider font-semibold text-[10px] block">
                    Network &amp; Asset Amount
                  </span>
                  <span className="font-semibold text-emerald-400 mt-1 block tabular-nums">
                    {summary.amount} {summary.asset} · Sepolia (11155111)
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <span className="text-gray-500 uppercase tracking-wider font-semibold text-[10px] block">
                    Estimated Gas &amp; Broadcast Floor
                  </span>
                  <span className="font-mono text-gray-200 mt-1 block">
                    Sim: {summary.gasEstimated || "12000"} · Floor: 21000 gas
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20">
                  <span className="text-emerald-400/90 font-semibold block">Policy Engine Verdict</span>
                  <span className="text-gray-300 mt-0.5 block">
                    ALLOW — Within Max Transfer Limit &amp; Trusted Contact Policy
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-950/15 border border-emerald-500/20">
                  <span className="text-emerald-400/90 font-semibold block">Sepolia Pre-Flight Simulation</span>
                  <span className="text-gray-300 mt-0.5 block">
                    PASS — Calldata &amp; Balance Verified On-Chain
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-blue-950/15 border border-accent-blue/20">
                  <span className="text-accent-blue font-semibold block">What Happens After Approval</span>
                  <span className="text-gray-300 mt-0.5 block">
                    Gate 6.5 Revalidation → CAS Lock → Journal Write → Sepolia Broadcast
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Demo Fixture Isolation Card (Placed at TOP when running DEMO / SIMULATED fixtures) */}
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
                This scenario is an educational simulation. By architectural design, security demonstration fixtures are permanently isolated from the wallet signing key and cannot be approved or broadcast. Run a live transfer (e.g., &ldquo;Send 0.0001 ETH to alice&rdquo;) to trigger the Human-in-the-Loop Approval Popup.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            NON-EXECUTABLE DEMO
          </span>
        </div>
      )}

      {/* Blocked Security Barrier (Placed at TOP for genuine blocked live commands) */}
      {isBlocked && !isDemo && (
        <div className="border border-red-500/30 bg-red-950/10 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="font-semibold text-sm text-red-300">
                  Execution Permanently Prohibited
                </h5>
                {!analysis && prepareResult?.aiProvenance && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                    prepareResult.aiProvenance === 'LIVE_AI'
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  }`}>
                    {prepareResult.aiProvenance === 'LIVE_AI'
                      ? prepareResult.aiProviderUsed === 'groq'
                        ? `GROQ AI · ${prepareResult.aiModelUsed || 'openai/gpt-oss-120b'}`
                        : prepareResult.aiProviderUsed === 'gemini'
                        ? `GEMINI AI · ${prepareResult.aiModelUsed || 'gemini-3.8-flash'}`
                        : 'LIVE AI'
                      : 'FALLBACK PARSER'}
                  </span>
                )}
              </div>
              {prepareResult?.error && (
                <p className="text-xs text-red-200/90 mt-1 font-medium">
                  {prepareResult.error}
                </p>
              )}
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

      {/* 2. Milestone R7 / R7.1 Intent Comparison Panel */}
      {analysis && (
        <IntentComparisonPanel
          analysis={analysis}
          exposure={prepareResult?.exposure}
          explanation={prepareResult?.explanation}
          summary={summary}
          isBlocked={isBlocked}
          isDemo={isDemo}
          error={prepareResult?.error}
          aiProvenance={prepareResult?.aiProvenance}
          aiProviderUsed={prepareResult?.aiProviderUsed}
          aiModelUsed={prepareResult?.aiModelUsed}
        />
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
                {safeJsonStringify(prepareResult)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

