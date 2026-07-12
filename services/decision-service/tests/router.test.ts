import { describe, expect, it } from "vitest";
import { decideRoute, mergeViolations } from "../src/policy/router";
import type { PolicyViolation } from "../src/types";

describe("mergeViolations", () => {
  it("adds agent-cited rules not already flagged deterministically", () => {
    const result = mergeViolations([], ["MEAL-03"], "alcohol only");
    expect(result).toEqual([{ ruleId: "MEAL-03", message: "alcohol only" }]);
  });

  it("does not duplicate a rule already present deterministically", () => {
    const deterministic: PolicyViolation[] = [{ ruleId: "GLOBAL-VENDOR", message: "unknown vendor" }];
    const result = mergeViolations(deterministic, ["GLOBAL-VENDOR"], "agent reasoning");
    expect(result).toEqual(deterministic);
  });

  it("keeps deterministic violations and appends new agent ones", () => {
    const deterministic: PolicyViolation[] = [{ ruleId: "GLOBAL-VENDOR", message: "unknown vendor" }];
    const result = mergeViolations(deterministic, ["MEAL-02"], "no client name");
    expect(result).toEqual([
      { ruleId: "GLOBAL-VENDOR", message: "unknown vendor" },
      { ruleId: "MEAL-02", message: "no client name" },
    ]);
  });
});

describe("decideRoute", () => {
  it("auto-approves when within ceiling, confident enough and policy-compliant", () => {
    const result = decideRoute(100, 0.9, []);
    expect(result.route).toBe("auto_approve");
    expect(result.appliedCeiling).toBe(250);
  });

  it("escalates to human_review when over the ceiling", () => {
    const result = decideRoute(300, 0.9, []);
    expect(result.route).toBe("human_review");
    expect(result.reason).toContain("exceeds the $250 autonomy ceiling");
  });

  it("escalates to human_review when confidence is too low", () => {
    const result = decideRoute(100, 0.5, []);
    expect(result.route).toBe("human_review");
    expect(result.reason).toContain("confidence 0.50 below 0.8");
  });

  it("escalates to human_review when there are non-rejecting violations", () => {
    const violations: PolicyViolation[] = [{ ruleId: "SAAS-01", message: "over the cap" }];
    const result = decideRoute(100, 0.9, violations);
    expect(result.route).toBe("human_review");
    expect(result.citedRules).toEqual(["SAAS-01"]);
    expect(result.reason).toContain("over the cap");
  });

  it("joins multiple escalation reasons", () => {
    const violations: PolicyViolation[] = [{ ruleId: "SAAS-01", message: "over the cap" }];
    const result = decideRoute(300, 0.5, violations);
    expect(result.reason).toContain("exceeds the $250 autonomy ceiling");
    expect(result.reason).toContain("confidence 0.50 below 0.8");
    expect(result.reason).toContain("over the cap");
  });

  it("rejects outright when a violation is explicitly marked reject", () => {
    const violations: PolicyViolation[] = [{ ruleId: "GLOBAL-FRAUD", message: "fraud signals present", reject: true }];
    const result = decideRoute(100, 0.9, violations);
    expect(result.route).toBe("reject");
    expect(result.reason).toBe("Rejected: fraud signals present");
  });

  it("rejects outright for a hardcoded reject rule id (MEAL-03) even without the reject flag", () => {
    const violations: PolicyViolation[] = [{ ruleId: "MEAL-03", message: "alcohol only" }];
    const result = decideRoute(100, 0.9, violations);
    expect(result.route).toBe("reject");
  });

  it("uses custom thresholds when provided", () => {
    const result = decideRoute(400, 0.6, [], { ceiling: 500, confidence: 0.5 });
    expect(result.route).toBe("auto_approve");
    expect(result.appliedCeiling).toBe(500);
  });
});
