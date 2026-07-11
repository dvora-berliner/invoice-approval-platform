import { z } from "zod";

// Decoupled from submission-service's / decision-service's own schemas on purpose -
// independently deployable services, same pattern as decision-service/src/types.ts.
const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

export const workflowInputSchema = z
  .object({
    trackingId: z.string(),
    correlationId: z.string().optional(),
    vendor: z.string().min(1),
    invoiceNumber: z.string().min(1),
    total: z.number().positive(),
    currency: z.string().optional(),
    category: z.string().optional(),
    department: z.string().optional(),
    submitter: z.string().optional(),
    attendees: z.number().optional(),
    lineItems: z.array(lineItemSchema).optional(),
    taxAmount: z.number().optional(),
    receiptPresent: z.boolean().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();
export type WorkflowInput = z.infer<typeof workflowInputSchema>;

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

export const approvalDecisionRequestSchema = z.object({
  approverId: z.string().min(1),
  action: z.enum(["approve", "reject", "request_info"]),
  reason: z.string().optional(),
});
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionRequestSchema>;

export interface ApprovalQueueItem {
  trackingId: string;
  correlationId?: string;
  invoice: WorkflowInput;
  decision: DecisionResult;
  createdAt: string;
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

export interface BudgetRecord {
  department: string;
  remaining: number;
}

export interface WorkflowResult {
  outcome: FinalOutcome;
  reason?: string;
}
