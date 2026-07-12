# ADR-0012: policy.md hot-reload via bind mount, not Dapr Configuration

**Context**: F7 requires the expense policy and autonomy thresholds to be
changeable without a redeploy. The numeric thresholds (`AUTONOMY-CEILING`,
`AUTONOMY-CONFIDENCE`) already do this correctly via Dapr Configuration
(Redis-backed, fetched fresh per request). `policy.md`'s free-text content
was still read once at process startup and baked into the Docker image via
`COPY policy.md ./policy.md` - editing it required a rebuild. Two ways to
close that gap: (a) route the whole markdown file through Dapr Configuration
as a Redis value, matching the thresholds exactly, or (b) re-read the file
from disk on every request and bind-mount it into the container.

**Decision**: (b) - `decision-service` now calls `loadPolicyContext()`
(`services/decision-service/src/policy/configStore.ts`) fresh on every
`/decide` request instead of once at startup, and `docker-compose.yml`
bind-mounts `./policy.md:/app/policy.md:ro` on `decision-service`, overriding
the image's baked-in copy at runtime.

**Consequences**: Editing `policy.md` on the host takes effect on the very
next request, no rebuild or restart, matching the thresholds' hot-reload
behavior in practice even though the mechanism differs. Cheaper to build than
option (a): no change to `configuration-seed`, no multi-KB value stuffed into
a single Redis key, no markdown-in-JSON escaping. Trade-off: this specific
hot-reload path only works when the file is bind-mounted (i.e. in this
`docker-compose.yml` setup) - a plain `docker run` off the built image alone
would fall back to the baked-in copy, since there's no Dapr Configuration
entry backing it the way there is for the thresholds.
