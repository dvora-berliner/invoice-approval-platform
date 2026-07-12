import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/dapr", () => ({
  getState: vi.fn(),
  getStateWithEtag: vi.fn(),
  saveStateWithEtag: vi.fn(),
}));

vi.mock("../src/workflow/runtime", () => ({
  workflowClient: { raiseEvent: vi.fn() },
  startInvoiceWorkflow: vi.fn(),
}));

import { getState, getStateWithEtag, saveStateWithEtag } from "../src/dapr";
import { startInvoiceWorkflow, workflowClient } from "../src/workflow/runtime";
import { buildApp } from "../src/app";
import type { ApprovalQueueItem } from "../src/types";

const getStateMock = vi.mocked(getState);
const getStateWithEtagMock = vi.mocked(getStateWithEtag);
const saveStateWithEtagMock = vi.mocked(saveStateWithEtag);
const startInvoiceWorkflowMock = vi.mocked(startInvoiceWorkflow);
const raiseEventMock = vi.mocked(workflowClient.raiseEvent);

const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "workflow-service" });
  });
});

describe("GET /dapr/subscribe", () => {
  it("declares the two InvoiceSubmitted/InvoiceSupplemented subscriptions", async () => {
    const res = await request(app).get("/dapr/subscribe");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { pubsubname: "pubsub", topic: "InvoiceSubmitted", route: "/events/invoice-submitted" },
      { pubsubname: "pubsub", topic: "InvoiceSupplemented", route: "/events/invoice-supplemented" },
    ]);
  });
});

const validInvoice = { trackingId: "t1", vendor: "Acme", invoiceNumber: "INV-1", total: 100 };

describe("POST /events/invoice-submitted", () => {
  it("starts a workflow for a valid cloud event envelope", async () => {
    startInvoiceWorkflowMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/invoice-submitted").send({ data: validInvoice });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
    expect(startInvoiceWorkflowMock).toHaveBeenCalledWith(validInvoice, expect.anything());
  });

  it("accepts a stringified data payload", async () => {
    startInvoiceWorkflowMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/invoice-submitted").send({ data: JSON.stringify(validInvoice) });

    expect(res.status).toBe(200);
    expect(startInvoiceWorkflowMock).toHaveBeenCalledWith(validInvoice, expect.anything());
  });

  it("falls back to the raw body when there is no cloud-event 'data' envelope", async () => {
    startInvoiceWorkflowMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/invoice-submitted").send(validInvoice);

    expect(res.status).toBe(200);
    expect(startInvoiceWorkflowMock).toHaveBeenCalledWith(validInvoice, expect.anything());
  });

  it("acks (SUCCESS) an unparseable string payload without starting a workflow", async () => {
    const res = await request(app)
      .post("/events/invoice-submitted")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "{not json" }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "SUCCESS" });
    expect(startInvoiceWorkflowMock).not.toHaveBeenCalled();
  });

  it("acks (SUCCESS) a non-invoice event (no vendor field), e.g. a dedup-key write", async () => {
    const res = await request(app).post("/events/invoice-submitted").send({ data: { someOtherKey: true } });

    expect(res.status).toBe(200);
    expect(startInvoiceWorkflowMock).not.toHaveBeenCalled();
  });

  it("acks (SUCCESS) a payload that fails schema validation", async () => {
    const res = await request(app).post("/events/invoice-submitted").send({ data: { vendor: "" } });

    expect(res.status).toBe(200);
    expect(startInvoiceWorkflowMock).not.toHaveBeenCalled();
  });

  it("asks for a retry when starting the workflow fails", async () => {
    startInvoiceWorkflowMock.mockRejectedValue(new Error("placement unreachable"));

    const res = await request(app).post("/events/invoice-submitted").send({ data: validInvoice });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("POST /events/invoice-supplemented", () => {
  it("relays a valid event to the workflow", async () => {
    raiseEventMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/invoice-supplemented").send({ data: { trackingId: "t1", notes: "more info" } });

    expect(res.status).toBe(200);
    expect(raiseEventMock).toHaveBeenCalledWith("t1", "InvoiceSupplemented", { trackingId: "t1", notes: "more info" });
  });

  it("accepts a stringified data payload", async () => {
    raiseEventMock.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/events/invoice-supplemented")
      .send({ data: JSON.stringify({ trackingId: "t1" }) });

    expect(res.status).toBe(200);
    expect(raiseEventMock).toHaveBeenCalled();
  });

  it("falls back to the raw body when there is no cloud-event 'data' envelope", async () => {
    raiseEventMock.mockResolvedValue(undefined);

    const res = await request(app).post("/events/invoice-supplemented").send({ trackingId: "t1" });

    expect(res.status).toBe(200);
    expect(raiseEventMock).toHaveBeenCalledWith("t1", "InvoiceSupplemented", { trackingId: "t1" });
  });

  it("acks (SUCCESS) an unparseable string payload", async () => {
    const res = await request(app)
      .post("/events/invoice-supplemented")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "{not json" }));

    expect(res.status).toBe(200);
    expect(raiseEventMock).not.toHaveBeenCalled();
  });

  it("acks (SUCCESS) a payload without a string trackingId", async () => {
    const res = await request(app).post("/events/invoice-supplemented").send({ data: { trackingId: 123 } });

    expect(res.status).toBe(200);
    expect(raiseEventMock).not.toHaveBeenCalled();
  });

  it("asks for a retry when relaying the event fails", async () => {
    raiseEventMock.mockRejectedValue(new Error("workflow not found"));

    const res = await request(app).post("/events/invoice-supplemented").send({ data: { trackingId: "t1" } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "RETRY" });
  });
});

describe("GET /approvals/queue", () => {
  it("returns an empty list when the index is empty", async () => {
    getStateMock.mockResolvedValue(null);

    const res = await request(app).get("/approvals/queue");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("filters out any index entries whose item state has vanished", async () => {
    const item: ApprovalQueueItem = {
      trackingId: "t1",
      invoice: validInvoice,
      decision: { route: "human_review", usdAmount: 100, confidence: 0.5, citedRules: [], reason: "x", appliedCeiling: 250 },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    getStateMock.mockImplementation(async (key: string) => {
      if (key === "approval-queue-index") return ["t1", "t2"] as never;
      if (key === "approval:t1") return item as never;
      return null;
    });

    const res = await request(app).get("/approvals/queue");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [item] });
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/approvals/queue");
    expect(res.status).toBe(500);
  });
});

describe("GET /approvals/:trackingId", () => {
  it("returns 404 when not found", async () => {
    getStateMock.mockResolvedValue(null);
    const res = await request(app).get("/approvals/missing");
    expect(res.status).toBe(404);
  });

  it("returns the item when found", async () => {
    const item: ApprovalQueueItem = {
      trackingId: "t1",
      invoice: validInvoice,
      decision: { route: "human_review", usdAmount: 100, confidence: 0.5, citedRules: [], reason: "x", appliedCeiling: 250 },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    getStateMock.mockResolvedValue(item);
    const res = await request(app).get("/approvals/t1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(item);
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/approvals/t1");
    expect(res.status).toBe(500);
  });
});

describe("POST /approvals/:trackingId/decision", () => {
  const item: ApprovalQueueItem = {
    trackingId: "t1",
    invoice: validInvoice,
    decision: { route: "human_review", usdAmount: 100, confidence: 0.5, citedRules: [], reason: "x", appliedCeiling: 250 },
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("rejects an invalid body with 400", async () => {
    const res = await request(app).post("/approvals/t1/decision").send({ approverId: "" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when there is no pending approval", async () => {
    getStateMock.mockResolvedValue(null);
    const res = await request(app).post("/approvals/missing/decision").send({ approverId: "a1", action: "approve" });
    expect(res.status).toBe(404);
  });

  it("records the decision and raises ApprovalDecision", async () => {
    getStateMock.mockResolvedValue(item);
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(true);
    raiseEventMock.mockResolvedValue(undefined);

    const res = await request(app).post("/approvals/t1/decision").send({ approverId: "a1", action: "approve" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ trackingId: "t1", action: "approve" });
    expect(raiseEventMock).toHaveBeenCalledWith("t1", "ApprovalDecision", { approverId: "a1", action: "approve" });
  });

  it("returns 409 when the approval was already decided (claim already set)", async () => {
    getStateMock.mockResolvedValue(item);
    getStateWithEtagMock.mockResolvedValue({ value: true, etag: "e1" });

    const res = await request(app).post("/approvals/t1/decision").send({ approverId: "a1", action: "approve" });

    expect(res.status).toBe(409);
    expect(raiseEventMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the claim write loses a concurrent race", async () => {
    getStateMock.mockResolvedValue(item);
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(false);

    const res = await request(app).post("/approvals/t1/decision").send({ approverId: "a1", action: "approve" });

    expect(res.status).toBe(409);
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).post("/approvals/t1/decision").send({ approverId: "a1", action: "approve" });
    expect(res.status).toBe(500);
  });
});
