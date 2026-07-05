# ADR-0005: LLM provider abstraction and failure handling

**Context**: M15 requires the LLM provider to be swappable by configuration,
and requires the system to fail cleanly, never silently, on provider errors.

**Decision**: A generic `LLMProvider` interface with a single `complete`
method, implemented separately per provider (`GeminiProvider` by default,
`StubProvider` for CI). Which one runs gets picked once at startup from
config, so there's no provider-specific code scattered elsewhere. If a call
fails or times out, it routes straight to `human_review` in
`decision-service`. Never a guess, never a default approval.

**Consequences**: Means an extra abstraction layer instead of calling
Gemini directly, but switching providers becomes a config change, and a
provider outage degrades to "ask a human" instead of failing silently or
approving something no one actually judged.
