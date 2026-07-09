const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const STATE_STORE = "statestore";
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
