import { buildApp } from "./app";
import { initPool, ensureSchema } from "./db";

const port = process.env.PORT ? Number(process.env.PORT) : 3005;
const daprHttpPort = process.env.DAPR_HTTP_PORT ? Number(process.env.DAPR_HTTP_PORT) : 3500;

// The Dapr sidecar can take a while to bind its HTTP port after this process
// starts (placement handshake included) - especially on a cold CI runner with
// no image cache - so a cold-start secret fetch retries for up to 30s instead
// of failing once.
async function getSecret(name: string, retries = 30, delayMs = 1000): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`http://localhost:${daprHttpPort}/v1.0/secrets/local-secrets/${name}`);
      if (!res.ok) {
        throw new Error(`failed to load secret "${name}" from Dapr secret store: ${res.status}`);
      }
      const body = (await res.json()) as Record<string, string>;
      return body[name];
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const postgresPassword = await getSecret("postgres-password");
  console.log(`audit-service: loaded Postgres credential via Dapr (length ${postgresPassword.length})`);

  initPool(postgresPassword);
  await ensureSchema();
  console.log("audit-service: Postgres schema ready");

  const app = buildApp();
  app.listen(port, () => {
    console.log(`audit-service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("audit-service failed to start", err);
  process.exit(1);
});
