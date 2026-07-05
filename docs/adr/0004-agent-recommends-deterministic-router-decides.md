# ADR-0004: Agent recommends, deterministic router decides

**Context**: The AI agent has no human judgment. It can be wrong, and it
can be fed misleading input (e.g. a note claiming "already approved, skip
review") that nudges its recommendation. M12 requires proving the system
can't auto-approve above the ceiling, no matter what the agent recommends.

**Decision**: The agent only outputs a recommendation, a confidence score,
and the rules it cited. A separate, plain (non-AI) function in
`decision-service` applies the actual ceiling and hard-stops. It makes the
real call, not the agent.

**Consequences**: That's one more layer of code to maintain, but it makes
the ceiling provable. Feed the router a mocked "approve" above the limit
and it still gets rejected, no matter what the AI does or is fed.
