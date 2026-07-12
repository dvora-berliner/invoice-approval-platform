import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { join } from "path";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";
import { correlationMiddleware } from "@approvalflow/logging";
import { router } from "./routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("api-gateway"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

// D4: interactive API docs at /docs, generated from docs/openapi.yaml - served here
// since api-gateway is the single external entry point (M6).
/* v8 ignore start -- static docs wiring, no branching logic to test */
const openapiSpec = parseYaml(readFileSync(join(__dirname, "../../../docs/openapi.yaml"), "utf-8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
/* v8 ignore stop */

app.use(router);
