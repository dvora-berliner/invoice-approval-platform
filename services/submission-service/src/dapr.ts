import { randomUUID } from "crypto";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const STATE_STORE = "submission-outbox-statestore"; // scoped to this service, see components/
const PUBSUB = "pubsub";
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;
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

export interface RecordWithEtag<T> {
  value: T | null;
  etag: string;
}

export async function getInvoiceRecordWithEtag<T>(key: string): Promise<RecordWithEtag<T>> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${key}`);
  if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const etag = res.headers.get("etag") ?? "";
  if (res.status !== 200) return { value: null, etag };
  const raw = await res.text();
  const inner = raw ? (JSON.parse(raw) as string) : null; // pre-stringified on save
  return { value: inner ? (JSON.parse(inner) as T) : null, etag };
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

export async function saveInvoiceRecordWithEtag(invoiceKey: string, invoiceValue: unknown, etag: string): Promise<boolean> {
  return conditionalSave(invoiceKey, JSON.stringify(invoiceValue), etag);
}

// Generic (single-encoded, unlike the invoice-record helpers above) - for indices/counters.
export async function getStateWithEtag<T>(key: string): Promise<RecordWithEtag<T>> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${key}`);
  if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const etag = res.headers.get("etag") ?? "";
  if (res.status !== 200) return { value: null, etag };
  const text = await res.text();
  return { value: text ? (JSON.parse(text) as T) : null, etag };
}

export async function saveStateWithEtag(key: string, value: unknown, etag: string): Promise<boolean> {
  return conditionalSave(key, value, etag);
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

export interface OutboxEntry {
  id: string;
  topic: string;
  payload: unknown;
}

const OUTBOX_QUEUE_KEY = "outbox:pending";

export interface OutboxQueueWithEtag {
  value: OutboxEntry[];
  etag: string;
}

export async function getOutboxQueueWithEtag(): Promise<OutboxQueueWithEtag> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/${OUTBOX_QUEUE_KEY}`);
  if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
    throw new Error(`Dapr state get failed: ${res.status} ${await res.text()}`);
  }
  const etag = res.headers.get("etag") ?? "";
  if (res.status !== 200) return { value: [], etag };
  const text = await res.text();
  return { value: text ? (JSON.parse(text) as OutboxEntry[]) : [], etag };
}

export async function saveOutboxQueueWithEtag(queue: OutboxEntry[], etag: string): Promise<boolean> {
  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ key: OUTBOX_QUEUE_KEY, value: queue, etag, options: { concurrency: "first-write" } }]),
  });
  return res.ok;
}

// Manual outbox (ARCHITECTURE.md Sec.9's fallback for Dapr's native outbox, which
// only supports one fixed publish topic per component): the record and the pending
// event are written in one transaction, so a crash between save and publish can't
// happen. outboxRelay.ts drains the queue and does the actual publish.
export async function saveInvoiceRecordWithOutboxEvent(
  invoiceKey: string,
  invoiceValue: unknown,
  invoiceEtag: string,
  topic: string,
  eventPayload: unknown
): Promise<boolean> {
  const { value: queue, etag: queueEtag } = await getOutboxQueueWithEtag();
  const nextQueue: OutboxEntry[] = [...queue, { id: randomUUID(), topic, payload: eventPayload }];

  const res = await fetch(`${DAPR_BASE}/state/${STATE_STORE}/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [
        {
          operation: "upsert",
          request: {
            key: invoiceKey,
            value: JSON.stringify(invoiceValue),
            etag: invoiceEtag,
            options: { concurrency: "first-write" },
          },
        },
        {
          operation: "upsert",
          request: { key: OUTBOX_QUEUE_KEY, value: nextQueue, etag: queueEtag, options: { concurrency: "first-write" } },
        },
      ],
    }),
  });
  return res.ok;
}
