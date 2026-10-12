"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ShieldX } from "lucide-react";

export default function EvidencePanel({ result }: { result: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isSuccess = result.success;

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
              {isSuccess ? "Transaction Authorized & Executed" : "Transaction Blocked by Security Policy"}
            </h3>
            
            {isSuccess && result.executionResult?.transactionHash ? (
              <p className="text-sm text-gray-300 mt-2 break-all">
                <span className="font-medium text-gray-400">Tx Hash:</span> {result.executionResult.transactionHash}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-300">
                  <span className="font-medium text-gray-400">Error:</span> {result.error || "Unknown error"}
                </p>
                {result.step && (
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-gray-400">Failed at Step:</span> {result.step}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {(result.iip || !isSuccess) && (
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
                {JSON.stringify(result.iip || result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
