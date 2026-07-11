import { Router } from "express";
import { convertToUsd } from "./policy/fx";
import { computeDeterministicViolations } from "./policy/rules";
import { decideRoute, mergeViolations } from "./policy/router";
import { loadThresholds, loadFxRates } from "./policy/configStore";
import { invoiceForDecisionSchema } from "./types";
import type { LLMProvider } from "./llm/provider";

export function createDecisionRouter(provider: LLMProvider, policyContext: string): Router {
  const router = Router();

  router.post("/decide", async (req, res) => {
    const parseResult = invoiceForDecisionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid invoice", details: parseResult.error.flatten() });
      return;
    }
    const invoice = parseResult.data;

    let usdAmount: number;
    try {
      const fxRates = await loadFxRates();
      usdAmount = convertToUsd(invoice.total, invoice.currency, fxRates);
    } catch (err) {
      // Client-observable, deterministic (retries won't help) - a 400, not a crash.
      req.log.error("unsupported currency", { trackingId: invoice.trackingId, error: String(err) });
      res.status(400).json({ error: "Unsupported currency", details: String(err) });
      return;
    }

    try {
      const thresholds = await loadThresholds();

      // A provider failure/timeout never defaults to approval - it forces human_review.
      const agentRecommendation = await provider.recommend(invoice, usdAmount, policyContext).catch((err) => {
        req.log.error("LLM provider failed", { trackingId: invoice.trackingId, error: String(err) });
        return null;
      });

      if (!agentRecommendation) {
        res.status(200).json({
          route: "human_review",
          usdAmount,
          confidence: 0,
          citedRules: [],
          reason: "AI provider unavailable",
          appliedCeiling: thresholds.ceiling,
        });
        return;
      }

      const deterministicViolations = computeDeterministicViolations(invoice, usdAmount, thresholds);
      const violations = mergeViolations(deterministicViolations, agentRecommendation.citedRules, agentRecommendation.reasoning);
      const result = decideRoute(usdAmount, agentRecommendation.confidence, violations, thresholds);

      req.log.info("decision made", { trackingId: invoice.trackingId, route: result.route, usdAmount });
      res.status(200).json({ ...result, agentReasoning: agentRecommendation.reasoning });
    } catch (err) {
      req.log.error("POST /decide failed", { trackingId: invoice.trackingId, error: String(err) });
      res.status(500).json({ error: "Failed to reach a decision" });
    }
  });

  return router;
}
