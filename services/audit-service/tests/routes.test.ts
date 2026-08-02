import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { correlationMiddleware } from "@approvalflow/logging";

vi.mock("../src/db", () => ({
  eventsForTrackingOrCorrelation: vi.fn(),
  queryRows: vi.fn(),
}));
vi.mock("../src/config", () => ({ loadCeiling: vi.fn() }));
vi.mock("../src/serviceClient", () => ({ resolveTrackingId: vi.fn() }));

import { eventsForTrackingOrCorrelation, queryRows } from "../src/db";
import { loadCeiling } from "../src/config";
import { resolveTrackingId } from "../src/serviceClient";
import { notificationMessageFor, router } from "../src/routes";
import type { DecisionEventRow } from "../src/db";

const eventsForTrackingOrCorrelationMock = vi.mocked(eventsForTrackingOrCorrelation);
const queryRowsMock = vi.mocked(queryRows);
const loadCeilingMock = vi.mocked(loadCeiling);
const resolveTrackingIdMock = vi.mocked(resolveTrackingId);

const app = express();
app.use(express.json());
app.use(correlationMiddleware("audit-service"));
app.use(router);

beforeEach(() => {
  vi.clearAllMocks();
  // Identity by default - most tests aren't exercising pretty-id resolution.
  resolveTrackingIdMock.mockImplementation(async (id) => id);
});

describe("GET /trail/:id", () => {
  it("returns 404 when there are no events", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([]);
    const res = await request(app).get("/trail/missing");
    expect(res.status).toBe(404);
  });

  it("returns the ordered event trail", async () => {
    const rows = [{ id: 1, event_type: "InvoiceSubmitted" }] as unknown as DecisionEventRow[];
    eventsForTrackingOrCorrelationMock.mockResolvedValue(rows);
    const res = await request(app).get("/trail/t1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "t1", events: rows });
  });

  it("returns 500 on an unexpected error", async () => {
    eventsForTrackingOrCorrelationMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/trail/t1");
    expect(res.status).toBe(500);
  });

  it("resolves a pretty id to its tracking id before querying", async () => {
    resolveTrackingIdMock.mockResolvedValue("t1");
    eventsForTrackingOrCorrelationMock.mockResolvedValue([{ id: 1 } as unknown as DecisionEventRow]);

    const res = await request(app).get("/trail/INV-2026-0001");

    expect(resolveTrackingIdMock).toHaveBeenCalledWith("INV-2026-0001");
    expect(eventsForTrackingOrCorrelationMock).toHaveBeenCalledWith("t1");
    expect(res.status).toBe(200);
  });
});

describe("GET /dashboard", () => {
  function queueRows(sequence: unknown[][]) {
    let i = 0;
    queryRowsMock.mockImplementation(async () => sequence[i++] as never);
  }

  it("returns zeroed aggregates when nothing has happened yet", async () => {
    queueRows([[], [], [], [], []]);
    const res = await request(app).get("/dashboard");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalSubmitted: 0,
      totalEscalated: 0,
      pendingHumanReview: 0,
      totalFinalized: 0,
      autoApproved: { count: 0, usdAmount: 0 },
      humanApproved: { count: 0, usdAmount: 0 },
      paymentFailed: { count: 0, usdAmount: 0 },
      autoRejected: 0,
      humanRejected: 0,
      submittedByDay: {},
      finalizedByDay: {},
    });
  });

  it("aggregates auto/human approvals, payment failures and auto/human rejections separately", async () => {
    queueRows([
      [{ count: "5" }],
      [{ count: "2" }],
      [{ count: "1" }],
      [{ day: "2026-01-01", count: "5" }],
      [
        { payload: { outcome: "paid", usdAmount: 100 }, occurred_at: "2026-01-01T00:00:00.000Z" },
        { payload: { outcome: "paid", approverId: "a1", usdAmount: 200 }, occurred_at: "2026-01-01T01:00:00.000Z" },
        { payload: { outcome: "payment_failed", usdAmount: 50 }, occurred_at: "2026-01-02T00:00:00.000Z" },
        { payload: { outcome: "payment_failed", approverId: "a2", usdAmount: 75 }, occurred_at: "2026-01-02T01:00:00.000Z" },
        { payload: { outcome: "rejected" }, occurred_at: "2026-01-02T02:00:00.000Z" },
        { payload: { outcome: "rejected", approverId: "a3" }, occurred_at: "2026-01-02T03:00:00.000Z" },
        { payload: { outcome: "unrecognized_outcome" }, occurred_at: "2026-01-02T04:00:00.000Z" },
      ],
    ]);

    const res = await request(app).get("/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalSubmitted: 5,
      totalEscalated: 2,
      pendingHumanReview: 1,
      totalFinalized: 7,
      autoApproved: { count: 1, usdAmount: 100 },
      humanApproved: { count: 1, usdAmount: 200 },
      paymentFailed: { count: 2, usdAmount: 125 },
      autoRejected: 1,
      humanRejected: 1,
      submittedByDay: { "2026-01-01": 5 },
      finalizedByDay: { "2026-01-01": 2, "2026-01-02": 5 },
    });
  });

  it("returns 500 on an unexpected error", async () => {
    queryRowsMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/dashboard");
    expect(res.status).toBe(500);
  });
});

describe("GET /ceiling-proof", () => {
  it("returns 502 when the ceiling cannot be loaded", async () => {
    loadCeilingMock.mockRejectedValue(new Error("config store unreachable"));
    const res = await request(app).get("/ceiling-proof");
    expect(res.status).toBe(502);
  });

  it("passes when there are no violations", async () => {
    loadCeilingMock.mockResolvedValue(250);
    queryRowsMock.mockResolvedValueOnce([{ count: "10" }]).mockResolvedValueOnce([]);

    const res = await request(app).get("/ceiling-proof");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentCeiling: 250, itemsChecked: 10, violations: [], passed: true });
  });

  it("fails when violations are found", async () => {
    loadCeilingMock.mockResolvedValue(250);
    const violation = { tracking_id: "t1", correlation_id: "corr-1", payload: { usdAmount: 500 } };
    queryRowsMock.mockResolvedValueOnce([{ count: "10" }]).mockResolvedValueOnce([violation]);

    const res = await request(app).get("/ceiling-proof");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentCeiling: 250, itemsChecked: 10, violations: [violation], passed: false });
  });

  it("returns 500 when the query itself fails", async () => {
    loadCeilingMock.mockResolvedValue(250);
    queryRowsMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/ceiling-proof");
    expect(res.status).toBe(500);
  });
});

describe("GET /notifications/:trackingId", () => {
  it("returns 404 when there are no notifiable events", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      { id: 1, event_type: "InvoiceSubmitted", tracking_id: "t1", correlation_id: "c1", payload: {}, occurred_at: "2026-01-01T00:00:00.000Z", received_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const res = await request(app).get("/notifications/t1");
    expect(res.status).toBe(404);
  });

  it("returns the latest notification first, with full history", async () => {
    const rows: DecisionEventRow[] = [
      {
        id: 1,
        event_type: "InfoRequested",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { reason: "need receipt" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        event_type: "DecisionFinalized",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { outcome: "paid" },
        occurred_at: "2026-01-02T00:00:00.000Z",
        received_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    eventsForTrackingOrCorrelationMock.mockResolvedValue(rows);

    const res = await request(app).get("/notifications/t1");

    expect(res.status).toBe(200);
    expect(res.body.latest.eventType).toBe("DecisionFinalized");
    expect(res.body.latest.message).toBe("Your invoice was approved and payment was completed.");
    expect(res.body.history).toHaveLength(2);
    expect(res.body.history[1].message).toBe("An approver requested more information: need receipt");
  });

  it("builds a message for a rejected outcome", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      {
        id: 1,
        event_type: "DecisionFinalized",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { outcome: "rejected", reason: "policy violation" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await request(app).get("/notifications/t1");
    expect(res.body.latest.message).toBe("Your invoice was rejected: policy violation");
  });

  it("builds a message for a payment_failed outcome", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      {
        id: 1,
        event_type: "DecisionFinalized",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { outcome: "payment_failed" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await request(app).get("/notifications/t1");
    expect(res.body.latest.message).toBe("Your invoice was approved, but payment failed and is being resolved.");
  });

  it("falls back to the raw reason for an unrecognized outcome", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      {
        id: 1,
        event_type: "DecisionFinalized",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { outcome: "unknown_outcome", reason: "something unusual" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await request(app).get("/notifications/t1");
    expect(res.body.latest.message).toBe("something unusual");
  });

  it("builds a generic message for an InfoRequested event with no reason", async () => {
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      {
        id: 1,
        event_type: "InfoRequested",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: {},
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const res = await request(app).get("/notifications/t1");
    expect(res.body.latest.message).toBe("An approver requested more information.");
  });

  it("returns 500 on an unexpected error", async () => {
    eventsForTrackingOrCorrelationMock.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/notifications/t1");
    expect(res.status).toBe(500);
  });

  it("resolves a pretty id to its tracking id before querying", async () => {
    resolveTrackingIdMock.mockResolvedValue("t1");
    eventsForTrackingOrCorrelationMock.mockResolvedValue([
      {
        id: 1,
        event_type: "DecisionFinalized",
        tracking_id: "t1",
        correlation_id: "c1",
        payload: { outcome: "paid" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = await request(app).get("/notifications/INV-2026-0001");

    expect(resolveTrackingIdMock).toHaveBeenCalledWith("INV-2026-0001");
    expect(eventsForTrackingOrCorrelationMock).toHaveBeenCalledWith("t1");
    expect(res.status).toBe(200);
  });
});

describe("notificationMessageFor", () => {
  it("falls back to a generic message for an event type that isn't notifiable", () => {
    const row = {
      id: 1,
      event_type: "InvoiceSubmitted",
      tracking_id: "t1",
      correlation_id: "c1",
      payload: {},
      occurred_at: "2026-01-01T00:00:00.000Z",
      received_at: "2026-01-01T00:00:00.000Z",
    } as unknown as DecisionEventRow;

    expect(notificationMessageFor(row)).toBe("Your invoice is being processed.");
  });
});
