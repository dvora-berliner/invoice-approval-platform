export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceSubmission {
  vendor: string;
  invoiceNumber: string;
  total: number;
  currency?: string;
  category?: string;
  submitter?: string;
  department?: string;
  attendees?: number;
  lineItems?: LineItem[];
  taxAmount?: number;
  receiptPresent?: boolean;
  date?: string;
  notes?: string;
}

export type InvoiceStatus =
  | "pending"
  | "awaiting_approval"
  | "rejected"
  | "paid"
  | "payment_failed";

export interface InvoiceRecord extends InvoiceSubmission {
  trackingId: string;
  status: InvoiceStatus;
  submittedAt: string;
  correlationId: string;
  reason?: string;
  message: string;
}

export interface SubmitInvoiceResponse {
  trackingId: string;
  duplicateSubmission?: boolean;
  message?: string;
}

export type DecisionRoute = "auto_approve" | "human_review" | "reject";

export interface DecisionResult {
  route: DecisionRoute;
  usdAmount: number;
  confidence: number;
  citedRules: string[];
  reason: string;
  agentReasoning?: string;
  appliedCeiling: number;
}

export interface WorkflowInput extends InvoiceSubmission {
  trackingId: string;
  correlationId?: string;
}

export interface ApprovalQueueItem {
  trackingId: string;
  correlationId?: string;
  invoice: WorkflowInput;
  decision: DecisionResult;
  createdAt: string;
}

export type ApprovalAction = "approve" | "reject" | "request_info";

export interface ApprovalDecisionRequest {
  approverId: string;
  action: ApprovalAction;
  reason?: string;
}

export interface ApprovalDecisionResponse {
  trackingId: string;
  action: ApprovalAction;
}

export interface DashboardStats {
  totalSubmitted: number;
  totalEscalated: number;
  totalFinalized: number;
  autoApproved: { count: number; usdAmount: number };
  humanApproved: { count: number; usdAmount: number };
  rejected: number;
  submittedByDay: Record<string, number>;
  finalizedByDay: Record<string, number>;
}

export type FinalOutcome = "paid" | "rejected" | "payment_failed";

export interface DecisionFinalizedEvent {
  eventType: "DecisionFinalized";
  trackingId: string;
  correlationId?: string;
  outcome: FinalOutcome;
  reason: string;
  usdAmount: number;
  appliedCeiling: number;
  approverId?: string;
  citedRules?: string[];
  agentReasoning?: string;
  timestamp: string;
}

export interface CeilingProof {
  currentCeiling: number;
  itemsChecked: number;
  violations: Array<{
    tracking_id: string;
    correlation_id: string;
    payload: DecisionFinalizedEvent;
  }>;
  passed: boolean;
}

export interface DecisionEventRow {
  id: number;
  event_type: string;
  tracking_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
}

export interface DecisionTrail {
  id: string;
  events: DecisionEventRow[];
}

export interface NotificationEntry {
  eventType: "DecisionFinalized" | "InfoRequested";
  occurredAt: string;
  message: string;
}

export interface NotificationsResponse {
  trackingId: string;
  latest: NotificationEntry;
  history: NotificationEntry[];
}
