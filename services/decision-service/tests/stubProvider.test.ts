import { describe, expect, it } from "vitest";
import { StubProvider } from "../src/llm/stubProvider";
import type { InvoiceForDecision } from "../src/types";

const provider = new StubProvider();

const base: InvoiceForDecision = {
  trackingId: "t1",
  vendor: "Atlassian",
  invoiceNumber: "INV-1",
  total: 50,
};

describe("StubProvider - clean invoices", () => {
  it("auto-approves with high confidence when nothing is ambiguous", async () => {
    const result = await provider.recommend({ ...base, category: "saas" }, 50, "");
    expect(result.recommendedRoute).toBe("auto_approve");
    expect(result.citedRules).toEqual([]);
    expect(result.confidence).toBe(0.95);
    expect(result.reasoning).toBe("No policy concerns found in free-text fields.");
  });

  it("uses a lower confidence when the category is ambiguous (empty)", async () => {
    const result = await provider.recommend({ ...base, category: undefined }, 50, "");
    expect(result.confidence).toBe(0.5);
  });

  it("uses a lower confidence when the category is 'other'", async () => {
    const result = await provider.recommend({ ...base, category: "other" }, 50, "");
    expect(result.confidence).toBe(0.5);
  });
});

describe("StubProvider - MEAL-03 alcohol-only", () => {
  it("rejects a meal purchase that only describes alcohol", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      category: "meals",
      lineItems: [{ description: "Wine tasting", quantity: 1, unitPrice: 50 }],
    };
    const result = await provider.recommend(invoice, 50, "");
    expect(result.citedRules).toContain("MEAL-03");
    expect(result.recommendedRoute).toBe("reject");
    expect(result.confidence).toBe(0.6);
  });

  it("does not flag a meal that includes food alongside a drink", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      category: "meals",
      lineItems: [{ description: "Dinner and wine", quantity: 1, unitPrice: 50 }],
    };
    const result = await provider.recommend(invoice, 50, "");
    expect(result.citedRules).not.toContain("MEAL-03");
  });
});

describe("StubProvider - MEAL-02 client entertainment", () => {
  it("flags a meal over $500 with no client reference in notes", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      category: "meals",
      total: 600,
      lineItems: [{ description: "Team dinner", quantity: 1, unitPrice: 600 }],
      notes: "celebration",
    };
    const result = await provider.recommend(invoice, 600, "");
    expect(result.citedRules).toContain("MEAL-02");
    expect(result.recommendedRoute).toBe("human_review");
  });

  it("does not flag a meal over $500 when notes mention a client", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      category: "meals",
      total: 600,
      lineItems: [{ description: "Team dinner", quantity: 1, unitPrice: 600 }],
      notes: "dinner with client Acme Corp",
    };
    const result = await provider.recommend(invoice, 600, "");
    expect(result.citedRules).not.toContain("MEAL-02");
  });

  it("does not flag a meal at or under $500", async () => {
    const invoice: InvoiceForDecision = { ...base, category: "meals", total: 500, notes: "team lunch" };
    const result = await provider.recommend(invoice, 500, "");
    expect(result.citedRules).not.toContain("MEAL-02");
  });
});

describe("StubProvider - TRAVEL-03 business/first class", () => {
  it("flags business-class travel mentioned in a line item description", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      category: "travel",
      lineItems: [{ description: "Business class flight to NYC", quantity: 1, unitPrice: 50 }],
    };
    const result = await provider.recommend(invoice, 50, "");
    expect(result.citedRules).toContain("TRAVEL-03");
  });

  it("flags first-class travel mentioned in notes", async () => {
    const invoice: InvoiceForDecision = { ...base, category: "travel", notes: "upgraded to first class" };
    const result = await provider.recommend(invoice, 50, "");
    expect(result.citedRules).toContain("TRAVEL-03");
  });

  it("does not flag economy travel", async () => {
    const invoice: InvoiceForDecision = { ...base, category: "travel", notes: "economy fare" };
    const result = await provider.recommend(invoice, 50, "");
    expect(result.citedRules).not.toContain("TRAVEL-03");
  });
});

describe("StubProvider - GLOBAL-FRAUD", () => {
  it("flags 3+ fraud signals: unknown vendor, round amount, single undetailed line with no receipt", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      vendor: "Totally Unknown Vendor",
      total: 200,
      lineItems: [{ description: "misc", quantity: 1, unitPrice: 200 }],
      receiptPresent: false,
      date: "2026-01-05", // Monday - not a weekend signal
    };
    const result = await provider.recommend(invoice, 200, "");
    expect(result.citedRules).toContain("GLOBAL-FRAUD");
    expect(result.reasoning).toMatch(/3 fraud-pattern signals/);
  });

  it("flags weekend timing as one of the fraud signals", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      vendor: "Totally Unknown Vendor",
      total: 300,
      lineItems: [
        { description: "item one", quantity: 1, unitPrice: 150 },
        { description: "item two", quantity: 1, unitPrice: 150 },
      ],
      receiptPresent: true,
      date: "2026-01-04", // Sunday
    };
    const result = await provider.recommend(invoice, 300, "");
    expect(result.citedRules).toContain("GLOBAL-FRAUD");
  });

  it("does not flag when fewer than 3 fraud signals are present", async () => {
    const invoice: InvoiceForDecision = {
      ...base,
      vendor: "Atlassian",
      total: 233,
      lineItems: [
        { description: "item one", quantity: 1, unitPrice: 100 },
        { description: "item two", quantity: 1, unitPrice: 133 },
      ],
      receiptPresent: true,
      date: "2026-01-05",
    };
    const result = await provider.recommend(invoice, 233, "");
    expect(result.citedRules).not.toContain("GLOBAL-FRAUD");
  });
});
