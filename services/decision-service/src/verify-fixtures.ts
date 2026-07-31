import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { convertToUsd, FALLBACK_FX_RATES } from "./policy/fx";
import { computeDeterministicViolations } from "./policy/rules";
import { decideRoute, mergeViolations } from "./policy/router";
import { DEFAULT_THRESHOLDS } from "./policy/thresholds";
import { StubProvider } from "./llm/stubProvider";
import type { DecisionRoute, InvoiceForDecision } from "./types";

// Runs the full pipeline (FX + hard-stops + StubProvider + router) against a fixture file,
// and writes a committed metrics report (B1: automated eval harness).

interface Fixture {
  id: string;
  scenario?: string;
  category?: string;
  expected: { route: DecisionRoute; violations: string[]; reason: string };
  [key: string]: unknown;
}

interface FixtureResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "skip";
  expected: DecisionRoute;
  got?: DecisionRoute;
  violations: string[];
  confidence?: number;
}

function toReportMarkdown(results: FixtureResult[], fixturesFile: string): string {
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const graded = pass + fail;

  const lines: string[] = [
    "# Decision engine eval report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Fixtures: \`${fixturesFile}\` (StubProvider, deterministic - no network call)`,
    "",
    "## Summary",
    "",
    `- **${pass}/${graded} passed** (${graded ? ((pass / graded) * 100).toFixed(1) : "0.0"}%)`,
    `- ${fail} failed, ${skip} skipped (duplicate-handling fixtures - not decision-service's job)`,
    "",
    "## Results",
    "",
    "| ID | Scenario | Expected | Got | Result |",
    "|---|---|---|---|---|",
  ];
  for (const r of results) {
    const marker = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
    lines.push(`| ${r.id} | ${r.label} | ${r.expected} | ${r.got ?? "-"} | ${marker} |`);
  }

  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const f of failures) {
      lines.push(
        `### ${f.id} (${f.label})`,
        `- Expected \`${f.expected}\`, got \`${f.got}\``,
        `- Violations: ${f.violations.join(", ") || "none"}`,
        `- Confidence: ${f.confidence}`,
        ""
      );
    }
  }

  return lines.join("\n") + "\n";
}

async function main() {
  // Defaults to the official graded fixture set; pass a filename to check a different one
  // (e.g. `npm run verify -- sample-invoices-standard.json`).
  const fixturesFile = process.argv[2] ?? "sample-invoices.json";
  const raw = readFileSync(join(__dirname, "../../../", fixturesFile), "utf-8");
  const data = JSON.parse(raw) as { fixtures: Fixture[] };
  const policyContext = readFileSync(join(__dirname, "../../../policy.md"), "utf-8");
  const provider = new StubProvider();

  const results: FixtureResult[] = [];

  for (const fixture of data.fixtures) {
    const label = fixture.scenario ?? fixture.category ?? "";

    if (fixture.scenario?.startsWith("duplicate-of")) {
      console.log(`SKIP  ${fixture.id} (duplicate handling is submission-service's job)`);
      results.push({ id: fixture.id, label, status: "skip", expected: fixture.expected.route, violations: [] });
      continue;
    }

    const invoice = fixture as unknown as InvoiceForDecision;
    const usdAmount = convertToUsd(invoice.total, invoice.currency, FALLBACK_FX_RATES);
    const agentRecommendation = await provider.recommend(invoice, usdAmount, policyContext);
    const deterministicViolations = computeDeterministicViolations(invoice, usdAmount, DEFAULT_THRESHOLDS);
    const violations = mergeViolations(deterministicViolations, agentRecommendation.citedRules, agentRecommendation.reasoning);
    const result = decideRoute(usdAmount, agentRecommendation.confidence, violations, DEFAULT_THRESHOLDS);

    const ok = result.route === fixture.expected.route;
    results.push({
      id: fixture.id,
      label,
      status: ok ? "pass" : "fail",
      expected: fixture.expected.route,
      got: result.route,
      violations: violations.map((v) => v.ruleId),
      confidence: agentRecommendation.confidence,
    });

    const marker = ok ? "PASS" : "FAIL";
    console.log(
      `${marker}  ${fixture.id} (${label}): expected=${fixture.expected.route} got=${result.route}` +
        (ok ? "" : `  [violations: ${violations.map((v) => v.ruleId).join(",") || "none"}, confidence: ${agentRecommendation.confidence}]`)
    );
  }

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped (out of ${data.fixtures.length} fixtures)`);

  const reportPath = join(__dirname, "../../../eval-report.md");
  writeFileSync(reportPath, toReportMarkdown(results, fixturesFile), "utf-8");
  console.log(`\nReport written to ${reportPath}`);
}

main();
