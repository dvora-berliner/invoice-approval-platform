import type { DecisionRoute, InvoiceForDecision, RuleId } from "../types";

// The agent only recommends; policy/router.ts makes the real call.
export interface LLMRecommendation {
  recommendedRoute: DecisionRoute;
  confidence: number;
  citedRules: RuleId[];
  reasoning: string; // captured verbatim for the audit trail
}

export interface LLMProvider {
  recommend(invoice: InvoiceForDecision, usdAmount: number, policyContext: string): Promise<LLMRecommendation>;
}
