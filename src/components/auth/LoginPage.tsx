"use client";

import { useState } from "react";
import { Shield, Loader2, LogIn, AlertCircle } from "lucide-react";

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onAuthenticated();
      } else {
        setError(data.error || "Authentication failed.");
        setPassword("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-blue/10 mb-4">
            <Shield className="w-8 h-8 text-accent-blue" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            SentinAI Guardian
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Authenticate to access the Agent Console
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            name="username"
            value="operator"
            autoComplete="username"
            className="hidden"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1.5">
              Operator Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="Enter operator password"
              autoComplete="current-password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-lg px-4 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="w-full bg-accent-blue text-white font-medium rounded-lg px-4 py-3 hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          Sepolia Testnet Only · AI-Native Autonomous Wallet
        </p>
      </div>
    </div>
  );
}
