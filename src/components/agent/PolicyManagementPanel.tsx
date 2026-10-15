"use client";

import { useEffect, useState } from "react";
import { Settings, Plus, Trash2, Save, CheckCircle2, AlertTriangle, ShieldCheck, History, UserCheck } from "lucide-react";
import { getActivePolicyAction, updateUserPolicyAction } from "@/app/actions/orchestrator";
import type { PolicyAuditEntry } from "@/core/policy/user-policy";
import type { TokenApprovalPolicy } from "@/core/domain/schemas";

interface PolicyManagementPanelProps {
  walletAddress?: string;
}

export default function PolicyManagementPanel({ walletAddress }: PolicyManagementPanelProps) {
  const [maxTransferETH, setMaxTransferETH] = useState<string>("1.0");
  const [trustedContacts, setTrustedContacts] = useState<Record<string, string>>({});
  const [tokenApprovalPolicies, setTokenApprovalPolicies] = useState<Record<string, TokenApprovalPolicy>>({});
  const [auditLogs, setAuditLogs] = useState<PolicyAuditEntry[]>([]);

  const [newAlias, setNewAlias] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getActivePolicyAction()
      .then((res) => {
        if (!active) return;
        setMaxTransferETH(String(res.policy.maxTransferAmountETH));
        setTrustedContacts(res.policy.trustedContacts || {});
        setTokenApprovalPolicies(res.policy.tokenApprovalPolicies || {});
        setAuditLogs(res.auditLogs || []);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatusMessage({ type: "error", text: (err as Error).message });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSavePolicy = async (
    actionName: string,
    nextMaxETH: string,
    nextContacts: Record<string, string>,
    successLabel: string
  ) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await updateUserPolicyAction({
        action: actionName,
        maxTransferAmountETH: nextMaxETH,
        trustedContacts: nextContacts,
      });
      if (res.success && res.policy) {
        setMaxTransferETH(String(res.policy.maxTransferAmountETH));
        setTrustedContacts(res.policy.trustedContacts);
        if (res.auditLogs) {
          setAuditLogs(res.auditLogs);
        }
        setStatusMessage({ type: "success", text: successLabel });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Policy update rejected by server validation.",
        });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: (err as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(maxTransferETH);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatusMessage({ type: "error", text: "Invalid ETH transfer limit." });
      return;
    }
    await handleSavePolicy(
      "UPDATE_TRANSFER_LIMIT",
      maxTransferETH.trim(),
      trustedContacts,
      `Updated max ETH transfer limit to ${maxTransferETH.trim()} ETH.`
    );
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAlias = newAlias.trim().toLowerCase();
    const cleanAddr = newAddress.trim();
    if (!cleanAlias || !cleanAddr) return;

    const nextContacts = {
      ...trustedContacts,
      [cleanAlias]: cleanAddr,
    };
    await handleSavePolicy(
      `UPSERT_CONTACT:${cleanAlias}`,
      maxTransferETH || "1.0",
      nextContacts,
      `Trusted contact '${cleanAlias}' bound to ${cleanAddr}.`
    );
    setNewAlias("");
    setNewAddress("");
  };

  const handleRemoveContact = async (alias: string) => {
    const nextContacts = { ...trustedContacts };
    delete nextContacts[alias];
    await handleSavePolicy(
      `REMOVE_CONTACT:${alias}`,
      maxTransferETH || "1.0",
      nextContacts,
      `Removed contact '${alias}' from trusted contacts.`
    );
  };

  const handleSetAliceToTestWallet = async () => {
    if (!walletAddress || !walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      setStatusMessage({
        type: "error",
        text: "No valid test wallet address configured in environment.",
      });
      return;
    }
    const nextContacts = {
      ...trustedContacts,
      alice: walletAddress,
    };
    await handleSavePolicy(
      "BIND_ALICE_TO_TEST_WALLET",
      maxTransferETH || "1.0",
      nextContacts,
      `Configured 'alice' to your safe test wallet (${walletAddress}) for self-transfer testing.`
    );
  };

  return (
    <section id="policies" className="bg-surface border border-border rounded-xl p-6 scroll-mt-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-accent-blue" />
            Deterministic Security Policy Management
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Authenticated SQLite-backed policy configuration. Unconfigured contacts fail closed; third-party public addresses are strictly prohibited.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5" />
          SQLITE PERSISTED · FAIL-CLOSED
        </span>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1: Transfer Limit & Token Rules */}
        <div className="bg-background border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            1. Native ETH Transfer Cap
          </h3>
          <form onSubmit={handleUpdateLimit} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">
                Max Single Transfer Limit (ETH, Range: 0.0001 – 100.0)
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                max="100"
                value={maxTransferETH}
                onChange={(e) => setMaxTransferETH(e.target.value)}
                disabled={isLoading || isSaving}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-accent-blue"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || isSaving}
              className="px-4 py-2 bg-accent-blue text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save Limit
            </button>
          </form>

          <div className="pt-3 border-t border-border/60">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Enforced Sepolia ERC-20 Approval Caps
            </h4>
            <div className="space-y-1.5 text-xs">
              {Object.entries(tokenApprovalPolicies).map(([key, rule]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded bg-surface border border-border/50 font-mono"
                >
                  <span className="text-gray-300 truncate max-w-[200px]" title={key}>
                    {rule.tokenSymbol || key} ({rule.tokenContractAddress.slice(0, 8)}...)
                  </span>
                  <span className="text-emerald-400 font-semibold">
                    Max: 100 {rule.tokenSymbol} ({rule.allowedSpenders.length} spender)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Trusted Contacts Whitelist (CSF-02 Safe Configuration) */}
        <div className="bg-background border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              2. Trusted Recipient Contacts (CSF-02)
            </h3>
            {walletAddress && walletAddress.startsWith("0x") && walletAddress.length === 42 && (
              <button
                type="button"
                onClick={handleSetAliceToTestWallet}
                disabled={isLoading || isSaving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Bind &apos;alice&apos; to My Test Wallet
              </button>
            )}
          </div>

          {Object.keys(trustedContacts).length === 0 ? (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              No trusted contacts configured. Commands referencing contact aliases (such as &quot;alice&quot;) will fail closed until explicitly bound to an approved test address.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(trustedContacts).map(([alias, address]) => (
                <div
                  key={alias}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface border border-border text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-accent-blue font-mono">{alias}</span>
                    <p className="text-[11px] font-mono text-gray-400 truncate mt-0.5" title={address}>
                      {address}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveContact(alias)}
                    disabled={isSaving}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                    title={`Remove ${alias}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddContact} className="pt-2 border-t border-border/60 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Alias (e.g. alice)"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                disabled={isLoading || isSaving}
                className="bg-surface border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-accent-blue"
              />
              <input
                type="text"
                placeholder="0x... Sepolia Test Address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                disabled={isLoading || isSaving}
                className="sm:col-span-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-accent-blue"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || isSaving || !newAlias.trim() || !newAddress.trim()}
              className="w-full py-1.5 bg-surface-hover border border-border text-xs font-medium text-gray-200 hover:text-white hover:border-accent-blue rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add / Update Trusted Contact
            </button>
          </form>
        </div>
      </div>

      {/* Policy Mutation Audit Log */}
      {auditLogs.length > 0 && (
        <div className="bg-background border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5 text-accent-blue" />
            Policy Mutation Audit Trail (SQLite)
          </h4>
          <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-surface/60 text-gray-400">
                <span className="truncate">
                  <strong className="text-emerald-400">{log.action}</strong> · Max ETH: {log.newPolicy.maxTransferAmountETH} · Contacts: {Object.keys(log.newPolicy.trustedContacts).length}
                </span>
                <span className="text-gray-500 shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
