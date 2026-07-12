import { describe, expect, it } from "vitest";
import {
  invoiceStatusUpdateSchema,
  invoiceSubmissionSchema,
  invoiceSupplementSchema,
  lineItemSchema,
} from "../src/types";

describe("lineItemSchema", () => {
  it("accepts a valid line item", () => {
    expect(lineItemSchema.safeParse({ description: "Widget", quantity: 2, unitPrice: 5 }).success).toBe(true);
  });

  it("rejects a line item missing required fields", () => {
    expect(lineItemSchema.safeParse({ description: "Widget" }).success).toBe(false);
  });
});

describe("invoiceSubmissionSchema", () => {
  it("accepts a minimal valid submission", () => {
    const result = invoiceSubmissionSchema.safeParse({ vendor: "Acme", invoiceNumber: "INV-1", total: 10 });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated submission", () => {
    const result = invoiceSubmissionSchema.safeParse({
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 10,
      currency: "USD",
      category: "saas",
      submitter: "a@b.com",
      department: "engineering-2026Q2",
      attendees: 3,
      lineItems: [{ description: "Widget", quantity: 1, unitPrice: 10 }],
      taxAmount: 1,
      receiptPresent: true,
      date: "2026-01-01",
      notes: "note",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty vendor", () => {
    const result = invoiceSubmissionSchema.safeParse({ vendor: "", invoiceNumber: "INV-1", total: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty invoiceNumber", () => {
    const result = invoiceSubmissionSchema.safeParse({ vendor: "Acme", invoiceNumber: "", total: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive total", () => {
    const result = invoiceSubmissionSchema.safeParse({ vendor: "Acme", invoiceNumber: "INV-1", total: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing vendor", () => {
    const result = invoiceSubmissionSchema.safeParse({ invoiceNumber: "INV-1", total: 10 });
    expect(result.success).toBe(false);
  });

  it("passes through unknown fields instead of stripping them", () => {
    const result = invoiceSubmissionSchema.safeParse({
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 10,
      vendorKnown: true,
    });
    expect(result.success).toBe(true);
    expect(result.success && (result.data as Record<string, unknown>).vendorKnown).toBe(true);
  });
});

describe("invoiceStatusUpdateSchema", () => {
  it("accepts a known status with a reason", () => {
    expect(invoiceStatusUpdateSchema.safeParse({ status: "paid", reason: "approved" }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(invoiceStatusUpdateSchema.safeParse({ status: "not-a-status", reason: "x" }).success).toBe(false);
  });

  it("rejects an empty reason", () => {
    expect(invoiceStatusUpdateSchema.safeParse({ status: "paid", reason: "" }).success).toBe(false);
  });
});

describe("invoiceSupplementSchema", () => {
  it("accepts a single supplied field", () => {
    expect(invoiceSupplementSchema.safeParse({ notes: "extra context" }).success).toBe(true);
  });

  it("rejects an empty object", () => {
    expect(invoiceSupplementSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid value for a known field", () => {
    expect(invoiceSupplementSchema.safeParse({ total: "not-a-number" }).success).toBe(false);
  });
});
