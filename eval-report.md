# Decision engine eval report

Generated: 2026-07-31T08:22:19.655Z
Fixtures: `sample-invoices.json` (StubProvider, deterministic - no network call)

## Summary

- **19/19 passed** (100.0%)
- 0 failed, 1 skipped (duplicate-handling fixtures - not decision-service's job)

## Results

| ID | Scenario | Expected | Got | Result |
|---|---|---|---|---|
| INV-1001 | meals | auto_approve | auto_approve | PASS |
| INV-1002 | saas | auto_approve | auto_approve | PASS |
| INV-1003 | meals | human_review | human_review | PASS |
| INV-1004 | hardware | human_review | human_review | PASS |
| INV-1005 | meals | human_review | human_review | PASS |
| INV-1006 | hardware | human_review | human_review | PASS |
| INV-1007 | duplicate-of:INV-1001 | duplicate | - | SKIP |
| INV-1008 | fraud-pattern | human_review | human_review | PASS |
| INV-1009 | foreign-currency | human_review | human_review | PASS |
| INV-1010 | edge-confidence | human_review | human_review | PASS |
| INV-1011 | hard-stop-under-ceiling | human_review | human_review | PASS |
| INV-1012 | payment-failure:journey-D | human_review | human_review | PASS |
| INV-1013 | adversarial-memo | human_review | human_review | PASS |
| INV-1014A | concurrency-pair:INV-1014B | human_review | human_review | PASS |
| INV-1014B | concurrency-pair:INV-1014A | human_review | human_review | PASS |
| INV-1015 | reject:not-reimbursable | reject | reject | PASS |
| INV-1016 | auto-approve:travel-eligible | auto_approve | auto_approve | PASS |
| INV-1017 | auto-approve:hardware-eligible | auto_approve | auto_approve | PASS |
| INV-1018 | policy-violation:saas-cap | human_review | human_review | PASS |
| INV-1019 | human:travel-over-1500 | human_review | human_review | PASS |
