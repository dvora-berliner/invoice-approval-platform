import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3005;
const daprHttpPort = process.env.DAPR_HTTP_PORT ? Number(process.env.DAPR_HTTP_PORT) : 3500;

async function getSecret(name: string): Promise<string> {
  const res = await fetch(`http://localhost:${daprHttpPort}/v1.0/secrets/local-secrets/${name}`);
  if (!res.ok) {
    throw new Error(`failed to load secret "${name}" from Dapr secret store: ${res.status}`);
  }
  const body = (await res.json()) as Record<string, string>;
  return body[name];
}

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "audit-service" });
});

async function main() {
  const postgresPassword = await getSecret("postgres-password");
  console.log(`audit-service: loaded Postgres credential via Dapr (length ${postgresPassword.length})`);

  app.listen(port, () => {
    console.log(`audit-service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("audit-service failed to start", err);
  process.exit(1);
});
