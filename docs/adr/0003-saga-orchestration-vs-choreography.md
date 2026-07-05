# ADR-0003: Saga - orchestration vs choreography

**Context**: M9's payment saga can be coordinated two ways: orchestration
(one central coordinator drives every step) or choreography (services react
to each other's events independently, no central coordinator).

**Decision**: Went with orchestration, via Dapr Workflow in
`workflow-service`. The whole sequence - reserve budget, reserve payment,
execute, compensate on failure - lives in one place, so it's easy to
follow and easy to prove the compensation logic actually works.

**Consequences**: `workflow-service` ends up as a single point that has to
get this right, and it's more tightly coupled to everything else than
choreography would've been. But the tradeoff is worth it: one place to
trace the entire payment flow instead of piecing it together from
scattered event handlers.
