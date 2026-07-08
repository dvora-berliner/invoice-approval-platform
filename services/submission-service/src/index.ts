import express from "express";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(express.json());
app.use(correlationMiddleware("submission-service"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "submission-service" });
});

app.use(router);

app.listen(port, () => {
  console.log(`submission-service listening on port ${port}`);
});
