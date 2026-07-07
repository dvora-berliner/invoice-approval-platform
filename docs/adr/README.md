# Architecture Decision Records

Each file in this directory is one decision that needs to be defended: the
situation that forced a choice, what was decided, and what it costs/gains.

Format per decision: Context (what forced the choice, what alternatives
existed) -> Decision (what was chosen) -> Consequences

## Index

- [0001 - Service count and boundaries](0001-service-count-and-boundaries.md)
- [0002 - Language/platform choice](0002-language-platform-choice.md)
- [0003 - Saga: orchestration vs choreography](0003-saga-orchestration-vs-choreography.md)
- [0004 - Agent recommends, deterministic router decides](0004-agent-recommends-deterministic-router-decides.md)
- [0005 - LLM provider abstraction and failure handling](0005-llm-provider-abstraction-and-failure-handling.md)
- [0006 - Redis vs Postgres, service by service](0006-redis-vs-postgres-service-by-service.md)
- [0007 - ETag concurrency for department budgets](0007-etag-concurrency-for-department-budgets.md)
- [0008 - Outbox pattern for dual-write consistency](0008-outbox-pattern-for-dual-write-consistency.md)
- [0009 - Resiliency policies as config, not code](0009-resiliency-policies-as-config-not-code.md)
- [0010 - Why the bonus hooks are low-cost to add later](0010-bonus-hooks-are-low-cost-to-add-later.md)
- [0011 - Dapr Workflow SDK reconnect - app-level supervisor](0011-workflow-sdk-reconnect-supervisor.md)
