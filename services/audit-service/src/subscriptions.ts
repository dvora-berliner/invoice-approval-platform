import { Router } from "express";
import { createLogger, extractCorrelationId } from "@approvalflow/logging";
import { insertEvent } from "./db";
import { pushInvoiceStatus } from "./serviceClient";
import type { DecisionFinalizedEvent, EscalationCreatedEvent, InfoRequestedEvent, InvoiceSubmittedEvent } from "./types";

export const router = Router();

router.get("/dapr/subscribe", (_req, res) => {
  res.json([
    { pubsubname: "pubsub", topic: "InvoiceSubmitted", route: "/events/invoice-submitted" },
    { pubsubname: "pubsub", topic: "EscalationCreated", route: "/events/escalation-created" },
    { pubsubname: "pubsub", topic: "InfoRequested", route: "/events/info-requested" },
    { pubsubname: "pubsub", topic: "DecisionFinalized", route: "/events/decision-finalized" },
  ]);
});

// Cloudevents envelope unwrap shared by every handler below.
function unwrap(body: unknown): unknown {
  const raw = (body as { data?: unknown })?.data ?? body;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Falls back to trackingId (not a shared literal) to avoid trail collisions; logs since it means M14 broke upstream.
function resolveCorrelationId(trackingId: string, given: string | undefined): string {
  if (given) return given;
  console.warn(`audit-service: event for trackingId ${trackingId} arrived with no correlationId`);
  return trackingId;
}

router.post("/events/invoice-submitted", async (req, res) => {
  const event = unwrap(req.body);

  // Only the invoice record itself (has "vendor") is a real audit event - the dedup key's
  // own write publishes a plain trackingId string too.
  if (!event || typeof event !== "object" || !("vendor" in event)) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const invoice = event as InvoiceSubmittedEvent;
  const correlationId = resolveCorrelationId(invoice.trackingId, extractCorrelationId(event) ?? invoice.correlationId);
  const log = createLogger("audit-service", correlationId);
  try {
    const id = await insertEvent("InvoiceSubmitted", invoice.trackingId, correlationId, invoice, invoice.submittedAt);
    log.info(id ? "recorded InvoiceSubmitted event" : "duplicate InvoiceSubmitted event skipped", {
      trackingId: invoice.trackingId,
    });
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    log.error("failed to record InvoiceSubmitted event", { trackingId: invoice.trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});

router.post("/events/escalation-created", async (req, res) => {
  const event = unwrap(req.body) as EscalationCreatedEvent | undefined;
  if (!event || typeof event !== "object" || !event.trackingId) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const correlationId = resolveCorrelationId(event.trackingId, event.correlationId);
  const log = createLogger("audit-service", correlationId);
  try {
    const id = await insertEvent("EscalationCreated", event.trackingId, correlationId, event, event.timestamp);
    log.info(id ? "recorded EscalationCreated event" : "duplicate EscalationCreated event skipped", {
      trackingId: event.trackingId,
    });
    // Unconditional: must retry even when insertEvent no-ops on redelivery, or a failed push is lost forever.
    await pushInvoiceStatus(event.trackingId, correlationId, "awaiting_approval", event.reason);
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    log.error("failed to record EscalationCreated event", { trackingId: event.trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});

router.post("/events/info-requested", async (req, res) => {
  const event = unwrap(req.body) as InfoRequestedEvent | undefined;
  if (!event || typeof event !== "object" || !event.trackingId) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const correlationId = resolveCorrelationId(event.trackingId, event.correlationId);
  const log = createLogger("audit-service", correlationId);
  try {
    const id = await insertEvent("InfoRequested", event.trackingId, correlationId, event, event.timestamp);
    log.info(id ? "recorded InfoRequested event" : "duplicate InfoRequested event skipped", {
      trackingId: event.trackingId,
    });
    const reason = `An approver requested more information${event.reason ? `: ${event.reason}` : "."}`;
    await pushInvoiceStatus(event.trackingId, correlationId, "awaiting_approval", reason);
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    log.error("failed to record InfoRequested event", { trackingId: event.trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});

router.post("/events/decision-finalized", async (req, res) => {
  const event = unwrap(req.body) as DecisionFinalizedEvent | undefined;
  if (!event || typeof event !== "object" || !event.trackingId) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const correlationId = resolveCorrelationId(event.trackingId, event.correlationId);
  const log = createLogger("audit-service", correlationId);
  try {
    const id = await insertEvent("DecisionFinalized", event.trackingId, correlationId, event, event.timestamp);
    log.info(id ? "recorded DecisionFinalized event" : "duplicate DecisionFinalized event skipped", {
      trackingId: event.trackingId,
      outcome: event.outcome,
    });
    await pushInvoiceStatus(event.trackingId, correlationId, event.outcome, event.reason);
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    log.error("failed to record DecisionFinalized event", { trackingId: event.trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});
