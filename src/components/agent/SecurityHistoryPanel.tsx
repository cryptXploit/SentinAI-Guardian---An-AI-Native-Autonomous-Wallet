"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, RefreshCw, ExternalLink, Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  getProposalHistoryAction,
  recoverPostBroadcastProposalAction,
  ProposalHistoryItem,
} from "@/app/actions/orchestrator";

export default function SecurityHistoryPanel({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [proposals, setProposals] = useState<ProposalHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await getProposalHistoryAction();
      setProposals(res.proposals || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchHistory();
  };

  const handleRecoverProposal = async (proposalId: string) => {
    if (reconcilingId) return;
    setReconcilingId(proposalId);
    try {
      const res = await recoverPostBroadcastProposalAction(proposalId);
      if (!res.success && res.error) {
        setError(res.error);
      } else {
        setError(null);
      }
      await fetchHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReconcilingId(null);
    }
  };

  useEffect(() => {
    let active = true;
    getProposalHistoryAction()
      .then((res) => {
        if (!active) return;
        setProposals(res.proposals || []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  const getStateBadge = (state: string) => {
    switch (state) {
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            CONFIRMED
          </span>
        );
      case "PREPARED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" />
            PREPARED (AWAITING AUTH)
          </span>
        );
      case "SUBMITTED":
      case "SUBMITTING":
      case "AUTHORIZED":
      case "RECONCILIATION_REQUIRED":
      case "EXECUTION_UNKNOWN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            {state}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            <XCircle className="w-3 h-3" />
            {state}
          </span>
        );
    }
  };

  return (
    <section id="security-center" className="bg-surface border border-border rounded-xl p-6 scroll-mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent-blue" />
            Security Center &amp; Execution Audit Trail
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Persistent SQLite ledger of prepared transaction proposals, cryptographic digests, and state transitions.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background border border-border text-gray-300 hover:text-white hover:border-accent-blue transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Audit Log
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="p-8 text-center bg-background/60 border border-border/60 rounded-lg">
          <p className="text-sm text-gray-400">
            {isLoading
              ? "Loading persistent proposal records..."
              : "No transaction proposals recorded for this operator session yet."}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Submit a transfer or approval command in the Agent Command Center above to create a cryptographically bound proposal.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0B0F17] border-b border-border text-gray-400">
                <th className="py-2.5 px-3 font-medium">Action &amp; Summary</th>
                <th className="py-2.5 px-3 font-medium">Execution State</th>
                <th className="py-2.5 px-3 font-medium">IIP Keccak-256 Digest</th>
                <th className="py-2.5 px-3 font-medium">Tx Hash / Details</th>
                <th className="py-2.5 px-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {proposals.map((item) => (
                <tr key={item.id} className="hover:bg-surface-hover/40 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-mono font-semibold text-foreground">{item.action}</div>
                    <div className="text-gray-400 mt-0.5">
                      {item.amount} {item.asset} &rarr; {item.recipientAlias} ({item.targetAddress.slice(0, 8)}...)
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 mt-0.5" title={item.id}>
                      ID: {item.id.slice(0, 8)}... · {item.provenance}
                    </div>
                  </td>
                  <td className="py-3 px-3 align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      {getStateBadge(item.status)}
                      {["RECONCILIATION_REQUIRED", "SUBMITTING", "SUBMITTED", "EXECUTION_UNKNOWN"].includes(
                        item.status
                      ) && (
                        <button
                          type="button"
                          onClick={() => handleRecoverProposal(item.id)}
                          disabled={reconcilingId === item.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent-blue/15 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/25 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${reconcilingId === item.id ? "animate-spin" : ""}`} />
                          Reconcile Receipt
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 align-top font-mono text-gray-400" title={item.digest}>
                    {item.digest.slice(0, 10)}...{item.digest.slice(-8)}
                  </td>
                  <td className="py-3 px-3 align-top">
                    {item.txHash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-accent-blue hover:underline"
                        title={item.txHash}
                      >
                        {item.txHash.slice(0, 10)}...{item.txHash.slice(-6)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-500 font-mono">Not broadcast</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top text-gray-400 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
