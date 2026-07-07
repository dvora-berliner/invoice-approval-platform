# ADR-0011: Dapr Workflow SDK reconnect - app-level supervisor

**Context**: A POC proved Dapr Workflow durability works (state survives a
sidecar restart), but exposed a real SDK bug: the Node.js Workflow
worker never recovers from its first-ever disconnection - no built-in
retry. Three options: an app-level supervisor loop, rely on Docker to
restart the whole container, or patch the SDK directly.

**Decision**: App-level supervisor loop in `workflow-service` - recreate
and restart the worker whenever it dies.

**Consequences**: A bit of extra code to own, but it avoids two problems
already found in this repo's setup: container-level restart doesn't
reliably recover the `-dapr` sidecar's network namespace, and patching a
third-party package breaks on every `npm install`.
