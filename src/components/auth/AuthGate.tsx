"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import LoginPage from "@/components/auth/LoginPage";
import { Loader2, LogOut } from "lucide-react";

type AuthState = {
  authenticated: boolean;
  userId?: string;
  expiresAt?: number;
  loading: boolean;
};

const AuthContext = createContext<{
  auth: AuthState;
  logout: () => Promise<void>;
}>({
  auth: { authenticated: false, loading: true },
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function LogoutButton() {
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-foreground transition-colors disabled:opacity-50"
      title="Sign Out"
    >
      {isLoggingOut ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LogOut className="w-3.5 h-3.5" />
      )}
      <span className="hidden md:inline">Sign Out</span>
    </button>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    loading: true,
  });

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/login", { method: "GET" });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        setAuth({
          authenticated: true,
          userId: data.userId,
          expiresAt: data.expiresAt,
          loading: false,
        });
      } else {
        setAuth({ authenticated: false, loading: false });
      }
    } catch {
      setAuth({ authenticated: false, loading: false });
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/login", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data && data.authenticated) {
          setAuth({
            authenticated: true,
            userId: data.userId,
            expiresAt: data.expiresAt,
            loading: false,
          });
        } else {
          setAuth({ authenticated: false, loading: false });
        }
      })
      .catch(() => {
        if (active) setAuth({ authenticated: false, loading: false });
      });

    return () => {
      active = false;
    };
  }, []);

  // Periodic session check every 2 minutes
  useEffect(() => {
    if (!auth.authenticated) return;
    const interval = setInterval(checkSession, 120_000);
    return () => clearInterval(interval);
  }, [auth.authenticated, checkSession]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best effort
    }
    setAuth({ authenticated: false, loading: false });
  };

  const handleAuthenticated = () => {
    checkSession();
  };

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin text-accent-blue" />
          <span className="text-sm font-medium">Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <AuthContext.Provider value={{ auth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
