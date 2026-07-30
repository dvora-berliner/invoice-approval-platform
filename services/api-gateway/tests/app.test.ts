import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/dapr", () => ({
  invokeService: vi.fn(),
}));

vi.mock("../src/auth/jwt", () => ({
  verifyToken: vi.fn(),
  signToken: vi.fn(),
}));

vi.mock("../src/auth/userStore", () => ({
  getUser: vi.fn(),
  createUser: vi.fn(),
}));

import { invokeService } from "../src/dapr";
import { verifyToken } from "../src/auth/jwt";
import { app } from "../src/app";

const invokeServiceMock = vi.mocked(invokeService);
const verifyTokenMock = vi.mocked(verifyToken);

function authAs(role: "submitter" | "approver" | "admin") {
  verifyTokenMock.mockResolvedValue({ username: "test-user", role });
  return { Authorization: "Bearer valid-token" };
}

beforeEach(() => {
  invokeServiceMock.mockReset();
  verifyTokenMock.mockReset();
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
    { method: "post" as const, path: "/invoices", appId: "submission-service", upstreamPath: "invoices", role: "submitter" as const },
    {
      method: "get" as const,
      path: "/invoices/track-1/status",
      appId: "submission-service",
      upstreamPath: "invoices/track-1/status",
      role: "submitter" as const,
    },
    {
      method: "patch" as const,
      path: "/invoices/track-1/supplement",
      appId: "submission-service",
      upstreamPath: "invoices/track-1/supplement",
      role: "submitter" as const,
    },
    { method: "get" as const, path: "/approvals/queue", appId: "workflow-service", upstreamPath: "approvals/queue", role: "approver" as const },
    {
      method: "get" as const,
      path: "/approvals/track-1",
      appId: "workflow-service",
      upstreamPath: "approvals/track-1",
      role: "approver" as const,
    },
    {
      method: "post" as const,
      path: "/approvals/track-1/decision",
      appId: "workflow-service",
      upstreamPath: "approvals/track-1/decision",
      role: "approver" as const,
    },
    { method: "get" as const, path: "/audit/trail/track-1", appId: "audit-service", upstreamPath: "trail/track-1", role: "admin" as const },
    { method: "get" as const, path: "/audit/dashboard", appId: "audit-service", upstreamPath: "dashboard", role: "admin" as const },
    { method: "get" as const, path: "/audit/ceiling-proof", appId: "audit-service", upstreamPath: "ceiling-proof", role: "admin" as const },
    {
      method: "get" as const,
      path: "/audit/notifications/track-1",
      appId: "audit-service",
      upstreamPath: "notifications/track-1",
      role: "admin" as const,
    },
    { method: "post" as const, path: "/invoices", appId: "submission-service", upstreamPath: "invoices", role: "admin" as const },
    {
      method: "get" as const,
      path: "/approvals/queue",
      appId: "workflow-service",
      upstreamPath: "approvals/queue",
      role: "admin" as const,
    },
    {
      method: "post" as const,
      path: "/approvals/track-1/decision",
      appId: "workflow-service",
      upstreamPath: "approvals/track-1/decision",
      role: "admin" as const,
    },
  ])("proxies $method $path to $appId for an authorized $role", async ({ method, path, appId, upstreamPath, role }) => {
    invokeServiceMock.mockResolvedValue({ status: 200, body: { ok: true } });

    const res = await request(app)[method](path).set(authAs(role)).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(invokeServiceMock).toHaveBeenCalledWith(appId, upstreamPath, expect.anything());
  });

  it("relays the upstream status code as-is", async () => {
    invokeServiceMock.mockResolvedValue({ status: 404, body: { error: "not found" } });

    const res = await request(app).get("/invoices/missing/status").set(authAs("submitter"));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("returns 502 when the upstream service is unreachable", async () => {
    invokeServiceMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).get("/audit/dashboard").set(authAs("admin"));

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Upstream service audit-service unavailable" });
  });
});

describe("route protection (N1)", () => {
  it("rejects a proxied route with no Authorization header", async () => {
    const res = await request(app).get("/approvals/queue");

    expect(res.status).toBe(401);
    expect(invokeServiceMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    verifyTokenMock.mockRejectedValue(new Error("jwt expired"));

    const res = await request(app).get("/approvals/queue").set("Authorization", "Bearer stale-token");

    expect(res.status).toBe(401);
    expect(invokeServiceMock).not.toHaveBeenCalled();
  });

  it("rejects a submitter trying to reach an approver-only route", async () => {
    const res = await request(app).get("/approvals/queue").set(authAs("submitter"));

    expect(res.status).toBe(403);
    expect(invokeServiceMock).not.toHaveBeenCalled();
  });

  it("rejects an approver trying to reach an admin-only route", async () => {
    const res = await request(app).get("/audit/dashboard").set(authAs("approver"));

    expect(res.status).toBe(403);
    expect(invokeServiceMock).not.toHaveBeenCalled();
  });

  it("allows any authenticated role to check invoice status", async () => {
    invokeServiceMock.mockResolvedValue({ status: 200, body: { ok: true } });

    const res = await request(app).get("/invoices/track-1/status").set(authAs("approver"));

    expect(res.status).toBe(200);
  });
});
