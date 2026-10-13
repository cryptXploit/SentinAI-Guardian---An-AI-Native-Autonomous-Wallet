"use client";

import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  Lock,
  Sparkles,
} from "lucide-react";
import { TransactionAnalysisResult } from "@/core/security/transaction-analyzer";
import { ApprovalExposureAnalysis } from "@/core/security/approval-analyzer";
import { SecurityExplanationResult } from "@/core/ai/security-explainer";
import { ProposalSummary } from "@/app/actions/orchestrator";

interface IntentComparisonPanelProps {
  analysis?: TransactionAnalysisResult;
  exposure?: ApprovalExposureAnalysis;
  explanation?: SecurityExplanationResult;
  summary?: ProposalSummary;
  isBlocked?: boolean;
  isDemo?: boolean;
  error?: string;
}

export default function IntentComparisonPanel({
  analysis,
  exposure,
  explanation,
  summary,
  isBlocked = false,
  isDemo = false,
}: IntentComparisonPanelProps) {
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!analysis) {
    return null;
  }

  const { expectedAction, decodedAction, mismatches, findings, status, canExecute } = analysis;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const hasMethodMismatch = mismatches.includes("TRANSACTION_METHOD_MISMATCH");
  const hasTokenMismatch = mismatches.includes("TOKEN_CONTRACT_MISMATCH");
  const hasAmountMismatch =
    mismatches.includes("APPROVAL_AMOUNT_MISMATCH") ||
    mismatches.includes("TRANSFER_AMOUNT_MISMATCH") ||
    mismatches.includes("UNLIMITED_APPROVAL_MISMATCH");
  const hasRecipientMismatch =
    mismatches.includes("RECIPIENT_MISMATCH") || mismatches.includes("SPENDER_MISMATCH");
  const hasNetworkMismatch = mismatches.includes("WRONG_CHAIN");
  const hasCalldataMismatch = mismatches.includes("UNSUPPORTED_CALLDATA");
  const hasNativeValueMismatch = mismatches.includes("UNEXPECTED_NATIVE_VALUE");

  return (
    <div className="space-y-4">
      {/* 1. Header Banner */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          !canExecute || isBlocked
            ? "bg-red-950/20 border-red-500/30 text-red-300"
            : status === "SUSPICIOUS"
            ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
            : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
        }`}
      >
        <div className="flex items-center gap-3">
          {!canExecute || isBlocked ? (
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          ) : status === "SUSPICIOUS" ? (
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm tracking-wide uppercase">
                Intent-to-Transaction Semantic Verification
              </h4>
              {isDemo && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  DEMO / SIMULATED
                </span>
              )}
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              {!canExecute || isBlocked
                ? "EXECUTION BLOCKED — Deterministic verification detected unauthorized or malicious parameters."
                : status === "SUSPICIOUS"
                ? "ELEVATED RISK — Review warnings before proceeding with authorization."
                : isDemo
                ? "SIMULATED COMPLIANT — Fixture inputs conform to deterministic policy rules (Demonstration Only)."
                : "POLICY COMPLIANT — Transaction calldata matches requested intent and adheres to user policy."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              SIMULATED
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${
              !canExecute || isBlocked
                ? "bg-red-500/20 text-red-400 border-red-500/40"
                : status === "SUSPICIOUS"
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* 2. Side-by-Side Comparison Table (WHAT YOU REQUESTED vs WHAT THE TRANSACTION REQUESTS) */}
      <div className="bg-[#121824] border border-border rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-3 border-b border-border bg-[#0B0F17]/60 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Semantic Integrity Comparison
          </span>
          <span className="text-xs text-gray-500 font-mono">
            {mismatches.length === 0 ? "0 Mismatches" : `${mismatches.length} Mismatch Warning(s)`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-gray-400 bg-[#0B0F17]/30">
                <th className="py-2.5 px-4 font-medium w-1/4">Parameter</th>
                <th className="py-2.5 px-4 font-medium w-3/8 text-blue-400">What You Requested</th>
                <th className="py-2.5 px-4 font-medium w-3/8 text-purple-400">Actual Transaction Bytecode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {/* Row 1: Action / Method */}
              <tr className={hasMethodMismatch ? "bg-red-950/20 text-red-300" : ""}>
                <td className="py-3 px-4 font-medium text-gray-400">Operation Type</td>
                <td className="py-3 px-4 font-mono">{expectedAction.action}</td>
                <td className="py-3 px-4 font-mono flex items-center justify-between">
                  <span>{decodedAction.method}</span>
                  {hasMethodMismatch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      METHOD MISMATCH
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 2: Asset / Contract */}
              <tr className={hasTokenMismatch ? "bg-red-950/20 text-red-300" : ""}>
                <td className="py-3 px-4 font-medium text-gray-400">Asset / Contract</td>
                <td className="py-3 px-4 font-mono">{expectedAction.asset}</td>
                <td className="py-3 px-4 font-mono flex items-center justify-between">
                  <span className="truncate max-w-[200px]" title={decodedAction.targetContract}>
                    {decodedAction.tokenSymbol} ({decodedAction.targetContract.slice(0, 10)}...)
                  </span>
                  {hasTokenMismatch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      TOKEN CONTRACT MISMATCH
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 3: Amount / Allowance */}
              <tr className={hasAmountMismatch ? "bg-red-950/20 text-red-300" : ""}>
                <td className="py-3 px-4 font-medium text-gray-400">Amount / Allowance</td>
                <td className="py-3 px-4 font-mono font-semibold">
                  {expectedAction.amount} {expectedAction.asset}
                </td>
                <td className="py-3 px-4 font-mono font-semibold flex items-center justify-between">
                  <span className={hasAmountMismatch ? "text-red-400" : ""}>
                    {decodedAction.formattedAmount} {decodedAction.tokenSymbol}
                  </span>
                  {hasAmountMismatch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      AMOUNT MISMATCH
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 4: Destination / Spender */}
              <tr className={hasRecipientMismatch ? "bg-red-950/20 text-red-300" : ""}>
                <td className="py-3 px-4 font-medium text-gray-400">
                  {analysis.operationType === "ERC20_APPROVE" ? "Approved Spender" : "Recipient Address"}
                </td>
                <td className="py-3 px-4 font-mono truncate max-w-[180px]" title={expectedAction.resolvedRecipient}>
                  {expectedAction.resolvedRecipient || "None"}
                </td>
                <td className="py-3 px-4 font-mono flex items-center justify-between">
                  <span className="truncate max-w-[200px]" title={decodedAction.recipientOrSpender}>
                    {decodedAction.recipientOrSpender || "None"}
                  </span>
                  {hasRecipientMismatch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      ADDRESS MISMATCH
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 5: Network / Chain */}
              <tr className={hasNetworkMismatch ? "bg-red-950/20 text-red-300" : ""}>
                <td className="py-3 px-4 font-medium text-gray-400">Network Target</td>
                <td className="py-3 px-4 font-mono">Ethereum Sepolia (11155111)</td>
                <td className="py-3 px-4 font-mono flex items-center justify-between">
                  <span>Sepolia Testnet</span>
                  {hasNetworkMismatch && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      WRONG CHAIN
                    </span>
                  )}
                </td>
              </tr>

              {/* Conditional Row: Calldata Selector Mismatch */}
              {hasCalldataMismatch && (
                <tr className="bg-red-950/20 text-red-300">
                  <td className="py-3 px-4 font-medium text-gray-400">Calldata Integrity</td>
                  <td className="py-3 px-4 font-mono">Standard ERC-20 / Native</td>
                  <td className="py-3 px-4 font-mono flex items-center justify-between">
                    <span>Unrecognized Function Selector</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      UNSUPPORTED CALLDATA
                    </span>
                  </td>
                </tr>
              )}

              {/* Conditional Row: Unexpected Native Value */}
              {hasNativeValueMismatch && (
                <tr className="bg-red-950/20 text-red-300">
                  <td className="py-3 px-4 font-medium text-gray-400">Native Value Attached</td>
                  <td className="py-3 px-4 font-mono">0 ETH (ERC-20 only)</td>
                  <td className="py-3 px-4 font-mono flex items-center justify-between">
                    <span>{decodedAction.nativeValueWei} Wei</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/30 text-red-400 border border-red-500/50">
                      UNEXPECTED ETH
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Approval Exposure Intelligence (if APPROVE operation) */}
      {exposure && (
        <div className="p-4 rounded-xl bg-[#121824] border border-border shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              <h5 className="text-sm font-semibold text-foreground">ERC-20 Approval Exposure Analysis</h5>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                exposure.isUnlimited
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : exposure.exceedsPolicyCap
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              }`}
            >
              {exposure.isUnlimited ? "UNLIMITED ALLOWANCE" : "BOUNDED ALLOWANCE"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-border/50">
              <p className="text-gray-400">Current Allowance</p>
              <p className="text-sm font-semibold mt-1 font-mono">
                {exposure.currentAllowanceFormatted} {exposure.tokenSymbol}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-border/50">
              <p className="text-gray-400">Proposed Allowance</p>
              <p
                className={`text-sm font-semibold mt-1 font-mono ${
                  exposure.isUnlimited ? "text-red-400" : "text-foreground"
                }`}
              >
                {exposure.proposedAllowanceFormatted} {exposure.tokenSymbol}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-border/50">
              <p className="text-gray-400">Allowance Delta</p>
              <p className="text-sm font-semibold mt-1 font-mono text-purple-400">
                {exposure.deltaFormatted}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed bg-[#0B0F17]/40 p-2.5 rounded-lg border border-border/40">
            <span className="text-purple-300 font-semibold">Permission Scope: </span>
            {exposure.permissionExplanation}
          </p>
        </div>
      )}

      {/* 4. Grounded AI / Deterministic Security Explanation */}
      {explanation && (
        <div className="p-4 rounded-xl bg-[#121824] border border-border shadow-md space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-blue" />
              <h5 className="text-sm font-semibold text-foreground">Transaction Security Explanation</h5>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-[#0B0F17] border border-border">
              {explanation.source === "GEMINI_AI"
                ? `Google Gemini (${explanation.modelUsed || "gemini-2.5-flash"}) · ${explanation.latencyMs}ms`
                : "Deterministic Policy Engine"}
            </span>
          </div>

          <p className="text-xs text-gray-200 leading-relaxed bg-[#0B0F17]/60 p-3 rounded-lg border border-border/50">
            {explanation.explanationText}
          </p>

          {explanation.keyPoints && explanation.keyPoints.length > 0 && (
            <ul className="space-y-1 text-xs text-gray-400 pl-4 list-disc">
              {explanation.keyPoints.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          )}

          {explanation.recommendedAction && (
            <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-xs">
              <span className="text-gray-400">Recommended Operator Action:</span>
              <span
                className={`font-semibold ${
                  canExecute ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {explanation.recommendedAction}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 5. Detailed Security Findings List */}
      {findings && findings.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
            Security Findings ({findings.length})
          </span>
          <div className="space-y-2">
            {findings.map((f, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                  f.severity === "CRITICAL"
                    ? "bg-red-950/20 border-red-500/30 text-red-300"
                    : f.severity === "HIGH"
                    ? "bg-orange-950/20 border-orange-500/30 text-orange-300"
                    : f.severity === "MEDIUM"
                    ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
                    : "bg-[#0B0F17] border-border text-gray-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        f.severity === "CRITICAL"
                          ? "bg-red-500/20 text-red-400 border-red-500/40"
                          : f.severity === "HIGH"
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                          : f.severity === "MEDIUM"
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/40"
                      }`}
                    >
                      {f.severity}
                    </span>
                    <span className="font-semibold text-foreground">{f.title}</span>
                  </div>
                  <p className="mt-1 text-gray-300 leading-relaxed">{f.explanation}</p>
                </div>
                <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                  {f.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Expandable Technical Calldata & IIP Cryptographic Digest */}
      <div className="border border-border/60 bg-[#0B0F17]/80 rounded-xl overflow-hidden text-xs">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-gray-400 hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2 font-mono">
            <Cpu className="w-3.5 h-3.5 text-accent-blue" />
            EVM Technical Details &amp; Cryptographic Proof
          </span>
          {showTechnicalDetails ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showTechnicalDetails && (
          <div className="p-4 border-t border-border/40 space-y-3 bg-[#0B0F17]">
            {summary?.proofDigest && (
              <div>
                <div className="flex items-center justify-between text-gray-400 mb-1">
                  <span>Keccak-256 Intent Integrity Proof (IIP) Digest:</span>
                  <button
                    onClick={() => copyToClipboard(summary.proofDigest)}
                    className="flex items-center gap-1 text-[11px] text-accent-blue hover:underline"
                  >
                    {copiedDigest ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copiedDigest ? "Copied!" : "Copy Digest"}
                  </button>
                </div>
                <code className="block p-2 rounded bg-surface border border-border font-mono text-[11px] break-all text-accent-blue">
                  {summary.proofDigest}
                </code>
              </div>
            )}

            <div>
              <span className="text-gray-400 block mb-1">Target Contract Address:</span>
              <code className="block p-2 rounded bg-surface border border-border font-mono text-[11px] break-all text-gray-300">
                {decodedAction.targetContract}
              </code>
            </div>

            <div>
              <span className="text-gray-400 block mb-1">EVM Function Method Selector:</span>
              <code className="block p-2 rounded bg-surface border border-border font-mono text-[11px] text-purple-300">
                {decodedAction.method}
              </code>
            </div>

            {summary?.gasEstimated && (
              <div>
                <span className="text-gray-400 block mb-1">Simulated Gas Limit:</span>
                <span className="font-mono text-gray-300">{summary.gasEstimated} units</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
