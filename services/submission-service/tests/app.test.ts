import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/dapr", () => ({
  claimDedupKey: vi.fn(),
  getInvoiceRecord: vi.fn(),
  getInvoiceRecordWithEtag: vi.fn(),
  getState: vi.fn(),
  getStateWithEtag: vi.fn(),
  saveInvoiceRecord: vi.fn(),
  saveInvoiceRecordWithEtag: vi.fn(),
  saveInvoiceRecordWithOutboxEvent: vi.fn(),
  saveStateWithEtag: vi.fn(),
}));

import {
  claimDedupKey,
  getInvoiceRecord,
  getInvoiceRecordWithEtag,
  getState,
  getStateWithEtag,
  saveInvoiceRecord,
  saveInvoiceRecordWithEtag,
  saveInvoiceRecordWithOutboxEvent,
  saveStateWithEtag,
} from "../src/dapr";
import { app } from "../src/app";

const claimDedupKeyMock = vi.mocked(claimDedupKey);
const getInvoiceRecordMock = vi.mocked(getInvoiceRecord);
const getInvoiceRecordWithEtagMock = vi.mocked(getInvoiceRecordWithEtag);
const getStateMock = vi.mocked(getState);
const getStateWithEtagMock = vi.mocked(getStateWithEtag);
const saveInvoiceRecordMock = vi.mocked(saveInvoiceRecord);
const saveInvoiceRecordWithEtagMock = vi.mocked(saveInvoiceRecordWithEtag);
const saveInvoiceRecordWithOutboxEventMock = vi.mocked(saveInvoiceRecordWithOutboxEvent);
const saveStateWithEtagMock = vi.mocked(saveStateWithEtag);

beforeEach(() => {
  vi.clearAllMocks();
  // Counter/index writes succeed by default - individual tests override to test failure paths.
  getStateMock.mockResolvedValue(null);
  getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
  saveStateWithEtagMock.mockResolvedValue(true);
});

const validSubmission = { vendor: "Acme", invoiceNumber: "INV-1", total: 100 };

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "submission-service" });
  });
});

describe("POST /invoices", () => {
  it("rejects an invalid submission with 400", async () => {
    const res = await request(app).post("/invoices").send({ vendor: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid invoice submission");
    expect(claimDedupKeyMock).not.toHaveBeenCalled();
  });

  it("accepts a new submission and returns a trackingId and prettyId", async () => {
    claimDedupKeyMock.mockResolvedValue({ claimed: true });
    saveInvoiceRecordMock.mockResolvedValue(undefined);

    const res = await request(app).post("/invoices").send(validSubmission);

    expect(res.status).toBe(202);
    expect(res.body.trackingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.prettyId).toMatch(/^INV-\d{4}-0001$/);
    expect(saveInvoiceRecordMock).toHaveBeenCalledOnce();
  });

  it("tags the record with the forwarded username and indexes it for both the submitter and the global list", async () => {
    claimDedupKeyMock.mockResolvedValue({ claimed: true });
    saveInvoiceRecordMock.mockResolvedValue(undefined);

    await request(app).post("/invoices").set("x-user-username", "alice").send(validSubmission);

    expect(saveInvoiceRecordMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ submittedByUsername: "alice" }),
    );
    expect(saveStateWithEtagMock).toHaveBeenCalledWith("submitter-index:alice", expect.any(Array), "");
    expect(saveStateWithEtagMock).toHaveBeenCalledWith("all-invoices-index", expect.any(Array), "");
  });

  it("returns 500 when allocating a pretty id fails after retries", async () => {
    claimDedupKeyMock.mockResolvedValue({ claimed: true });
    getStateWithEtagMock.mockResolvedValue({ value: 0, etag: "stale" });
    saveStateWithEtagMock.mockResolvedValue(false);

    const res = await request(app).post("/invoices").send(validSubmission);

    expect(res.status).toBe(500);
    expect(saveInvoiceRecordMock).not.toHaveBeenCalled();
  });

  it("short-circuits a duplicate submission with the existing record", async () => {
    claimDedupKeyMock.mockResolvedValue({ claimed: false, existingTrackingId: "track-existing" });
    getInvoiceRecordMock.mockResolvedValue({
      trackingId: "track-existing",
      status: "paid",
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 100,
      submittedAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
    });

    const res = await request(app).post("/invoices").send(validSubmission);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      trackingId: "track-existing",
      duplicateSubmission: true,
      message: "This invoice was already submitted (current status: paid).",
    });
  });

  it("falls back to a generic duplicate message when the existing record can't be found", async () => {
    claimDedupKeyMock.mockResolvedValue({ claimed: false, existingTrackingId: "track-existing" });
    getInvoiceRecordMock.mockResolvedValue(null);

    const res = await request(app).post("/invoices").send(validSubmission);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Your invoice was received and is awaiting review.");
  });

  it("returns 500 when an unexpected error occurs", async () => {
    claimDedupKeyMock.mockRejectedValue(new Error("state store down"));

    const res = await request(app).post("/invoices").send(validSubmission);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to submit invoice" });
  });
});

describe("GET /invoices/:trackingId/status", () => {
  it("returns 404 when the invoice does not exist", async () => {
    getInvoiceRecordMock.mockResolvedValue(null);
    const res = await request(app).get("/invoices/missing/status");
    expect(res.status).toBe(404);
  });

  it.each([
    ["pending", "Your invoice was received and is awaiting review."],
    ["awaiting_approval", "Your invoice needs a human approver's decision."],
    ["rejected", "Your invoice was rejected."],
    ["paid", "Your invoice was approved and payment was completed."],
    ["payment_failed", "Your invoice was approved, but payment failed and is being resolved."],
  ])("maps status %s to its plain-language message", async (status, expectedMessage) => {
    getInvoiceRecordMock.mockResolvedValue({
      trackingId: "t1",
      status: status as never,
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 100,
      submittedAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
    });

    const res = await request(app).get("/invoices/t1/status");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(expectedMessage);
  });

  it("prefers an explicit reason over the generic status message", async () => {
    getInvoiceRecordMock.mockResolvedValue({
      trackingId: "t1",
      status: "rejected",
      reason: "Missing receipt",
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 100,
      submittedAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
    });

    const res = await request(app).get("/invoices/t1/status");

    expect(res.body.message).toBe("Missing receipt");
  });

  it("returns 500 on an unexpected error", async () => {
    getInvoiceRecordMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/invoices/t1/status");
    expect(res.status).toBe(500);
  });

  it("resolves a pretty id to its record when the direct lookup misses", async () => {
    getInvoiceRecordMock.mockImplementation(async (key: string) =>
      key === "invoice:t1"
        ? {
            trackingId: "t1",
            prettyId: "INV-2026-0001",
            status: "pending",
            vendor: "Acme",
            invoiceNumber: "INV-1",
            total: 100,
            submittedAt: "2026-01-01T00:00:00.000Z",
            correlationId: "corr-1",
          }
        : null,
    );
    getStateMock.mockResolvedValue("t1");

    const res = await request(app).get("/invoices/inv-2026-0001/status");

    expect(getStateMock).toHaveBeenCalledWith("pretty:INV-2026-0001");
    expect(res.status).toBe(200);
    expect(res.body.trackingId).toBe("t1");
  });
});

describe("GET /invoices/mine", () => {
  it("400s when no user identity was forwarded", async () => {
    const res = await request(app).get("/invoices/mine");
    expect(res.status).toBe(400);
  });

  it("returns only the requesting user's invoices, newest first", async () => {
    getStateMock.mockResolvedValue(["t1", "t2"]);
    getInvoiceRecordMock.mockImplementation(async (key: string) => ({
      trackingId: key.replace("invoice:", ""),
      prettyId: `INV-2026-000${key.endsWith("t1") ? "1" : "2"}`,
      status: "pending",
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 100,
      submittedAt: key.endsWith("t1") ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z",
      correlationId: "corr-1",
    }));

    const res = await request(app).get("/invoices/mine").set("x-user-username", "alice");

    expect(getStateMock).toHaveBeenCalledWith("submitter-index:alice");
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { trackingId: string }) => i.trackingId)).toEqual(["t2", "t1"]);
  });
});

describe("GET /invoices", () => {
  it("returns every indexed invoice", async () => {
    getStateMock.mockResolvedValue(["t1"]);
    getInvoiceRecordMock.mockResolvedValue({
      trackingId: "t1",
      prettyId: "INV-2026-0001",
      status: "pending",
      vendor: "Acme",
      invoiceNumber: "INV-1",
      total: 100,
      submittedAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
    });

    const res = await request(app).get("/invoices");

    expect(getStateMock).toHaveBeenCalledWith("all-invoices-index");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe("PATCH /invoices/:trackingId/status", () => {
  it("rejects an invalid body with 400", async () => {
    const res = await request(app).patch("/invoices/t1/status").send({ status: "bogus" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the invoice does not exist", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    const res = await request(app).patch("/invoices/missing/status").send({ status: "paid", reason: "ok" });
    expect(res.status).toBe(404);
  });

  it("ignores an out-of-order regression away from a terminal status", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({
      value: {
        trackingId: "t1",
        status: "paid",
        vendor: "Acme",
        invoiceNumber: "INV-1",
        total: 100,
        submittedAt: "2026-01-01T00:00:00.000Z",
        correlationId: "corr-1",
      },
      etag: "etag-1",
    });

    const res = await request(app).patch("/invoices/t1/status").send({ status: "pending", reason: "retry" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trackingId: "t1", status: "paid" });
    expect(saveInvoiceRecordWithEtagMock).not.toHaveBeenCalled();
  });

  it("updates status on a successful conditional save", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({
      value: {
        trackingId: "t1",
        status: "pending",
        vendor: "Acme",
        invoiceNumber: "INV-1",
        total: 100,
        submittedAt: "2026-01-01T00:00:00.000Z",
        correlationId: "corr-1",
      },
      etag: "etag-1",
    });
    saveInvoiceRecordWithEtagMock.mockResolvedValue(true);

    const res = await request(app).patch("/invoices/t1/status").send({ status: "awaiting_approval", reason: "escalated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trackingId: "t1", status: "awaiting_approval" });
  });

  it("returns 409 after exhausting retries on repeated etag conflicts", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({
      value: {
        trackingId: "t1",
        status: "pending",
        vendor: "Acme",
        invoiceNumber: "INV-1",
        total: 100,
        submittedAt: "2026-01-01T00:00:00.000Z",
        correlationId: "corr-1",
      },
      etag: "etag-1",
    });
    saveInvoiceRecordWithEtagMock.mockResolvedValue(false);

    const res = await request(app).patch("/invoices/t1/status").send({ status: "awaiting_approval", reason: "escalated" });

    expect(res.status).toBe(409);
  });

  it("returns 500 on an unexpected error", async () => {
    getInvoiceRecordWithEtagMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).patch("/invoices/t1/status").send({ status: "paid", reason: "ok" });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /invoices/:trackingId/supplement", () => {
  it("rejects an empty body with 400", async () => {
    const res = await request(app).patch("/invoices/t1/supplement").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the invoice does not exist", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    const res = await request(app).patch("/invoices/missing/supplement").send({ notes: "more info" });
    expect(res.status).toBe(404);
  });

  it("saves the record and enqueues InvoiceSupplemented atomically (no direct publish)", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({
      value: {
        trackingId: "t1",
        status: "awaiting_approval",
        vendor: "Acme",
        invoiceNumber: "INV-1",
        total: 100,
        submittedAt: "2026-01-01T00:00:00.000Z",
        correlationId: "corr-1",
      },
      etag: "etag-1",
    });
    saveInvoiceRecordWithOutboxEventMock.mockResolvedValue(true);

    const res = await request(app).patch("/invoices/t1/supplement").send({ notes: "more info" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ trackingId: "t1" });
    expect(saveInvoiceRecordWithOutboxEventMock).toHaveBeenCalledWith(
      "invoice:t1",
      expect.objectContaining({ trackingId: "t1", notes: "more info" }),
      "etag-1",
      "InvoiceSupplemented",
      expect.objectContaining({ trackingId: "t1", correlationId: "corr-1", notes: "more info", occurredAt: expect.any(String) }),
    );
  });

  it("returns 409 after exhausting retries on repeated etag conflicts", async () => {
    getInvoiceRecordWithEtagMock.mockResolvedValue({
      value: {
        trackingId: "t1",
        status: "awaiting_approval",
        vendor: "Acme",
        invoiceNumber: "INV-1",
        total: 100,
        submittedAt: "2026-01-01T00:00:00.000Z",
        correlationId: "corr-1",
      },
      etag: "etag-1",
    });
    saveInvoiceRecordWithOutboxEventMock.mockResolvedValue(false);

    const res = await request(app).patch("/invoices/t1/supplement").send({ notes: "more info" });

    expect(res.status).toBe(409);
  });

  it("returns 500 on an unexpected error", async () => {
    getInvoiceRecordWithEtagMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).patch("/invoices/t1/supplement").send({ notes: "x" });
    expect(res.status).toBe(500);
  });
});
