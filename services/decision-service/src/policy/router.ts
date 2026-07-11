import { DEFAULT_THRESHOLDS, type AutonomyThresholds } from "./thresholds";
import type { DecisionResult, PolicyViolation, RuleId } from "../types";

// Violations that reject outright instead of just escalating to a human.
const REJECT_RULE_IDS = new Set(["MEAL-03"]);

// Unions the agent's citedRules with the deterministic violations, deduped by ruleId.
export function mergeViolations(
  deterministicViolations: PolicyViolation[],
  agentCitedRules: RuleId[],
  agentReasoning: string
): PolicyViolation[] {
  const merged = [...deterministicViolations];
  const seen = new Set(deterministicViolations.map((v) => v.ruleId));
  for (const ruleId of agentCitedRules) {
    if (!seen.has(ruleId)) {
      merged.push({ ruleId, message: agentReasoning });
      seen.add(ruleId);
    }
  }
  return merged;
}

// The agent only recommends; this is the deterministic call (policy.md §6's ceiling formula).
export function decideRoute(
  usdAmount: number,
  confidence: number,
  violations: PolicyViolation[],
  thresholds: AutonomyThresholds = DEFAULT_THRESHOLDS
): DecisionResult {
  const citedRules = violations.map((v) => v.ruleId);

  if (violations.some((v) => v.reject || REJECT_RULE_IDS.has(v.ruleId))) {
    return {
      route: "reject",
      usdAmount,
      confidence,
      citedRules,
      reason: `Rejected: ${violations.map((v) => v.message).join(" ")}`,
      appliedCeiling: thresholds.ceiling,
    };
  }

  const withinCeiling = usdAmount <= thresholds.ceiling;
  const confidentEnough = confidence >= thresholds.confidence;
  const policyCompliant = violations.length === 0;

  if (withinCeiling && confidentEnough && policyCompliant) {
    return {
      route: "auto_approve",
      usdAmount,
      confidence,
      citedRules,
      reason: `Auto-approved: $${usdAmount.toFixed(2)} within ceiling, confidence ${confidence.toFixed(2)}, policy-compliant.`,
      appliedCeiling: thresholds.ceiling,
    };
  }

  const reasons: string[] = [];
  if (!withinCeiling) reasons.push(`$${usdAmount.toFixed(2)} exceeds the $${thresholds.ceiling} autonomy ceiling`);
  if (!confidentEnough) reasons.push(`confidence ${confidence.toFixed(2)} below ${thresholds.confidence}`);
  if (!policyCompliant) reasons.push(violations.map((v) => v.message).join(" "));

  return {
    route: "human_review",
    usdAmount,
    confidence,
    citedRules,
    reason: `Escalated: ${reasons.join("; ")}`,
    appliedCeiling: thresholds.ceiling,
  };
}
