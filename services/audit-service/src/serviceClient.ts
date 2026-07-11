import { withCorrelationHeader } from "@approvalflow/logging";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;

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
