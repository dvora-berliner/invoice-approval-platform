import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { correlationMiddleware } from "../src/middleware";

function mockReqRes(headers: Record<string, string> = {}) {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const res = {
    setHeader: vi.fn(),
  } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe("correlationMiddleware", () => {
  it("reuses an incoming x-correlation-id header", () => {
    const { req, res, next } = mockReqRes({ "x-correlation-id": "existing-id" });

    correlationMiddleware("svc")(req, res, next);

    expect(req.correlationId).toBe("existing-id");
    expect(res.setHeader).toHaveBeenCalledWith("x-correlation-id", "existing-id");
    expect(next).toHaveBeenCalledOnce();
  });

  it("generates a new correlation id when the header is missing", () => {
    const { req, res, next } = mockReqRes();

    correlationMiddleware("svc")(req, res, next);

    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith("x-correlation-id", req.correlationId);
    expect(next).toHaveBeenCalledOnce();
  });

  it("generates a new correlation id when the header is empty", () => {
    const { req, res, next } = mockReqRes({ "x-correlation-id": "" });

    correlationMiddleware("svc")(req, res, next);

    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("attaches a working logger to the request", () => {
    const { req, res, next } = mockReqRes({ "x-correlation-id": "log-id" });

    correlationMiddleware("my-service")(req, res, next);

    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
    req.log.info("test message");
    spy.mockRestore();

    const line = JSON.parse(chunks[0]);
    expect(line).toMatchObject({ service: "my-service", correlationId: "log-id", message: "test message" });
  });
});
