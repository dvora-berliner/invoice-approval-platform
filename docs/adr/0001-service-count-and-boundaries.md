# ADR-0001: Service count and boundaries

**Context**: M3 requires 3+ services. Merging intake with AI judgment would
break F1 - slow LLM calls would delay the immediate acknowledgement.

**Decision**: 6 services, split by responsibility: `api-gateway`,
`submission-service`, `decision-service`, `workflow-service`,
`payment-service`, `audit-service`. `workflow-service` and
`payment-service` stay seperate so the saga (M9) crosses an actual process
boundary instead of just an in-process `try/catch`. There was a
`notification-service` on the table too, but it ended up too thin to
justify its own container, so it got folded into `audit-service`.

**Consequences**: More containers to build, run, and keep talking to each
other correctly. Worth it though, for boundaries that are actually real
instead of an arbitrary split.
