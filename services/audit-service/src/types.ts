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

// F9: occurredAt is set by submission-service at write time (not at receipt here),
// so redelivery dedupes correctly against the (event_type, tracking_id, occurred_at)
// unique index every other event uses.
export interface InvoiceSupplementedEvent {
  trackingId: string;
  correlationId?: string;
  occurredAt: string;
  [key: string]: unknown;
}
