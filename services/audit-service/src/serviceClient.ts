import { withCorrelationHeader } from "@approvalflow/logging";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;

// Lets F9's trail lookup accept a submitter-facing pretty id (e.g. "INV-2026-0001"),
// not just the raw tracking/correlation id - submission-service is the only service that
// knows the pretty-id mapping. Falls back to the input unchanged for anything it doesn't
// recognize (a correlation id, or a genuinely unknown id) so existing lookups keep working.
export async function resolveTrackingId(id: string): Promise<string> {
  try {
    const res = await fetch(`${DAPR_BASE}/invoke/submission-service/method/invoices/${encodeURIComponent(id)}/status`);
    if (!res.ok) return id;
    const body = (await res.json()) as { trackingId?: string };
    return body.trackingId ?? id;
  } catch {
    return id;
  }
}

// F2: pushes the real status to submission-service - nothing else ever updated it past "pending".
export async function pushInvoiceStatus(
  trackingId: string,
  correlationId: string,
  status: string,
  reason: string
): Promise<void> {
  const res = await fetch(`${DAPR_BASE}/invoke/submission-service/method/invoices/${trackingId}/status`, {
    method: "PATCH",
    headers: withCorrelationHeader(correlationId, { "Content-Type": "application/json" }),
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) {
    throw new Error(`failed to push status to submission-service: ${res.status} ${await res.text()}`);
  }
}
