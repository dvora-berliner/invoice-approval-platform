# ADR-0006: Redis vs Postgres, service by service

**Context**: Six services need somewhere to keep state.

**Decision**: **Redis** for everything except `audit-service` - idempotency
checks, `workflow-service`'s paused-workflow state, budget concurrency, and
pub/sub between all services. It's fast, it's already Dapr's pub/sub
broker, and with persistence configured (a mounted volume) it holds up
about as well as Postgres would. **Postgres** stays only for
`audit-service`, since F8/F9 need real aggregation and ordered-trail
queries that a key-value store isn't built for.

**Consequences**: One store to run for most of the system, Postgres added
only where it actually earns its place.
