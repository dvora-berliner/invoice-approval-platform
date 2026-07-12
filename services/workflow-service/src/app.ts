import express, { type Express } from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

export function buildApp(): Express {
  const app = express();

  app.use(express.json({ type: ["application/json", "application/cloudevents+json"] }));
  app.use(correlationMiddleware("workflow-service"));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "workflow-service" });
  });

  app.use(router);

  return app;
}
