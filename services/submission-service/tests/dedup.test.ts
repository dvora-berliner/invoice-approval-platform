import { describe, expect, it } from "vitest";
import { computeDedupKey } from "../src/dedup";
import type { InvoiceSubmission } from "../src/types";

const base: InvoiceSubmission = { vendor: "Acme", invoiceNumber: "INV-1", total: 100 };

describe("computeDedupKey", () => {
  it("is deterministic for the same vendor, invoiceNumber and total", () => {
    expect(computeDedupKey(base)).toBe(computeDedupKey({ ...base }));
  });

  it("is a 64-character hex sha256 digest", () => {
    expect(computeDedupKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the vendor changes", () => {
    expect(computeDedupKey(base)).not.toBe(computeDedupKey({ ...base, vendor: "Other" }));
  });

  it("changes when the invoiceNumber changes", () => {
    expect(computeDedupKey(base)).not.toBe(computeDedupKey({ ...base, invoiceNumber: "INV-2" }));
  });

  it("changes when the total changes", () => {
    expect(computeDedupKey(base)).not.toBe(computeDedupKey({ ...base, total: 200 }));
  });

  it("ignores fields outside vendor/invoiceNumber/total", () => {
    expect(computeDedupKey(base)).toBe(computeDedupKey({ ...base, notes: "different notes" }));
  });
});
