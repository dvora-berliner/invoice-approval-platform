import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

export const invoiceSubmissionSchema = z
  .object({
    vendor: z.string().min(1, "vendor is required"),
    invoiceNumber: z.string().min(1, "invoiceNumber is required"),
    total: z.number().positive("total must be a positive number"),
    currency: z.string().optional(),
    category: z.string().optional(),
    submitter: z.string().optional(),
    department: z.string().optional(),
    attendees: z.number().optional(),
    lineItems: z.array(lineItemSchema).optional(),
    taxAmount: z.number().optional(),
    receiptPresent: z.boolean().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
    // Test-only hook for D5's verification harness (Journey D).
    forcePaymentFailure: z.boolean().optional(),
  })
  .passthrough();

export type LineItem = z.infer<typeof lineItemSchema>;
export type InvoiceSubmission = z.infer<typeof invoiceSubmissionSchema>;
export type InvoiceStatus = "pending" | "awaiting_approval" | "rejected" | "paid" | "payment_failed";

const invoiceStatusValues = ["pending", "awaiting_approval", "rejected", "paid", "payment_failed"] as const;

export interface InvoiceRecord extends InvoiceSubmission {
  trackingId: string;
  status: InvoiceStatus;
  submittedAt: string;
  correlationId: string;
  // F2: specific reason set by audit-service; falls back to statusMessage() until then.
  reason?: string;
}

// Internal endpoint, called by audit-service only (Dapr service invocation) - not
// submitter-facing input, so no need to reuse invoiceSubmissionSchema here.
export const invoiceStatusUpdateSchema = z.object({
  status: z.enum(invoiceStatusValues),
  reason: z.string().min(1),
});
export type InvoiceStatusUpdate = z.infer<typeof invoiceStatusUpdateSchema>;

// F5's "send back for more info": submitter supplies at least one missing/corrected field.
export const invoiceSupplementSchema = invoiceSubmissionSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be supplied",
});
export type InvoiceSupplement = z.infer<typeof invoiceSupplementSchema>;
