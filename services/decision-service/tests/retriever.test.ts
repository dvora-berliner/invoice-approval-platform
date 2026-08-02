import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parsePolicyChunks, selectRelevantChunks, formatChunks } from "../src/policy/retriever";
import { ruleIds } from "../src/types";

const policyMd = readFileSync(join(__dirname, "../../../policy.md"), "utf-8");

describe("parsePolicyChunks", () => {
  it("extracts every known rule_id from the real policy.md, exactly once each", () => {
    const chunks = parsePolicyChunks(policyMd);
    expect(chunks.map((c) => c.ruleId).sort()).toEqual([...ruleIds].sort());
  });
});

describe("selectRelevantChunks", () => {
  const chunks = parsePolicyChunks(policyMd);

  it("returns the category's own rules plus every GLOBAL-* rule except GLOBAL-VENDOR", () => {
    const result = selectRelevantChunks(chunks, { category: "meals" });
    expect(result.map((c) => c.ruleId).sort()).toEqual(
      ["MEAL-01", "MEAL-02", "MEAL-03", "GLOBAL-DUP", "GLOBAL-FRAUD", "GLOBAL-FX", "GLOBAL-MATH", "GLOBAL-RECEIPT"].sort(),
    );
  });

  it("matches the category case-insensitively", () => {
    const result = selectRelevantChunks(chunks, { category: "MEALS" });
    expect(result.some((c) => c.ruleId === "MEAL-01")).toBe(true);
    expect(result.some((c) => c.ruleId === "TRAVEL-01")).toBe(false);
  });

  it("falls back to every chunk except GLOBAL-VENDOR for an unrecognized category", () => {
    expect(selectRelevantChunks(chunks, { category: "other" })).toEqual(chunks.filter((c) => c.ruleId !== "GLOBAL-VENDOR"));
  });

  it("falls back to every chunk except GLOBAL-VENDOR when category is missing", () => {
    expect(selectRelevantChunks(chunks, {})).toEqual(chunks.filter((c) => c.ruleId !== "GLOBAL-VENDOR"));
  });

  it("never surfaces GLOBAL-VENDOR to the agent, regardless of category", () => {
    expect(selectRelevantChunks(chunks, { category: "meals" }).some((c) => c.ruleId === "GLOBAL-VENDOR")).toBe(false);
    expect(selectRelevantChunks(chunks, { category: "unmapped" }).some((c) => c.ruleId === "GLOBAL-VENDOR")).toBe(false);
  });
});

describe("formatChunks", () => {
  it("renders each chunk tagged with its rule id", () => {
    const text = formatChunks([{ ruleId: "MEAL-01", section: "Meals & Entertainment", text: "Up to $75." }]);
    expect(text).toBe("[MEAL-01] Up to $75.");
  });
});
