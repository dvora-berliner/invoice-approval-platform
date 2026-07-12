import { readFileSync } from "fs";
import { join } from "path";
import { buildApp } from "./app";
import { createProvider } from "./providerFactory";

const port = process.env.PORT ? Number(process.env.PORT) : 3002;
const llmProviderName = process.env.LLM_PROVIDER ?? "stub";

async function main() {
  const provider = await createProvider(llmProviderName);
  const policyContext = readFileSync(join(__dirname, "../../../policy.md"), "utf-8");
  const app = buildApp(provider, policyContext);

  app.listen(port, () => {
    console.log(`decision-service listening on port ${port} (LLM_PROVIDER=${llmProviderName})`);
  });
}

main().catch((err) => {
  console.error("decision-service failed to start", err);
  process.exit(1);
});
