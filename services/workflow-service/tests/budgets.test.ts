import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_FALLBACK, DEFAULT_BUDGETS, defaultBudgetFor } from "../src/policy/budgets";

describe("defaultBudgetFor", () => {
  it("returns the seeded budget for a known department", () => {
    expect(defaultBudgetFor("marketing-2026Q2")).toBe(DEFAULT_BUDGETS["marketing-2026Q2"]);
  });

  it("falls back to the default budget for an unknown department", () => {
    expect(defaultBudgetFor("unknown-dept")).toBe(DEFAULT_BUDGET_FALLBACK);
  });
});
