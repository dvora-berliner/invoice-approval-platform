import type { StoredUser } from "./types";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const STATE_STORE = "statestore"; // shared Redis store (unscoped) - keys namespaced below
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;

const userKeyOf = (username: string) => `user:${username}`;

export async function getUser(username: string): Promise<StoredUser | null> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${userKeyOf(username)}`);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as StoredUser) : null;
}

// ADR-0007-style create-only claim (same pattern as submission-service's
// claimDedupKey): only the first registration per username wins.
export async function createUser(user: StoredUser): Promise<boolean> {
  const getRes = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${userKeyOf(user.username)}`);
  if (getRes.status !== 200 && getRes.status !== 204 && getRes.status !== 404) {
    throw new Error(`Dapr state get failed: ${getRes.status} ${await getRes.text()}`);
  }
  if (getRes.status === 200) return false; // username already taken

  const etag = getRes.headers.get("etag") ?? "";
  const putRes = await fetch(`${DAPR_BASE}/state/${STATE_STORE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ key: userKeyOf(user.username), value: user, etag, options: { concurrency: "first-write" } }]),
  });
  return putRes.ok;
}
