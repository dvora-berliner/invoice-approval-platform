const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const STATE_STORE = "submission-outbox-statestore"; // scoped to this service, see components/
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

export async function getInvoiceRecord<T>(key: string): Promise<T | null> {
  const raw = await getState<string>(key); // pre-stringified on save
  return raw ? (JSON.parse(raw) as T) : null;
}

async function conditionalSave(key: string, value: unknown, etag: string): Promise<boolean> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ key, value, etag, options: { concurrency: "first-write" } }]),
  });
  return res.ok;
}

export type ClaimResult = { claimed: true } | { claimed: false; existingTrackingId: string };

// ADR-0007-style optimistic claim, separate from saveInvoiceRecord's transaction.
export async function claimDedupKey(
  dedupKey: string,
  invoiceKeyOf: (trackingId: string) => string,
  trackingId: string
): Promise<ClaimResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const getRes = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${dedupKey}`);
    if (getRes.status !== 200 && getRes.status !== 204 && getRes.status !== 404) {
      throw new Error(`Dapr state get failed: ${getRes.status} ${await getRes.text()}`);
    }

    if (getRes.status === 200) {
      const existingTrackingId = JSON.parse(await getRes.text()) as string;
      const existingRecord = await getState(invoiceKeyOf(existingTrackingId));
      if (existingRecord !== null) {
        return { claimed: false, existingTrackingId };
      }
    }

    const etag = getRes.headers.get("etag") ?? "";
    if (await conditionalSave(dedupKey, trackingId, etag)) {
      return { claimed: true };
    }
  }
  throw new Error(`Failed to claim dedup key ${dedupKey} after retries`);
}

export async function saveInvoiceRecord(invoiceKey: string, invoiceValue: unknown): Promise<void> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [
        { operation: "upsert", request: { key: invoiceKey, value: JSON.stringify(invoiceValue) } },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Dapr state transaction failed: ${res.status} ${await res.text()}`);
  }
}
