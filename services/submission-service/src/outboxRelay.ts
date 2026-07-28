import { createLogger } from "@approvalflow/logging";
import { getOutboxQueueWithEtag, saveOutboxQueueWithEtag, publishEvent, type OutboxEntry } from "./dapr";

// Drains events written transactionally in dapr.ts's saveInvoiceRecordWithOutboxEvent
// and publishes them. At-least-once delivery - subscribers must be idempotent.
const POLL_INTERVAL_MS = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 2000);
const MAX_ETAG_RETRIES = 5;

async function publishAndDrop(entries: OutboxEntry[], log: ReturnType<typeof createLogger>): Promise<string[]> {
  const publishedIds: string[] = [];
  for (const entry of entries) {
    try {
      await publishEvent(entry.topic, entry.payload);
      publishedIds.push(entry.id);
    } catch (err) {
      log.error("outbox relay failed to publish, will retry next cycle", {
        id: entry.id,
        topic: entry.topic,
        error: String(err),
      });
    }
  }
  return publishedIds;
}

export async function drainOutboxOnce(): Promise<void> {
  const log = createLogger("submission-service");
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value: queue, etag } = await getOutboxQueueWithEtag();
    if (queue.length === 0) return;

    const publishedIds = await publishAndDrop(queue, log);
    if (publishedIds.length === 0) return;

    const remaining = queue.filter((entry) => !publishedIds.includes(entry.id));
    if (await saveOutboxQueueWithEtag(remaining, etag)) return;
    // Someone else appended to the queue between our read and write - retry with a
    // fresh read. Entries we already published get re-published on the next attempt;
    // that's fine, delivery here is at-least-once by design.
  }
  log.error("outbox relay could not persist queue drain after retries (concurrent contention)");
}

let running = false;

export function startOutboxRelay(): NodeJS.Timeout {
  return setInterval(() => {
    if (running) return;
    running = true;
    drainOutboxOnce()
      .catch((err) => {
        createLogger("submission-service").error("outbox relay cycle failed", { error: String(err) });
      })
      .finally(() => {
        running = false;
      });
  }, POLL_INTERVAL_MS);
}
