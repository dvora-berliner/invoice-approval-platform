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
  })
  .passthrough();

export type LineItem = z.infer<typeof lineItemSchema>;
export type InvoiceSubmission = z.infer<typeof invoiceSubmissionSchema>;
export type InvoiceStatus =
  | "pending"
  | "auto_approved"
  | "awaiting_approval"
  | "rejected"
  | "paid"
  | "payment_failed";

export interface InvoiceRecord extends InvoiceSubmission {
  trackingId: string;
  status: InvoiceStatus;
  submittedAt: string;
  correlationId: string;
}
