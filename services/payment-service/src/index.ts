import { buildApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 3004;

const app = buildApp();
app.listen(port, () => {
  console.log(`payment-service listening on port ${port}`);
});
