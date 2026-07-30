import { z } from "zod";

export const ROLES = ["submitter", "approver", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const registerRequestSchema = z.object({
  username: z.string().min(1, "username is required"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .regex(/[A-Za-z]/, "password must contain at least one letter")
    .regex(/[0-9]/, "password must contain at least one number"),
  role: z.enum(ROLES),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  username: z.string().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Stored in Dapr state, keyed by username - passwordHash only, never the raw password.
export interface StoredUser {
  username: string;
  passwordHash: string;
  role: Role;
}

export interface JwtPayload {
  username: string;
  role: Role;
}
