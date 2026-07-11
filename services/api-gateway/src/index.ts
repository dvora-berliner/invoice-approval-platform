import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());
app.use(correlationMiddleware("api-gateway"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.use(router);

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
