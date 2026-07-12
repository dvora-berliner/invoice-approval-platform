import express, { type Express } from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router as subscriptionsRouter } from "./subscriptions";
import { router as queryRouter } from "./routes";

export function buildApp(): Express {
  const app = express();

  app.use(express.json({ type: ["application/json", "application/cloudevents+json"] }));
  app.use(correlationMiddleware("audit-service"));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "audit-service" });
  });

  app.use(subscriptionsRouter);
  app.use(queryRouter);

  return app;
}
