# ADR-0013: Deterministic clause retrieval, not semantic RAG

**Context**: N5 requires retrieving only the policy clause(s) relevant to
an item instead of putting the whole `policy.md` into the prompt. The
obvious approach is semantic retrieval (embeddings + similarity search),
but `invoice.category` is a free-text, optional field (not a closed enum),
and the project's core dilemma requires proving the system never escalates
needlessly - a similarity-based retriever could plausibly omit a relevant
rule and starve the agent of context, lowering its confidence and pushing
an otherwise-compliant item into human review. That risk is unacceptable
given the "boring 80%" requirement.

**Decision**: `services/decision-service/src/policy/retriever.ts` parses
`policy.md` into one chunk per `rule_id` (`parsePolicyChunks`), then
selects chunks deterministically (`selectRelevantChunks`): the invoice's
matched category section in full, plus every `GLOBAL-*` rule always. An
unrecognized or missing category falls back to the full chunk set - no
scoring, no similarity threshold, no partial section.

**Consequences**: The retrieval is fully provable - a test parses the real
`policy.md` and asserts the returned chunks are an exact superset for each
known category, so a missed rule would fail CI, not just a code review.
It's also a meaningful reduction in practice (e.g. ~1,227 of 4,479 chars
for a "meals" item, ~73% smaller) without adding an embedding dependency,
matching the project's "free and local" constraint. Trade-off: this isn't
semantic RAG - a new category added to `policy.md` without a matching
section name falls back to the full document until the mapping is updated,
and a submitter typo in `category` (e.g. "mealz") also falls back safely
rather than silently misretrieving.
