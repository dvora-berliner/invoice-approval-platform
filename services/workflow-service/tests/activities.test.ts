import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/dapr", () => ({
  saveState: vi.fn(),
  deleteState: vi.fn(),
  getStateWithEtag: vi.fn(),
  saveStateWithEtag: vi.fn(),
  invokeService: vi.fn(),
  publishEvent: vi.fn(),
}));

import { deleteState, getStateWithEtag, invokeService, publishEvent, saveState, saveStateWithEtag } from "../src/dapr";
import {
  allActivities,
  callDecisionActivity,
  paymentCompensateActivity,
  paymentExecuteActivity,
  paymentReserveActivity,
  persistApprovalItemActivity,
  publishEventActivity,
  releaseBudgetActivity,
  removeApprovalItemActivity,
  reserveBudgetActivity,
} from "../src/workflow/activities";
import type { ApprovalQueueItem, DecisionResult, WorkflowInput } from "../src/types";

const getStateWithEtagMock = vi.mocked(getStateWithEtag);
const saveStateWithEtagMock = vi.mocked(saveStateWithEtag);
const saveStateMock = vi.mocked(saveState);
const deleteStateMock = vi.mocked(deleteState);
const invokeServiceMock = vi.mocked(invokeService);
const publishEventMock = vi.mocked(publishEvent);

const ctx = {} as never;

const invoice: WorkflowInput = { trackingId: "t1", correlationId: "corr-1", vendor: "Acme", invoiceNumber: "INV-1", total: 100 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("callDecisionActivity", () => {
  it("invokes decision-service and returns its result", async () => {
    const decision: DecisionResult = {
      route: "auto_approve",
      usdAmount: 100,
      confidence: 0.9,
      citedRules: [],
      reason: "ok",
      appliedCeiling: 250,
    };
    invokeServiceMock.mockResolvedValue(decision);

    const result = await callDecisionActivity(ctx, invoice);

    expect(result).toEqual(decision);
    expect(invokeServiceMock).toHaveBeenCalledWith("decision-service", "decide", invoice, "corr-1");
  });
});

describe("persistApprovalItemActivity", () => {
  const item: ApprovalQueueItem = {
    trackingId: "t1",
    correlationId: "corr-1",
    invoice,
    decision: { route: "human_review", usdAmount: 100, confidence: 0.5, citedRules: [], reason: "x", appliedCeiling: 250 },
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("saves the item and adds it to a fresh queue index", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(true);

    await persistApprovalItemActivity(ctx, { item });

    expect(saveStateMock).toHaveBeenCalledWith("approval:t1", item);
    expect(saveStateWithEtagMock).toHaveBeenCalledWith("approval-queue-index", ["t1"], "");
  });

  it("resets the decision claim so a re-escalated item (F5 request_info loop) can be decided again", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(true);

    await persistApprovalItemActivity(ctx, { item });

    expect(deleteStateMock).toHaveBeenCalledWith("decision-claimed:t1");
  });

  it("does nothing to the index when the trackingId is already present", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: ["t1"], etag: "e1" });

    await persistApprovalItemActivity(ctx, { item });

    expect(saveStateWithEtagMock).not.toHaveBeenCalled();
  });

  it("retries on an etag conflict and eventually succeeds", async () => {
    getStateWithEtagMock.mockResolvedValueOnce({ value: [], etag: "e1" }).mockResolvedValueOnce({ value: [], etag: "e2" });
    saveStateWithEtagMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await persistApprovalItemActivity(ctx, { item });

    expect(saveStateWithEtagMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: [], etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(false);

    await expect(persistApprovalItemActivity(ctx, { item })).rejects.toThrow(/after retries/);
  });
});

describe("removeApprovalItemActivity", () => {
  it("deletes the item directly when it is not in the index", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "e1" });

    await removeApprovalItemActivity(ctx, { trackingId: "t1", correlationId: "corr-1" });

    expect(deleteStateMock).toHaveBeenCalledWith("approval:t1");
    expect(saveStateWithEtagMock).not.toHaveBeenCalled();
  });

  it("removes from the index then deletes the item", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: ["t1", "t2"], etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(true);

    await removeApprovalItemActivity(ctx, { trackingId: "t1" });

    expect(saveStateWithEtagMock).toHaveBeenCalledWith("approval-queue-index", ["t2"], "e1");
    expect(deleteStateMock).toHaveBeenCalledWith("approval:t1");
  });

  it("throws after exhausting retries, leaving the item intact", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: ["t1"], etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(false);

    await expect(removeApprovalItemActivity(ctx, { trackingId: "t1" })).rejects.toThrow(/after retries/);
    expect(deleteStateMock).not.toHaveBeenCalled();
  });
});

describe("publishEventActivity", () => {
  it("publishes the given topic and payload", async () => {
    await publishEventActivity(ctx, { topic: "DecisionFinalized", payload: { trackingId: "t1" } });
    expect(publishEventMock).toHaveBeenCalledWith("DecisionFinalized", { trackingId: "t1" });
  });
});

describe("reserveBudgetActivity", () => {
  it("returns ok:false when the budget is insufficient", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: { department: "sales-2026Q2", remaining: 50 }, etag: "e1" });

    const result = await reserveBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100, correlationId: "corr-1" });

    expect(result).toEqual({ ok: false, remaining: 50 });
    expect(saveStateWithEtagMock).not.toHaveBeenCalled();
  });

  it("uses the default budget when no record exists yet", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(true);

    const result = await reserveBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100 });

    expect(result.ok).toBe(true);
  });

  it("reserves successfully and reduces the remaining balance", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: { department: "sales-2026Q2", remaining: 500 }, etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(true);

    const result = await reserveBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100 });

    expect(result).toEqual({ ok: true, remaining: 400 });
  });

  it("throws after exhausting retries on repeated conflicts", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: { department: "sales-2026Q2", remaining: 500 }, etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(false);

    await expect(reserveBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100 })).rejects.toThrow(/after retries/);
  });
});

describe("releaseBudgetActivity", () => {
  it("increases the remaining balance", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: { department: "sales-2026Q2", remaining: 400 }, etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(true);

    await releaseBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100 });

    expect(saveStateWithEtagMock).toHaveBeenCalledWith("budget:sales-2026Q2", { department: "sales-2026Q2", remaining: 500 }, "e1");
  });

  it("uses the default budget when no record exists yet", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: null, etag: "" });
    saveStateWithEtagMock.mockResolvedValue(true);

    await releaseBudgetActivity(ctx, { department: "unknown-dept", amount: 100 });

    expect(saveStateWithEtagMock).toHaveBeenCalled();
  });

  it("throws after exhausting retries", async () => {
    getStateWithEtagMock.mockResolvedValue({ value: { department: "sales-2026Q2", remaining: 400 }, etag: "e1" });
    saveStateWithEtagMock.mockResolvedValue(false);

    await expect(releaseBudgetActivity(ctx, { department: "sales-2026Q2", amount: 100 })).rejects.toThrow(/after retries/);
  });
});

describe("paymentReserveActivity", () => {
  it("invokes payment-service reserve with a derived idempotency key", async () => {
    invokeServiceMock.mockResolvedValue({ reservationId: "r1", status: "reserved" });

    const result = await paymentReserveActivity(ctx, { trackingId: "t1", amount: 100, correlationId: "corr-1" });

    expect(result).toEqual({ reservationId: "r1", status: "reserved" });
    expect(invokeServiceMock).toHaveBeenCalledWith(
      "payment-service",
      "payments/reserve",
      expect.objectContaining({ idempotencyKey: "t1:reserve", amount: 100 }),
      "corr-1",
    );
  });
});

describe("paymentExecuteActivity", () => {
  it("invokes payment-service execute with a derived idempotency key", async () => {
    invokeServiceMock.mockResolvedValue({ reservationId: "r1", status: "executed" });

    const result = await paymentExecuteActivity(ctx, { trackingId: "t1", reservationId: "r1", correlationId: "corr-1" });

    expect(result.status).toBe("executed");
    expect(invokeServiceMock).toHaveBeenCalledWith(
      "payment-service",
      "payments/execute",
      { idempotencyKey: "t1:execute", reservationId: "r1" },
      "corr-1",
    );
  });

  it("forwards simulateOutcome to payment-service when set (D5 test hook)", async () => {
    invokeServiceMock.mockResolvedValue({ reservationId: "r1", status: "failed" });

    await paymentExecuteActivity(ctx, { trackingId: "t1", reservationId: "r1", correlationId: "corr-1", simulateOutcome: "failure" });

    expect(invokeServiceMock).toHaveBeenCalledWith(
      "payment-service",
      "payments/execute",
      { idempotencyKey: "t1:execute", reservationId: "r1", simulateOutcome: "failure" },
      "corr-1",
    );
  });
});

describe("paymentCompensateActivity", () => {
  it("invokes payment-service compensate with a derived idempotency key", async () => {
    invokeServiceMock.mockResolvedValue(undefined);

    await paymentCompensateActivity(ctx, { trackingId: "t1", reservationId: "r1", correlationId: "corr-1" });

    expect(invokeServiceMock).toHaveBeenCalledWith(
      "payment-service",
      "payments/compensate",
      { idempotencyKey: "t1:compensate", reservationId: "r1" },
      "corr-1",
    );
  });
});

describe("allActivities", () => {
  it("registers every activity function", () => {
    expect(allActivities).toHaveLength(9);
  });
});
