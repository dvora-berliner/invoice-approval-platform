import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/dapr", () => ({
  invokeService: vi.fn(),
}));

import { invokeService } from "../src/dapr";
import { app } from "../src/app";

const invokeServiceMock = vi.mocked(invokeService);

beforeEach(() => {
  invokeServiceMock.mockReset();
});

describe("GET /healthz", () => {
  it("reports ok without touching upstream services", async () => {
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "api-gateway" });
    expect(invokeServiceMock).not.toHaveBeenCalled();
  });
});

describe("CORS", () => {
  it("allows cross-origin requests", async () => {
    const res = await request(app).get("/healthz").set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("proxied routes", () => {
  it.each([
    { method: "post" as const, path: "/invoices", appId: "submission-service", upstreamPath: "invoices" },
    {
      method: "get" as const,
      path: "/invoices/track-1/status",
      appId: "submission-service",
      upstreamPath: "invoices/track-1/status",
    },
    {
      method: "patch" as const,
      path: "/invoices/track-1/supplement",
      appId: "submission-service",
      upstreamPath: "invoices/track-1/supplement",
    },
    { method: "get" as const, path: "/approvals/queue", appId: "workflow-service", upstreamPath: "approvals/queue" },
    { method: "get" as const, path: "/approvals/track-1", appId: "workflow-service", upstreamPath: "approvals/track-1" },
    {
      method: "post" as const,
      path: "/approvals/track-1/decision",
      appId: "workflow-service",
      upstreamPath: "approvals/track-1/decision",
    },
    { method: "get" as const, path: "/audit/trail/track-1", appId: "audit-service", upstreamPath: "trail/track-1" },
    { method: "get" as const, path: "/audit/dashboard", appId: "audit-service", upstreamPath: "dashboard" },
    { method: "get" as const, path: "/audit/ceiling-proof", appId: "audit-service", upstreamPath: "ceiling-proof" },
    {
      method: "get" as const,
      path: "/audit/notifications/track-1",
      appId: "audit-service",
      upstreamPath: "notifications/track-1",
    },
  ])("proxies $method $path to $appId", async ({ method, path, appId, upstreamPath }) => {
    invokeServiceMock.mockResolvedValue({ status: 200, body: { ok: true } });

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(invokeServiceMock).toHaveBeenCalledWith(appId, upstreamPath, expect.anything());
  });

  it("relays the upstream status code as-is", async () => {
    invokeServiceMock.mockResolvedValue({ status: 404, body: { error: "not found" } });

    const res = await request(app).get("/invoices/missing/status");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("returns 502 when the upstream service is unreachable", async () => {
    invokeServiceMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).get("/audit/dashboard");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Upstream service audit-service unavailable" });
  });
});
