# ADR-0010: Why the bonus hooks are low-cost to add later

**Context**: The bonus items (N1, N3, N4, N5, B1, B2, etc.) are optional and
won't necessarily be built before the deadline. I need the base
architecture to not require rework if I come back and add one later.

**Decision**: Each bonus gets a specific, pre-identified extension point in
the existing design, instead of relying on general flexibility:
`api-gateway`'s auth middleware slot (N1), the outbox and resiliency-policy
mechanisms already in place (N3), correlation id propagation already
flowing through every call (N4), a dedicated `getRelevantPolicyContext(invoice)`
function in `decision-service` whose internals can be swapped later (N5),
and separate, non-core layers for the verification runner (B1) and agent
tool functions (B2).

**Consequences**: Adding a bonus later means filling in an already-named
extension point - not splitting an existing service, changing an API
contract, or touching the main request flow. The cost of this is deciding
those extension points up front, before any bonus is actually built.
