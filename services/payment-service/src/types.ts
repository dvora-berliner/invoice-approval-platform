import { z } from "zod";

export const reserveRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional(),
  department: z.string().optional(),
  trackingId: z.string().optional(),
});
export type ReserveRequest = z.infer<typeof reserveRequestSchema>;

export const executeRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  reservationId: z.string().min(1),
  simulateOutcome: z.enum(["success", "failure"]).optional(),
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export const compensateRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  reservationId: z.string().min(1),
});
export type CompensateRequest = z.infer<typeof compensateRequestSchema>;

export type PaymentStatus = "reserved" | "executed" | "failed" | "compensated";

export interface PaymentRecord {
  reservationId: string;
  idempotencyKey: string;
  amount: number;
  currency?: string;
  department?: string;
  trackingId?: string;
  status: PaymentStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
