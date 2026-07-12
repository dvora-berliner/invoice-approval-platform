import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { correlationMiddleware } from "@approvalflow/logging";

vi.mock("../src/db", () => ({ insertEvent: vi.fn() }));
vi.mock("../src/serviceClient", () => ({ pushInvoiceStatus: vi.fn() }));

import { insertEvent } from "../src/db";
import { pushInvoiceStatus } from "../src/serviceClient";
import { router } from "../src/subscriptions";

const insertEventMock = vi.mocked(insertEvent);
const pushInvoiceStatusMock = vi.mocked(pushInvoiceStatus);

const app = express();
app.use(express.json({ type: ["application/json", "application/cloudevents+json"] }));
app.use(correlationMiddleware("audit-service"));
app.use(router);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /dapr/subscribe", () => {
  it("declares all five subscriptions", async () => {
    const res = await request(app).get("/dapr/subscribe");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });
});

describe("POST /events/invoice-submitted", () => {
  const invoice = { trackingId: "t1", correlationId: "corr-1", vendor: "Acme", invoiceNumber: "INV-1", total: 100, submittedAt: "2026-01-01T00:00:00.000Z" };

  it("records a new event", async () => {
    insertEventMock.mockResolvedValue(1);
    const res = await request(app).post("/events/invoice-submitted").send({ data: invoice });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
    expect(insertEventMock).toHaveBeenCalledWith("InvoiceSubmitted", "t1", "corr-1", invoice, invoice.submittedAt);
  });

  it("falls back to the raw body when there is no cloud-event 'data' envelope", async () => {
    insertEventMock.mockResolvedValue(1);
    const res = await request(app).post("/events/invoice-submitted").send(invoice);
    expect(res.status).toBe(200);
    expect(insertEventMock).toHaveBeenCalledWith("InvoiceSubmitted", "t1", "corr-1", invoice, invoice.submittedAt);
  });

  it("accepts a stringified data payload", async () => {
    insertEventMock.mockResolvedValue(1);
    const res = await request(app).post("/events/invoice-submitted").send({ data: JSON.stringify(invoice) });
    expect(res.status).toBe(200);
    expect(insertEventMock).toHaveBeenCalled();
  });

  it("acks (SUCCESS) an unparseable string payload", async () => {
    const res = await request(app)
      .post("/events/invoice-submitted")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "{not json" }));
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("acks (SUCCESS) a non-invoice event with no vendor field", async () => {
    const res = await request(app).post("/events/invoice-submitted").send({ data: { trackingId: "t1" } });
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("logs a duplicate (no throw) when insertEvent returns null", async () => {
    insertEventMock.mockResolvedValue(null);
    const res = await request(app).post("/events/invoice-submitted").send({ data: invoice });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
  });

  it("falls back to trackingId as the correlationId and warns when none is given", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    insertEventMock.mockResolvedValue(1);

    const res = await request(app)
      .post("/events/invoice-submitted")
      .send({ data: { ...invoice, correlationId: undefined } });

    expect(res.status).toBe(200);
    expect(insertEventMock).toHaveBeenCalledWith("InvoiceSubmitted", "t1", "t1", expect.anything(), invoice.submittedAt);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("arrived with no correlationId"));
  });

  it("returns RETRY when recording fails", async () => {
    insertEventMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/events/invoice-submitted").send({ data: invoice });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("POST /events/escalation-created", () => {
  const event = { trackingId: "t1", correlationId: "corr-1", usdAmount: 300, reason: "over cap", timestamp: "2026-01-01T00:00:00.000Z" };

  it("acks (SUCCESS) an event with no trackingId", async () => {
    const res = await request(app).post("/events/escalation-created").send({ data: {} });
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("records the event and pushes an awaiting_approval status", async () => {
    insertEventMock.mockResolvedValue(1);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/escalation-created").send({ data: event });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalledWith("t1", "corr-1", "awaiting_approval", "over cap");
  });

  it("still pushes the status when the event was a duplicate", async () => {
    insertEventMock.mockResolvedValue(null);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/escalation-created").send({ data: event });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalled();
  });

  it("returns RETRY when insertEvent fails", async () => {
    insertEventMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/events/escalation-created").send({ data: event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
    expect(pushInvoiceStatusMock).not.toHaveBeenCalled();
  });

  it("returns RETRY when the status push fails", async () => {
    insertEventMock.mockResolvedValue(1);
    pushInvoiceStatusMock.mockRejectedValue(new Error("submission-service unreachable"));
    const res = await request(app).post("/events/escalation-created").send({ data: event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("POST /events/info-requested", () => {
  it("acks (SUCCESS) an event with no trackingId", async () => {
    const res = await request(app).post("/events/info-requested").send({ data: {} });
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("includes the approver's reason in the pushed status message", async () => {
    insertEventMock.mockResolvedValue(1);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/events/info-requested")
      .send({ data: { trackingId: "t1", correlationId: "corr-1", approverId: "a1", reason: "missing receipt", timestamp: "2026-01-01T00:00:00.000Z" } });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalledWith("t1", "corr-1", "awaiting_approval", "An approver requested more information: missing receipt");
  });

  it("falls back to a generic message when no reason is given", async () => {
    insertEventMock.mockResolvedValue(1);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/events/info-requested")
      .send({ data: { trackingId: "t1", correlationId: "corr-1", approverId: "a1", timestamp: "2026-01-01T00:00:00.000Z" } });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalledWith("t1", "corr-1", "awaiting_approval", "An approver requested more information.");
  });

  it("still pushes the status when the event was a duplicate", async () => {
    insertEventMock.mockResolvedValue(null);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/events/info-requested")
      .send({ data: { trackingId: "t1", correlationId: "corr-1", approverId: "a1", timestamp: "2026-01-01T00:00:00.000Z" } });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalled();
  });

  it("returns RETRY when recording fails", async () => {
    insertEventMock.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/events/info-requested")
      .send({ data: { trackingId: "t1", approverId: "a1" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("POST /events/decision-finalized", () => {
  const event = {
    trackingId: "t1",
    correlationId: "corr-1",
    outcome: "paid",
    reason: "payment executed",
    usdAmount: 100,
    appliedCeiling: 250,
    timestamp: "2026-01-01T00:00:00.000Z",
  };

  it("acks (SUCCESS) an event with no trackingId", async () => {
    const res = await request(app).post("/events/decision-finalized").send({ data: {} });
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("records the event and pushes the final outcome as the status", async () => {
    insertEventMock.mockResolvedValue(1);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/decision-finalized").send({ data: event });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalledWith("t1", "corr-1", "paid", "payment executed");
  });

  it("still pushes the status when the event was a duplicate", async () => {
    insertEventMock.mockResolvedValue(null);
    pushInvoiceStatusMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/decision-finalized").send({ data: event });

    expect(res.status).toBe(200);
    expect(pushInvoiceStatusMock).toHaveBeenCalled();
  });

  it("returns RETRY when recording fails", async () => {
    insertEventMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/events/decision-finalized").send({ data: event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("POST /events/invoice-supplemented", () => {
  const event = { trackingId: "t1", correlationId: "corr-1", notes: "client name: Acme Corp" };

  it("acks (SUCCESS) an event with no trackingId", async () => {
    const res = await request(app).post("/events/invoice-supplemented").send({ data: {} });
    expect(res.status).toBe(200);
    expect(insertEventMock).not.toHaveBeenCalled();
  });

  it("records the event with no status push (workflow-service's re-decision handles that)", async () => {
    insertEventMock.mockResolvedValue(1);

    const res = await request(app).post("/events/invoice-supplemented").send({ data: event });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
    expect(insertEventMock).toHaveBeenCalledWith("InvoiceSupplemented", "t1", "corr-1", event, expect.any(String));
    expect(pushInvoiceStatusMock).not.toHaveBeenCalled();
  });

  it("logs a duplicate (no throw) when insertEvent returns null", async () => {
    insertEventMock.mockResolvedValue(null);
    const res = await request(app).post("/events/invoice-supplemented").send({ data: event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
  });

  it("falls back to trackingId as the correlationId and warns when none is given", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    insertEventMock.mockResolvedValue(1);

    const res = await request(app)
      .post("/events/invoice-supplemented")
      .send({ data: { ...event, correlationId: undefined } });

    expect(res.status).toBe(200);
    expect(insertEventMock).toHaveBeenCalledWith("InvoiceSupplemented", "t1", "t1", expect.anything(), expect.any(String));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("arrived with no correlationId"));
  });

  it("returns RETRY when recording fails", async () => {
    insertEventMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).post("/events/invoice-supplemented").send({ data: event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});
