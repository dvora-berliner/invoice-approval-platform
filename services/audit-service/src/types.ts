// Decoupled from workflow-service's / submission-service's own schemas on purpose -
// independently deployable services, same pattern as workflow-service/src/types.ts.

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

export interface EscalationCreatedEvent {
  eventType: "EscalationCreated";
  trackingId: string;
  correlationId?: string;
  usdAmount: number;
  reason: string;
  timestamp: string;
}

export interface InfoRequestedEvent {
  eventType: "InfoRequested";
  trackingId: string;
  correlationId?: string;
  approverId: string;
  reason?: string;
  timestamp: string;
}

export interface InvoiceSubmittedEvent {
  trackingId: string;
  correlationId: string;
  vendor: string;
  invoiceNumber: string;
  total: number;
  submittedAt: string;
  [key: string]: unknown;
}

// F9: submitter's response to a request_info decision - no domain timestamp of its
// own, so it's recorded with the time audit-service received it (see subscriptions.ts).
export interface InvoiceSupplementedEvent {
  trackingId: string;
  correlationId?: string;
  [key: string]: unknown;
}
