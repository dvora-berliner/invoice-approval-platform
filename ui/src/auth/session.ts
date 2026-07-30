import type { AuthSession } from "./types";

const STORAGE_KEY = "approvalflow.session";

// Plain module (not a React hook) so api/client.ts can read the current token
// without needing to be inside the component tree.
export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
