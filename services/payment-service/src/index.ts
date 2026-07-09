import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router as paymentsRouter } from "./routes";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3004;

app.use(express.json());
app.use(correlationMiddleware("payment-service"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "payment-service" });
});

app.use(paymentsRouter);

app.listen(port, () => {
  console.log(`payment-service listening on port ${port}`);
});
