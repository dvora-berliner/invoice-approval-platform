import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/jwt", () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from "../../src/auth/jwt";
import { authenticate, requireRole } from "../../src/auth/middleware";

const verifyTokenMock = vi.mocked(verifyToken);

function mockReqRes(headers: Record<string, string> = {}) {
  const req: any = { headers, log: { warn: vi.fn() } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticate", () => {
  it("rejects a missing Authorization header", async () => {
    const { req, res, next } = mockReqRes();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a header that isn't a Bearer token", async () => {
    const { req, res, next } = mockReqRes({ authorization: "Basic abc123" });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user and calls next() for a valid token", async () => {
    verifyTokenMock.mockResolvedValue({ username: "alice", role: "approver" });
    const { req, res, next } = mockReqRes({ authorization: "Bearer good-token" });

    await authenticate(req, res, next);

    expect(req.user).toEqual({ username: "alice", role: "approver" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    verifyTokenMock.mockRejectedValue(new Error("jwt malformed"));
    const { req, res, next } = mockReqRes({ authorization: "Bearer bad-token" });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("calls next() when the user has one of the allowed roles", () => {
    const { req, res, next } = mockReqRes();
    req.user = { username: "alice", role: "approver" };

    requireRole("approver", "admin")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the user's role isn't allowed", () => {
    const { req, res, next } = mockReqRes();
    req.user = { username: "alice", role: "submitter" };

    requireRole("approver", "admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 403 when req.user is missing (authenticate didn't run)", () => {
    const { req, res, next } = mockReqRes();

    requireRole("approver")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
