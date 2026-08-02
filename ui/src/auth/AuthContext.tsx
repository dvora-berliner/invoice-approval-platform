import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthSession } from "./types";
import { clearSession, getSession, setSession } from "./session";
import { UNAUTHORIZED_EVENT } from "../api/client";

interface AuthContextValue {
  session: AuthSession | null;
  setAuthenticated: (session: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());

  const setAuthenticated = (next: AuthSession) => {
    setSession(next);
    setSessionState(next);
  };

  const logout = () => {
    clearSession();
    setSessionState(null);
  };

  useEffect(() => {
    const onUnauthorized = () => setSessionState(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  return <AuthContext.Provider value={{ session, setAuthenticated, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
