import { Router } from "express";
import { randomUUID } from "crypto";
import { getState, saveState } from "./dapr";
import { executeMockPayment } from "./mockProvider";
import {
  reserveRequestSchema,
  executeRequestSchema,
  compensateRequestSchema,
  type PaymentRecord,
} from "./types";

export const router = Router();

const idemKeyOf = (idempotencyKey: string) => `idem:${idempotencyKey}`;
const reservationKeyOf = (reservationId: string) => `reservation:${reservationId}`;

router.post("/payments/reserve", async (req, res) => {
  try {
    const parseResult = reserveRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid reserve request", details: parseResult.error.flatten() });
      return;
    }
    const { idempotencyKey, amount, currency, department, trackingId } = parseResult.data;

    const existing = await getState<PaymentRecord>(idemKeyOf(idempotencyKey));
    if (existing) {
      req.log.info("reserve replay (idempotent)", { reservationId: existing.reservationId });
      res.status(200).json({ reservationId: existing.reservationId, status: existing.status });
      return;
    }

    const reservationId = randomUUID();
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      reservationId,
      idempotencyKey,
      amount,
      currency,
      department,
      trackingId,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
    };
    await saveState(reservationKeyOf(reservationId), record);
    await saveState(idemKeyOf(idempotencyKey), record);

    req.log.info("payment reserved", { reservationId, amount });
    res.status(201).json({ reservationId, status: "reserved" });
  } catch (err) {
    req.log.error("POST /payments/reserve failed", { error: String(err) });
    res.status(500).json({ error: "Failed to reserve payment" });
  }
});

router.post("/payments/execute", async (req, res) => {
  try {
    const parseResult = executeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid execute request", details: parseResult.error.flatten() });
      return;
    }
    const { idempotencyKey, reservationId, simulateOutcome } = parseResult.data;

    const existing = await getState<PaymentRecord>(idemKeyOf(idempotencyKey));
    if (existing) {
      req.log.info("execute replay (idempotent)", { reservationId: existing.reservationId, status: existing.status });
      res.status(200).json({ reservationId: existing.reservationId, status: existing.status, error: existing.error });
      return;
    }

    const reservation = await getState<PaymentRecord>(reservationKeyOf(reservationId));
    if (!reservation) {
      res.status(404).json({ error: "Unknown reservationId" });
      return;
    }
    if (reservation.status === "compensated") {
      res.status(409).json({ error: "Reservation already compensated" });
      return;
    }
    if (reservation.status === "executed" || reservation.status === "failed") {
      req.log.info("execute short-circuited - reservation already resolved", {
        reservationId,
        status: reservation.status,
      });
      await saveState(idemKeyOf(idempotencyKey), reservation);
      res.status(200).json({ reservationId, status: reservation.status, error: reservation.error });
      return;
    }

    const outcome = executeMockPayment({ amount: reservation.amount, simulateOutcome });
    const now = new Date().toISOString();
    const updated: PaymentRecord = {
      ...reservation,
      status: outcome.success ? "executed" : "failed",
      error: outcome.success ? undefined : outcome.error,
      updatedAt: now,
    };
    await saveState(reservationKeyOf(reservationId), updated);
    await saveState(idemKeyOf(idempotencyKey), updated);

    req.log.info("payment execute result", { reservationId, status: updated.status });
    res.status(200).json({ reservationId, status: updated.status, error: updated.error });
  } catch (err) {
    req.log.error("POST /payments/execute failed", { error: String(err) });
    res.status(500).json({ error: "Failed to execute payment" });
  }
});

router.post("/payments/compensate", async (req, res) => {
  try {
    const parseResult = compensateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid compensate request", details: parseResult.error.flatten() });
      return;
    }
    const { idempotencyKey, reservationId } = parseResult.data;

    const existing = await getState<PaymentRecord>(idemKeyOf(idempotencyKey));
    if (existing) {
      req.log.info("compensate replay (idempotent)", { reservationId: existing.reservationId });
      res.status(200).json({ reservationId: existing.reservationId, status: existing.status });
      return;
    }

    const reservation = await getState<PaymentRecord>(reservationKeyOf(reservationId));
    if (!reservation) {
      res.status(404).json({ error: "Unknown reservationId" });
      return;
    }
    if (reservation.status === "compensated") {
      req.log.info("compensate short-circuited - already compensated", { reservationId });
      await saveState(idemKeyOf(idempotencyKey), reservation);
      res.status(200).json({ reservationId, status: reservation.status });
      return;
    }
    if (reservation.status === "executed") {
      res.status(409).json({ error: "Cannot compensate a successfully executed payment" });
      return;
    }

    const now = new Date().toISOString();
    const updated: PaymentRecord = { ...reservation, status: "compensated", updatedAt: now };
    await saveState(reservationKeyOf(reservationId), updated);
    await saveState(idemKeyOf(idempotencyKey), updated);

    req.log.info("payment compensated", { reservationId });
    res.status(200).json({ reservationId, status: "compensated" });
  } catch (err) {
    req.log.error("POST /payments/compensate failed", { error: String(err) });
    res.status(500).json({ error: "Failed to compensate payment" });
  }
});
