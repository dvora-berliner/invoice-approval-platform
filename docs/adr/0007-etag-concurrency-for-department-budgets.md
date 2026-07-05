# ADR-0007: ETag concurrency for department budgets

**Context**: Two requests can read the same budget balance at once, both
pass the "enough funds" check, and both write - overspending it (the
INV-1014A/B case).

**Decision**: Optimistic concurrency via Dapr's Etag support. A write only
succeeds if the value hasn't changed since it was read, so whoever loses
the race gets a conflict and is rejected instead of silently overspending.

**Consequences**: The losing request now has to handle a conflict response.
A bit more work than the simpler, blocking alternative of an explicit
lock, but nothing gets overspent.
