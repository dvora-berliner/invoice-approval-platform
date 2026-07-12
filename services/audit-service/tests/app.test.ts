import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app";

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const app = buildApp();
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "audit-service" });
  });
});
