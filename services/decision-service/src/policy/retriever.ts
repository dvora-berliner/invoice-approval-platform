import { ruleIds, type InvoiceForDecision, type RuleId } from "../types";

export interface PolicyChunk {
  ruleId: RuleId;
  section: string;
  text: string;
}

const SECTION_HEADING = /^##\s+\d+\.\s+(.+)/;
const RULE_ROW = /^\|\s*`([A-Z0-9-]+)`\s*\|\s*(.+?)\s*\|$/;
const KNOWN_RULE_IDS: readonly string[] = ruleIds;

// router.ts's AGENT_JUDGMENT_RULE_IDS never trusts the agent's opinion on vendor
// familiarity (it's decided server-side, see rules.ts's isVendorKnown) - so showing the
// agent this rule only invites it to guess and needlessly lower its confidence.
const AGENT_INVISIBLE_RULE_IDS = new Set<RuleId>(["GLOBAL-VENDOR"]);

// One chunk per `rule_id` table row. Filters to KNOWN_RULE_IDS because §6's threshold
// table uses the same `| \`KEY\` | ... |` shape but isn't citable rules.
export function parsePolicyChunks(rawPolicy: string): PolicyChunk[] {
  const chunks: PolicyChunk[] = [];
  let section = "";
  for (const line of rawPolicy.split(/\r?\n/)) {
    const heading = line.match(SECTION_HEADING);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const row = line.match(RULE_ROW);
    if (row && KNOWN_RULE_IDS.includes(row[1])) {
      chunks.push({ ruleId: row[1] as RuleId, section, text: row[2] });
    }
  }
  return chunks;
}

// N5: category's section + all GLOBAL-* rules (minus AGENT_INVISIBLE_RULE_IDS).
// Unrecognized/missing category falls back to every chunk - never drop a rule we
// haven't confidently matched.
export function selectRelevantChunks(
  chunks: PolicyChunk[],
  invoice: Pick<InvoiceForDecision, "category">,
): PolicyChunk[] {
  const category = invoice.category ? normalize(invoice.category) : "";
  const sections = [...new Set(chunks.map((c) => c.section))];
  const matchedSection =
    category.length >= 3
      ? sections.find((s) => {
          const normalized = normalize(s);
          return normalized.includes(category) || category.includes(normalized);
        })
      : undefined;

  const selected = matchedSection
    ? chunks.filter((c) => c.section === matchedSection || c.ruleId.startsWith("GLOBAL-"))
    : chunks;
  return selected.filter((c) => !AGENT_INVISIBLE_RULE_IDS.has(c.ruleId));
}

export function formatChunks(chunks: PolicyChunk[]): string {
  return chunks.map((c) => `[${c.ruleId}] ${c.text}`).join("\n");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}
