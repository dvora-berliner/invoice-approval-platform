// Baked fallback, same pattern as decision-service's DEFAULT_THRESHOLDS - mirrors
// sample-invoices.json (the graded set), not sample-invoices-standard.json, whose
// `budgets` block differs. Lazy-initializes a department's budget on first touch.
export const DEFAULT_BUDGETS: Record<string, number> = {
  "marketing-2026Q2": 1000,
  "engineering-2026Q2": 50000,
  "sales-2026Q2": 20000,
};

export const DEFAULT_BUDGET_FALLBACK = 5000;

export function defaultBudgetFor(department: string): number {
  return DEFAULT_BUDGETS[department] ?? DEFAULT_BUDGET_FALLBACK;
}
