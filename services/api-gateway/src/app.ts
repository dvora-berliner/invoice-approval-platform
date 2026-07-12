import express from "express";
import cors from "cors";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("api-gateway"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.use(router);
