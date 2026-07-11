import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";
import { startWorkflowRuntime } from "./workflow/runtime";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3003;

app.use(express.json({ type: ["application/json", "application/cloudevents+json"] }));
app.use(correlationMiddleware("workflow-service"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "workflow-service" });
});

app.use(router);

async function main() {
  await startWorkflowRuntime();

  app.listen(port, () => {
    console.log(`workflow-service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("workflow-service failed to start", err);
  process.exit(1);
});
