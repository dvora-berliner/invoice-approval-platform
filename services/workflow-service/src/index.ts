import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3003;

app.use(correlationMiddleware("workflow-service"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "workflow-service" });
});

app.listen(port, () => {
  console.log(`workflow-service listening on port ${port}`);
});
