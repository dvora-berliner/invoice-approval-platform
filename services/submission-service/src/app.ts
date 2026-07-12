import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

export const app = express();

app.use(express.json());
app.use(correlationMiddleware("submission-service"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "submission-service" });
});

app.use(router);
