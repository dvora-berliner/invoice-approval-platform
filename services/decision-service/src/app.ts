import express, { type Express } from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { createDecisionRouter } from "./routes";
import type { LLMProvider } from "./llm/provider";
import type { InvoiceForDecision } from "./types";

export function buildApp(
  provider: LLMProvider,
  getRelevantPolicyContext: (invoice: InvoiceForDecision) => string,
): Express {
  const app = express();

  app.use(express.json());
  app.use(correlationMiddleware("decision-service"));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "decision-service" });
  });

  app.use(createDecisionRouter(provider, getRelevantPolicyContext));

  return app;
}
