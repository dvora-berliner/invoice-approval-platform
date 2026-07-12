import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/dapr", () => ({
  getState: vi.fn(),
  saveState: vi.fn(),
}));
vi.mock("../src/mockProvider", () => ({
  executeMockPayment: vi.fn(),
}));

import { getState, saveState } from "../src/dapr";
import { executeMockPayment } from "../src/mockProvider";
import { buildApp } from "../src/app";
import type { PaymentRecord } from "../src/types";

const getStateMock = vi.mocked(getState);
const saveStateMock = vi.mocked(saveState);
const executeMockPaymentMock = vi.mocked(executeMockPayment);

const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "payment-service" });
  });
});

describe("POST /payments/reserve", () => {
  it("rejects an invalid request with 400", async () => {
    const res = await request(app).post("/payments/reserve").send({ amount: -1 });
    expect(res.status).toBe(400);
  });

  it("replays an existing reservation for a repeated idempotencyKey", async () => {
    const existing: PaymentRecord = {
      reservationId: "r1",
      idempotencyKey: "k1",
      amount: 100,
      status: "reserved",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    getStateMock.mockResolvedValue(existing);

    const res = await request(app).post("/payments/reserve").send({ idempotencyKey: "k1", amount: 100 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "reserved" });
    expect(saveStateMock).not.toHaveBeenCalled();
  });

  it("creates a new reservation", async () => {
    getStateMock.mockResolvedValue(null);
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/reserve").send({ idempotencyKey: "k1", amount: 100, currency: "USD" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("reserved");
    expect(saveStateMock).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).post("/payments/reserve").send({ idempotencyKey: "k1", amount: 100 });
    expect(res.status).toBe(500);
  });
});

const reservedRecord: PaymentRecord = {
  reservationId: "r1",
  idempotencyKey: "k1",
  amount: 100,
  status: "reserved",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("POST /payments/execute", () => {
  it("rejects an invalid request with 400", async () => {
    const res = await request(app).post("/payments/execute").send({});
    expect(res.status).toBe(400);
  });

  it("replays an existing execution result for a repeated idempotencyKey", async () => {
    getStateMock.mockResolvedValue({ ...reservedRecord, status: "executed" });

    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "executed", error: undefined });
  });

  it("returns 404 for an unknown reservationId", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "missing" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the reservation was already compensated", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reservedRecord, status: "compensated" });
    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });
    expect(res.status).toBe(409);
  });

  it("short-circuits when the reservation is already executed", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reservedRecord, status: "executed" });
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("executed");
    expect(saveStateMock).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when the reservation already failed", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reservedRecord, status: "failed", error: "prior failure" });
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "failed", error: "prior failure" });
  });

  it("executes successfully and records the outcome", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(reservedRecord);
    executeMockPaymentMock.mockReturnValue({ success: true });
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "executed", error: undefined });
    expect(saveStateMock).toHaveBeenCalledTimes(2);
  });

  it("records a business-level failure", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(reservedRecord);
    executeMockPaymentMock.mockReturnValue({ success: false, error: "card declined" });
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1", simulateOutcome: "failure" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "failed", error: "card declined" });
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).post("/payments/execute").send({ idempotencyKey: "k1", reservationId: "r1" });
    expect(res.status).toBe(500);
  });
});

describe("POST /payments/compensate", () => {
  it("rejects an invalid request with 400", async () => {
    const res = await request(app).post("/payments/compensate").send({});
    expect(res.status).toBe(400);
  });

  it("replays an existing compensation for a repeated idempotencyKey", async () => {
    getStateMock.mockResolvedValue({ ...reservedRecord, status: "compensated" });
    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "r1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "compensated" });
  });

  it("returns 404 for an unknown reservationId", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "missing" });
    expect(res.status).toBe(404);
  });

  it("short-circuits when already compensated", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reservedRecord, status: "compensated" });
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "compensated" });
    expect(saveStateMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when trying to compensate a successfully executed payment", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reservedRecord, status: "executed" });
    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "r1" });
    expect(res.status).toBe(409);
  });

  it("compensates a reserved payment", async () => {
    getStateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(reservedRecord);
    saveStateMock.mockResolvedValue(undefined);

    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "r1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reservationId: "r1", status: "compensated" });
    expect(saveStateMock).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on an unexpected error", async () => {
    getStateMock.mockRejectedValue(new Error("boom"));
    const res = await request(app).post("/payments/compensate").send({ idempotencyKey: "k1", reservationId: "r1" });
    expect(res.status).toBe(500);
  });
});
