import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { invokeService } from "../src/dapr";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    correlationId: "corr-1",
    body: undefined,
    ...overrides,
  } as Request;
}

describe("invokeService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("invokes the Dapr sidecar with the default port and forwards method + correlation header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ trackingId: "abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const req = mockReq({ method: "POST", body: { vendor: "Acme" } });
    const result = await invokeService("submission-service", "invoices", req);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3500/v1.0/invoke/submission-service/method/invoices",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-correlation-id": "corr-1",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ vendor: "Acme" }),
      }),
    );
    expect(result).toEqual({ status: 200, body: { trackingId: "abc" } });
  });

  it("uses DAPR_HTTP_PORT from the environment when set", async () => {
    vi.stubEnv("DAPR_HTTP_PORT", "4000");
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    // Re-import so the module re-reads process.env at load time.
    vi.resetModules();
    const { invokeService: invokeWithCustomPort } = await import("../src/dapr");

    await invokeWithCustomPort("workflow-service", "approvals/queue", mockReq());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/v1.0/invoke/workflow-service/method/approvals/queue",
      expect.anything(),
    );
  });

  it("does not send a body for GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await invokeService("audit-service", "dashboard", mockReq({ method: "GET" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: undefined }),
    );
  });

  it("does not send a body for HEAD requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await invokeService("audit-service", "dashboard", mockReq({ method: "HEAD" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: undefined }),
    );
  });

  it("defaults a missing POST body to an empty object", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await invokeService("submission-service", "invoices", mockReq({ method: "POST", body: undefined }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: "{}" }),
    );
  });

  it("returns an undefined body when the upstream response is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeService("workflow-service", "approvals/queue", mockReq());

    expect(result).toEqual({ status: 204, body: undefined });
  });
});
