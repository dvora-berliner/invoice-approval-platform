import type { Request } from "express";
import { withCorrelationHeader } from "@approvalflow/logging";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3500";
const DAPR_BASE = `http://localhost:${DAPR_HTTP_PORT}/v1.0`;

export interface UpstreamResponse {
  status: number;
  body: unknown;
}

// Forwards the request to a backend service's Dapr sidecar (sync invocation), preserving
// method, body and the correlation id (M14) - and the backend's actual status/body, not a
// hardcoded 200, so callers see real errors instead of a false success.
export async function invokeService(appId: string, method: string, req: Request): Promise<UpstreamResponse> {
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const headers = withCorrelationHeader(req.correlationId, { "Content-Type": "application/json" });
  if (req.user) {
    headers["x-user-username"] = req.user.username;
    headers["x-user-role"] = req.user.role;
  }
  const res = await fetch(`${DAPR_BASE}/invoke/${appId}/method/${method}`, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
