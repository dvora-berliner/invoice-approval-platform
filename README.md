# ApprovalFlow

Invoice & Expense Approval Platform - a microservice-based, AI-assisted system
that judges invoices/expenses against a company policy, auto-approves the
low-risk majority, and escalates the rest to a human approver.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design, service
boundaries, and sequence diagrams.

## Status

Architecture and planning phase complete. Implementation starting on
`feature/infrastructure`.

## Technologies (draft, expand as built)

- Node.js / TypeScript
- Dapr (service invocation, pub/sub, state, secrets, configuration, resiliency)
- Redis, Postgres
- Gemini (default LLM provider, swappable)

## Running locally

TODO - filled in once `docker-compose.yml` exists.

## Testing

TODO - filled in once the verification script (D5) exists.
