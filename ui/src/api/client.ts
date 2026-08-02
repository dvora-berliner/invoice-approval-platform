import type {
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  ApprovalQueueItem,
  CeilingProof,
  DashboardStats,
  DecisionTrail,
  InvoiceListResponse,
  InvoiceRecord,
  InvoiceSubmission,
  NotificationsResponse,
  SubmitInvoiceResponse,
} from "./types";
import type { AuthSession, Role } from "../auth/types";
import { clearSession, getSession } from "../auth/session";

export const UNAUTHORIZED_EVENT = "approvalflow:unauthorized";

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
  const token = getSession()?.token;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    if (res.status === 401 && token) {
      // Expired token, not a bad-credentials login attempt (those have no token).
      clearSession();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message =
      (body && typeof body === "object" && "error" in body && String((body as { error: unknown }).error)) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body && "details" in body ? (body as { details: unknown }).details : undefined);
  }

  return body as T;
}

export const api = {
  register: (payload: { username: string; password: string; role: Role }) =>
    request<AuthSession>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: { username: string; password: string }) =>
    request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  submitInvoice: (payload: InvoiceSubmission) =>
    request<SubmitInvoiceResponse>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getStatus: (trackingId: string) =>
    request<InvoiceRecord>(`/invoices/${encodeURIComponent(trackingId)}/status`),

  getMyInvoices: () => request<InvoiceListResponse>("/invoices/mine"),

  getAllInvoices: () => request<InvoiceListResponse>("/invoices"),

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
