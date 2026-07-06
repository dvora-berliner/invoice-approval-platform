import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3003;

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "workflow-service" });
});

app.listen(port, () => {
  console.log(`workflow-service listening on port ${port}`);
});
