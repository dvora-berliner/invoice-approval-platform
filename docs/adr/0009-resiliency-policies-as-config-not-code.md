# ADR-0009: Resiliency policies as config, not code

**Context**: Calls between services (e.g. `workflow-service` ->
`payment-service`) can fail transiently. Writing retry/timeout/circuit-breaker
logic by hand would mean repeating it in every one of the 6 services, and
changing the policy would mean touching code and redeploying.

**Decision**: Resiliency policies (retries, timeouts, circuit breakers)
live once in Dapr resiliency YAML instead of application code. The sidecar
applies them to every call automatically, and different service pairs can
get different policies with zero code changes.

**Consequences**: Tuning a policy is a config edit, not a redeploy, and
every service gets the same resiliency behavior without each one having to
implement (and possibly botch) its own.
