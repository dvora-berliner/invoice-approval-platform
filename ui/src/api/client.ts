import type {
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  ApprovalQueueItem,
  CeilingProof,
  DashboardStats,
  DecisionTrail,
  InvoiceRecord,
  InvoiceSubmission,
  NotificationsResponse,
  SubmitInvoiceResponse,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && String((body as { error: unknown }).error)) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body && "details" in body ? (body as { details: unknown }).details : undefined);
  }

  return body as T;
}

export const api = {
  submitInvoice: (payload: InvoiceSubmission) =>
    request<SubmitInvoiceResponse>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getStatus: (trackingId: string) =>
    request<InvoiceRecord>(`/invoices/${encodeURIComponent(trackingId)}/status`),

  supplementInvoice: (trackingId: string, payload: Partial<InvoiceSubmission>) =>
    request<SubmitInvoiceResponse>(`/invoices/${encodeURIComponent(trackingId)}/supplement`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getApprovalQueue: () => request<{ items: ApprovalQueueItem[] }>("/approvals/queue"),

  getApproval: (trackingId: string) =>
    request<ApprovalQueueItem>(`/approvals/${encodeURIComponent(trackingId)}`),

  decideApproval: (trackingId: string, payload: ApprovalDecisionRequest) =>
    request<ApprovalDecisionResponse>(`/approvals/${encodeURIComponent(trackingId)}/decision`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDashboard: () => request<DashboardStats>("/audit/dashboard"),

  getCeilingProof: () => request<CeilingProof>("/audit/ceiling-proof"),

  getTrail: (id: string) => request<DecisionTrail>(`/audit/trail/${encodeURIComponent(id)}`),

  getNotifications: (trackingId: string) =>
    request<NotificationsResponse>(`/audit/notifications/${encodeURIComponent(trackingId)}`),
};
