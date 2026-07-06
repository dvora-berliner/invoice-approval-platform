import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3004;

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "payment-service" });
});

app.listen(port, () => {
  console.log(`payment-service listening on port ${port}`);
});
