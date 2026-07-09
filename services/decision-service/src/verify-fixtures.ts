import { readFileSync } from "fs";
import { join } from "path";
import { convertToUsd, FALLBACK_FX_RATES } from "./policy/fx";
import { computeDeterministicViolations } from "./policy/rules";
import { decideRoute, mergeViolations } from "./policy/router";
import { DEFAULT_THRESHOLDS } from "./policy/thresholds";
import { StubProvider } from "./llm/stubProvider";
import type { DecisionRoute, InvoiceForDecision } from "./types";

// Runs the full pipeline (FX + hard-stops + StubProvider + router) against a fixture file.

interface Fixture {
  id: string;
  scenario?: string;
  expected: { route: DecisionRoute; violations: string[]; reason: string };
  [key: string]: unknown;
}

async function main() {
  // Defaults to the official graded fixture set; pass a filename to check a different one
  // (e.g. `npm run verify -- sample-invoices-standard.json`).
  const fixturesFile = process.argv[2] ?? "sample-invoices.json";
  const raw = readFileSync(join(__dirname, "../../../", fixturesFile), "utf-8");
  const data = JSON.parse(raw) as { fixtures: Fixture[] };
  const policyContext = readFileSync(join(__dirname, "../../../policy.md"), "utf-8");
  const provider = new StubProvider();

  let pass = 0;
  let fail = 0;
  let skipped = 0;

  for (const fixture of data.fixtures) {
    if (fixture.scenario?.startsWith("duplicate-of")) {
      console.log(`SKIP  ${fixture.id} (duplicate handling is submission-service's job)`);
      skipped++;
      continue;
    }

    const invoice = fixture as unknown as InvoiceForDecision;
    const usdAmount = convertToUsd(invoice.total, invoice.currency, FALLBACK_FX_RATES);
    const agentRecommendation = await provider.recommend(invoice, usdAmount, policyContext);
    const deterministicViolations = computeDeterministicViolations(invoice, usdAmount, DEFAULT_THRESHOLDS);
    const violations = mergeViolations(deterministicViolations, agentRecommendation.citedRules, agentRecommendation.reasoning);
    const result = decideRoute(usdAmount, agentRecommendation.confidence, violations, DEFAULT_THRESHOLDS);

    const ok = result.route === fixture.expected.route;
    if (ok) pass++;
    else fail++;

    const marker = ok ? "PASS" : "FAIL";
    console.log(
      `${marker}  ${fixture.id} (${fixture.scenario ?? fixture.category}): expected=${fixture.expected.route} got=${result.route}` +
        (ok ? "" : `  [violations: ${violations.map((v) => v.ruleId).join(",") || "none"}, confidence: ${agentRecommendation.confidence}]`)
    );
  }

  console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped (out of ${data.fixtures.length} fixtures)`);
}

main();
