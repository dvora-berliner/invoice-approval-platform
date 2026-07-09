import { z } from "zod";

export const ruleIds = [
  "MEAL-01",
  "MEAL-02",
  "MEAL-03",
  "TRAVEL-01",
  "TRAVEL-02",
  "TRAVEL-03",
  "SAAS-01",
  "HW-01",
  "HW-02",
  "GLOBAL-RECEIPT",
  "GLOBAL-VENDOR",
  "GLOBAL-FX",
  "GLOBAL-DUP",
  "GLOBAL-MATH",
  "GLOBAL-FRAUD",
] as const;
export type RuleId = (typeof ruleIds)[number];

export type DecisionRoute = "auto_approve" | "human_review" | "reject";

export interface PolicyViolation {
  ruleId: RuleId;
  message: string;
  /** High-severity: forces `reject` outright instead of `human_review` (e.g. MEAL-03). */
  reject?: boolean;
}

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

// Decoupled from submission-service's schema on purpose - independently deployable services.
export const invoiceForDecisionSchema = z
  .object({
    trackingId: z.string(),
    correlationId: z.string().optional(),
    vendor: z.string().min(1),
    invoiceNumber: z.string().min(1),
    total: z.number().positive(),
    currency: z.string().optional(),
    category: z.string().optional(),
    department: z.string().optional(),
    attendees: z.number().optional(),
    lineItems: z.array(lineItemSchema).optional(),
    taxAmount: z.number().optional(),
    receiptPresent: z.boolean().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export type InvoiceForDecision = z.infer<typeof invoiceForDecisionSchema>;

export interface DecisionResult {
  route: DecisionRoute;
  usdAmount: number;
  confidence: number;
  citedRules: RuleId[];
  reason: string;
}
