# ADR-0002: Language/platform choice

**Context**: Node.js/TypeScript, Python, and .NET were all real options.

**Decision**: TypeScript/Node.js - I control it almost at native-tongue
level, it shares types across all 6 services and with the UI (M7), and JSON
is native (no classes/attributes needed to parse or serialize, unlike C#).

**Consequences**: C# is better for Dapr workflow. I'll simply test it, and if
it doesn't work well enough, I'll write it manually - but the requirement will
still be met.
