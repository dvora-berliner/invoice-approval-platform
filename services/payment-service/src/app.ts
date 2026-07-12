import express, { type Express } from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router as paymentsRouter } from "./routes";

export function buildApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(correlationMiddleware("payment-service"));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "payment-service" });
  });

  app.use(paymentsRouter);

  return app;
}
