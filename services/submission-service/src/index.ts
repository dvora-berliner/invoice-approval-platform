import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "submission-service" });
});

app.listen(port, () => {
  console.log(`submission-service listening on port ${port}`);
});
