import { describe, expect, it } from "vitest";
import { computeDeterministicViolations } from "../src/policy/rules";
import { DEFAULT_THRESHOLDS } from "../src/policy/thresholds";
import type { InvoiceForDecision } from "../src/types";

const base: InvoiceForDecision = {
  trackingId: "t1",
  vendor: "Atlassian",
  invoiceNumber: "INV-1",
  total: 20,
  receiptPresent: true,
};

function violationIds(invoice: InvoiceForDecision, usdAmount = invoice.total, thresholds = DEFAULT_THRESHOLDS) {
  return computeDeterministicViolations(invoice, usdAmount, thresholds).map((v) => v.ruleId);
}

describe("GLOBAL-VENDOR", () => {
  it("flags an unknown vendor", () => {
    expect(violationIds({ ...base, vendor: "Totally Unknown Co" })).toContain("GLOBAL-VENDOR");
  });

  it("does not flag a known vendor", () => {
    expect(violationIds(base)).not.toContain("GLOBAL-VENDOR");
  });
});

describe("GLOBAL-FX", () => {
  it("flags a foreign-currency amount above the ceiling", () => {
    expect(violationIds({ ...base, currency: "EUR", total: 300 }, 300)).toContain("GLOBAL-FX");
  });

  it("flags a foreign-currency amount above the FX hard-stop even if a raised ceiling would allow it", () => {
    expect(violationIds({ ...base, currency: "EUR", total: 1500 }, 1500, { ceiling: 2000, confidence: 0.8 })).toContain(
      "GLOBAL-FX",
    );
  });

  it("does not flag a foreign-currency amount within both the ceiling and the hard-stop", () => {
    expect(violationIds({ ...base, currency: "EUR", total: 50 }, 50)).not.toContain("GLOBAL-FX");
  });

  it("does not flag a large USD amount (not foreign)", () => {
    expect(violationIds({ ...base, currency: "USD", total: 5000 }, 5000)).not.toContain("GLOBAL-FX");
  });
});

describe("GLOBAL-RECEIPT", () => {
  it("flags a missing receipt above $25", () => {
    expect(violationIds({ ...base, total: 30, receiptPresent: false }, 30)).toContain("GLOBAL-RECEIPT");
  });

  it("flags an undefined receiptPresent above $25", () => {
    expect(violationIds({ ...base, total: 30, receiptPresent: undefined }, 30)).toContain("GLOBAL-RECEIPT");
  });

  it("does not flag when a receipt is present above $25", () => {
    expect(violationIds({ ...base, total: 30, receiptPresent: true }, 30)).not.toContain("GLOBAL-RECEIPT");
  });

  it("does not require a receipt at or below $25", () => {
    expect(violationIds({ ...base, total: 25, receiptPresent: false }, 25)).not.toContain("GLOBAL-RECEIPT");
  });
});

describe("GLOBAL-MATH", () => {
  it("flags line items + tax that don't reconcile to the total", () => {
    const invoice: InvoiceForDecision = {
      ...base,
      total: 100,
      lineItems: [{ description: "Widget", quantity: 1, unitPrice: 50 }],
      taxAmount: 5,
    };
    expect(violationIds(invoice, 100)).toContain("GLOBAL-MATH");
  });

  it("does not flag when line items + tax reconcile to the total", () => {
    const invoice: InvoiceForDecision = {
      ...base,
      total: 55,
      lineItems: [{ description: "Widget", quantity: 1, unitPrice: 50 }],
      taxAmount: 5,
    };
    expect(violationIds(invoice, 55)).not.toContain("GLOBAL-MATH");
  });

  it("treats a missing taxAmount as zero when reconciling", () => {
    const invoice: InvoiceForDecision = {
      ...base,
      total: 50,
      lineItems: [{ description: "Widget", quantity: 1, unitPrice: 50 }],
      taxAmount: undefined,
    };
    expect(violationIds(invoice, 50)).not.toContain("GLOBAL-MATH");
  });

  it("is skipped when there are no line items", () => {
    expect(violationIds({ ...base, lineItems: undefined })).not.toContain("GLOBAL-MATH");
  });

  it("is skipped when line items is an empty array", () => {
    expect(violationIds({ ...base, lineItems: [] })).not.toContain("GLOBAL-MATH");
  });
});

describe("category compliance - meals", () => {
  it("flags a missing attendee count", () => {
    expect(violationIds({ ...base, category: "meals", total: 60 }, 60)).toContain("MEAL-01");
  });

  it("flags a per-attendee amount above the cap", () => {
    expect(violationIds({ ...base, category: "meals", total: 300, attendees: 2 }, 300)).toContain("MEAL-01");
  });

  it("does not flag a per-attendee amount within the cap", () => {
    expect(violationIds({ ...base, category: "meals", total: 100, attendees: 2 }, 100)).not.toContain("MEAL-01");
  });

  it("is case-insensitive on the category", () => {
    expect(violationIds({ ...base, category: "Meals", total: 60 }, 60)).toContain("MEAL-01");
  });
});

describe("category compliance - saas", () => {
  it("flags an amount above the monthly cap", () => {
    expect(violationIds({ ...base, category: "saas", total: 300 }, 300)).toContain("SAAS-01");
  });

  it("does not flag an amount within the monthly cap", () => {
    expect(violationIds({ ...base, category: "saas", total: 100 }, 100)).not.toContain("SAAS-01");
  });
});

describe("category compliance - hardware", () => {
  it("flags a capital expense above the threshold", () => {
    expect(violationIds({ ...base, category: "hardware", total: 1500 }, 1500)).toContain("HW-02");
  });

  it("does not flag an expense within the threshold", () => {
    expect(violationIds({ ...base, category: "hardware", total: 500 }, 500)).not.toContain("HW-02");
  });
});

describe("category compliance - travel", () => {
  it("flags an amount above the single-expense threshold", () => {
    expect(violationIds({ ...base, category: "travel", total: 2000 }, 2000)).toContain("TRAVEL-02");
  });

  it("does not flag an amount within the threshold", () => {
    expect(violationIds({ ...base, category: "travel", total: 500 }, 500)).not.toContain("TRAVEL-02");
  });
});

describe("category compliance - other/unrecognized", () => {
  it("does not flag an uncategorized invoice", () => {
    expect(violationIds({ ...base, category: undefined, total: 5000 }, 5000)).toEqual([]);
  });

  it("does not flag an unrecognized category", () => {
    expect(violationIds({ ...base, category: "other", total: 5000 }, 5000)).toEqual([]);
  });
});
