# ADR-0008: Outbox pattern for dual-write consistency

**Context**: `submission-service` needs to both save a new invoice and
publish an event that starts the workflow. Doing these as two separate
operations leaves a crash window: if the process dies between them, the
invoice can be saved with no event ever published (stuck forever), or an
event published for an invoice that was never actually saved.

**Decision**: Outbox pattern - the invoice row and an outbox event row land
in the same DB transaction, so they succeed or fail together. A separate
publisher picks up unsent rows and pushes them to pub/sub, then marks them
sent.

**Consequences**: Costs a table and a small publisher process to run,
instead of publishing at write time directly. In return, the database and
the event stream can never disagree about whether an invoice was actually
submitted.
