import { withCorrelationHeader } from "@approvalflow/logging";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const STATE_STORE = "statestore";
const PUBSUB = "pubsub";
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;

export async function getState<T>(key: string): Promise<T | null> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${key}`);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

export async function saveState(key: string, value: unknown): Promise<void> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ key, value }]),
  });
  if (!res.ok) {
    throw new Error(`Dapr state save failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteState(key: string): Promise<void> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${key}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`Dapr state delete failed: ${res.status} ${await res.text()}`);
  }
}

export interface StateWithEtag<T> {
  value: T | null;
  etag: string;
}

export async function getStateWithEtag<T>(key: string): Promise<StateWithEtag<T>> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${key}`);
  if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const etag = res.headers.get("etag") ?? "";
  if (res.status !== 200) return { value: null, etag };
  const text = await res.text();
  return { value: text ? (JSON.parse(text) as T) : null, etag };
}

// ADR-0007 pattern: a write only succeeds if the value hasn't changed since it was
// read - the caller retries on `false` with a fresh read.
export async function saveStateWithEtag(key: string, value: unknown, etag: string): Promise<boolean> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ key, value, etag, options: { concurrency: "first-write" } }]),
  });
  return res.ok;
}

// §10/M14: propagates the correlation id so decision-service/payment-service's logs
// join the same trail instead of their correlationMiddleware minting a new one.
export async function invokeService<T>(appId: string, method: string, body: unknown, correlationId?: string): Promise<T> {
  const headers = correlationId
    ? withCorrelationHeader(correlationId, { "Content-Type": "application/json" })
    : { "Content-Type": "application/json" };
  const res = await fetch(`${DAPR_BASE}/invoke/${appId}/method/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Dapr service invocation ${appId}/${method} failed: ${res.status} ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function publishEvent(topic: string, payload: unknown): Promise<void> {
  const res = await fetch(`${DAPR_BASE}/publish/${PUBSUB}/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Dapr publish to ${topic} failed: ${res.status} ${await res.text()}`);
  }
}
