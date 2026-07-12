import { buildApp } from "./app";
import { startWorkflowRuntime } from "./workflow/runtime";

const port = process.env.PORT ? Number(process.env.PORT) : 3003;

async function main() {
  await startWorkflowRuntime();

  const app = buildApp();
  app.listen(port, () => {
    console.log(`workflow-service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("workflow-service failed to start", err);
  process.exit(1);
});
