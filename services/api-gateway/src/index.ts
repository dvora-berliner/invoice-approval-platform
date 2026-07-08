import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(correlationMiddleware("api-gateway"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
