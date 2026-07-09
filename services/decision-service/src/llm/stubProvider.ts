import { isVendorKnown } from "../policy/vendors";
import type { InvoiceForDecision, RuleId } from "../types";
import type { LLMProvider, LLMRecommendation } from "./provider";

// Deterministic, no network call - stands in for a real LLM in CI/eval via keyword heuristics
// for the free-text judgment calls rules.ts doesn't attempt (MEAL-02/03, GLOBAL-FRAUD, TRAVEL-03).

const ALCOHOL_KEYWORDS = ["alcohol", "beer", "wine", "liquor", "cocktail", "whisky", "whiskey", "vodka", "bar tab"];
const FOOD_KEYWORDS = ["lunch", "dinner", "meal", "food", "breakfast", "entree", "entrée"];
const BUSINESS_CLASS_KEYWORDS = ["business class", "first class", "business-class", "first-class"];

function describesOnly(descriptions: string[], keywords: string[], excludeKeywords: string[]): boolean {
  if (descriptions.length === 0) return false;
  const matchesKeyword = (d: string) => keywords.some((k) => d.includes(k));
  const matchesExclude = (d: string) => excludeKeywords.some((k) => d.includes(k));
  return descriptions.every((d) => matchesKeyword(d) && !matchesExclude(d));
}

function isWeekend(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const day = new Date(dateStr).getUTCDay();
  return day === 0 || day === 6;
}

export class StubProvider implements LLMProvider {
  async recommend(invoice: InvoiceForDecision, usdAmount: number, _policyContext: string): Promise<LLMRecommendation> {
    const citedRules: RuleId[] = [];
    const reasons: string[] = [];
    const descriptions = (invoice.lineItems ?? []).map((i) => i.description.toLowerCase());
    const category = (invoice.category ?? "").toLowerCase();
    const notes = (invoice.notes ?? "").toLowerCase();

    if (category === "meals" && describesOnly(descriptions, ALCOHOL_KEYWORDS, FOOD_KEYWORDS)) {
      citedRules.push("MEAL-03");
      reasons.push("Line items describe an alcohol-only purchase, not reimbursable.");
    }

    if (category === "meals" && usdAmount > 500 && !notes.includes("client")) {
      citedRules.push("MEAL-02");
      reasons.push("Client entertainment over $500 with no client name/justification found in notes.");
    }

    if (category === "travel" && BUSINESS_CLASS_KEYWORDS.some((k) => descriptions.some((d) => d.includes(k)) || notes.includes(k))) {
      citedRules.push("TRAVEL-03");
      reasons.push("First/business-class travel always requires approval.");
    }

    const fraudSignals = [
      !isVendorKnown(invoice.vendor),
      usdAmount % 100 === 0 && usdAmount > 0,
      descriptions.length <= 1 && invoice.receiptPresent !== true,
      isWeekend(invoice.date),
    ].filter(Boolean).length;
    if (fraudSignals >= 3) {
      citedRules.push("GLOBAL-FRAUD");
      reasons.push(`${fraudSignals} fraud-pattern signals present (new vendor / round amount / no detail / off-hours).`);
    }

    const ambiguousCategory = category === "" || category === "other";
    const confidence = citedRules.length > 0 ? 0.6 : ambiguousCategory ? 0.5 : 0.95;
    const recommendedRoute = citedRules.includes("MEAL-03") ? "reject" : citedRules.length > 0 ? "human_review" : "auto_approve";

    return {
      recommendedRoute,
      confidence,
      citedRules,
      reasoning: reasons.length > 0 ? reasons.join(" ") : "No policy concerns found in free-text fields.",
    };
  }
}
