import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";

const DAPR_HOST = process.env.AUDIT_SERVICE_HOST ?? "audit-service";
const DAPR_HTTP_PORT = process.env.AUDIT_SERVICE_DAPR_HTTP_PORT ?? "3500";
const APP_PORT = process.env.AUDIT_SERVICE_APP_PORT ?? "3005";

const PUBLISH_URL = `http://${DAPR_HOST}:${DAPR_HTTP_PORT}/v1.0/publish/pubsub/InvoiceSubmitted`;
const trailUrl = (id: string) => `http://${DAPR_HOST}:${APP_PORT}/trail/${id}`;

// audit-service-dapr has no explicit healthcheck in docker-compose.yml, so the
// sidecar's HTTP port may not be bound yet even after the container "started" -
// on a cold CI runner (fresh image pulls, no build cache) this can take well
// over the 10s a fixed attempt-count loop previously allowed for.
async function waitForDaprSidecar(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${DAPR_HOST}:${DAPR_HTTP_PORT}/v1.0/healthz`);
      if (res.ok) return;
    } catch {
      // sidecar not up yet - retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("audit-service-dapr sidecar never became healthy");
}

async function pollTrail(
  trackingId: string,
  timeoutMs = 15_000
): Promise<{ events: Array<{ event_type: string; tracking_id: string }> }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(trailUrl(trackingId));
    if (res.status === 200) return res.json();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`decision trail for ${trackingId} never appeared`);
}

describe("submission -> audit, over a real Dapr pub/sub round trip", () => {
  beforeAll(async () => {
    await waitForDaprSidecar();
  });

  it("delivers InvoiceSubmitted through Redis pub/sub and audit-service persists it to Postgres", async () => {
    const trackingId = `itest-${randomUUID()}`;
    const correlationId = randomUUID();

    const publishRes = await fetch(PUBLISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackingId,
        correlationId,
        vendor: "Integration Test Vendor",
        invoiceNumber: "ITEST-0001",
        total: 42.5,
        submittedAt: new Date().toISOString(),
      }),
    });
    expect(publishRes.ok).toBe(true);

    const trail = await pollTrail(trackingId);
    expect(trail.events).toHaveLength(1);
    expect(trail.events[0].event_type).toBe("InvoiceSubmitted");
    expect(trail.events[0].tracking_id).toBe(trackingId);
  });
});
