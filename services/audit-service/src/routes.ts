import { Router } from "express";
import { eventsForTrackingOrCorrelation, queryRows, type DecisionEventRow } from "./db";
import { loadCeiling } from "./config";
import type { DecisionFinalizedEvent, InfoRequestedEvent } from "./types";

export const router = Router();

// F9: full ordered decision trail for one item, by trackingId OR correlationId - a
// submitter/approver typically only knows the trackingId, not the internal correlation id.
router.get("/trail/:id", async (req, res) => {
  try {
    const events = await eventsForTrackingOrCorrelation(req.params.id);
    if (events.length === 0) {
      res.status(404).json({ error: "No decision trail found for this id" });
      return;
    }
    res.status(200).json({ id: req.params.id, events });
  } catch (err) {
    req.log.error("GET /trail/:id failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load decision trail" });
  }
});

interface FinalizedAggRow {
  payload: DecisionFinalizedEvent;
  occurred_at: string;
}

// F8: throughput, auto-approval vs. escalation rates, money auto-approved vs. human-approved.
router.get("/dashboard", async (req, res) => {
  try {
    const [submittedCount] = await queryRows<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM decision_events WHERE event_type = 'InvoiceSubmitted'`
    );
    const [escalatedCount] = await queryRows<{ count: string }>(
      `SELECT COUNT(DISTINCT tracking_id)::text AS count FROM decision_events WHERE event_type = 'EscalationCreated'`
    );
    const submittedByDayRows = await queryRows<{ day: string; count: string }>(
      `SELECT occurred_at::date::text AS day, COUNT(*)::text AS count
       FROM decision_events WHERE event_type = 'InvoiceSubmitted' GROUP BY day ORDER BY day`
    );
    const finalized = await queryRows<FinalizedAggRow>(
      `SELECT payload, occurred_at::text AS occurred_at FROM decision_events WHERE event_type = 'DecisionFinalized' ORDER BY occurred_at ASC`
    );

    let autoApprovedCount = 0;
    let humanApprovedCount = 0;
    let autoApprovedUsd = 0;
    let humanApprovedUsd = 0;
    let rejectedCount = 0;
    const finalizedByDay = new Map<string, number>();

    for (const row of finalized) {
      const outcome = row.payload.outcome;
      const day = row.occurred_at.slice(0, 10);
      finalizedByDay.set(day, (finalizedByDay.get(day) ?? 0) + 1);

      if (outcome === "paid" || outcome === "payment_failed") {
        if (row.payload.approverId) {
          humanApprovedCount += 1;
          humanApprovedUsd += row.payload.usdAmount;
        } else {
          autoApprovedCount += 1;
          autoApprovedUsd += row.payload.usdAmount;
        }
      } else if (outcome === "rejected") {
        rejectedCount += 1;
      }
    }

    res.status(200).json({
      totalSubmitted: Number(submittedCount?.count ?? 0),
      totalEscalated: Number(escalatedCount?.count ?? 0),
      totalFinalized: finalized.length,
      autoApproved: { count: autoApprovedCount, usdAmount: autoApprovedUsd },
      humanApproved: { count: humanApprovedCount, usdAmount: humanApprovedUsd },
      rejected: rejectedCount,
      // Two different clocks: when items arrived vs. when the system finished with them.
      submittedByDay: Object.fromEntries(submittedByDayRows.map((r) => [r.day, Number(r.count)])),
      finalizedByDay: Object.fromEntries(finalizedByDay),
    });
  } catch (err) {
    req.log.error("GET /dashboard failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// F10: each row is checked against its own recorded appliedCeiling, not today's live
// value - M13 lets the ceiling change over time. currentCeiling is context only.
router.get("/ceiling-proof", async (req, res) => {
  let currentCeiling: number;
  try {
    currentCeiling = await loadCeiling();
  } catch (err) {
    req.log.error("GET /ceiling-proof: failed to load AUTONOMY-CEILING", { error: String(err) });
    res.status(502).json({ error: "Unable to verify: could not load the configured autonomy ceiling" });
    return;
  }

  try {
    const [{ count: itemsChecked }] = await queryRows<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM decision_events
       WHERE event_type = 'DecisionFinalized'
         AND payload->>'outcome' IN ('paid','payment_failed')
         AND payload->>'approverId' IS NULL`
    );
    const violations = await queryRows<{ tracking_id: string; correlation_id: string; payload: DecisionFinalizedEvent }>(
      `SELECT tracking_id, correlation_id, payload FROM decision_events
       WHERE event_type = 'DecisionFinalized'
         AND payload->>'outcome' IN ('paid','payment_failed')
         AND payload->>'approverId' IS NULL
         AND (payload->>'usdAmount')::numeric > COALESCE((payload->>'appliedCeiling')::numeric, $1)`,
      [currentCeiling]
    );
    res.status(200).json({
      currentCeiling,
      itemsChecked: Number(itemsChecked),
      violations,
      passed: violations.length === 0,
    });
  } catch (err) {
    req.log.error("GET /ceiling-proof failed", { error: String(err) });
    res.status(500).json({ error: "Failed to run ceiling proof" });
  }
});

export function notificationMessageFor(row: DecisionEventRow): string {
  if (row.event_type === "DecisionFinalized") {
    const payload = row.payload as unknown as DecisionFinalizedEvent;
    switch (payload.outcome) {
      case "paid":
        return "Your invoice was approved and payment was completed.";
      case "rejected":
        return `Your invoice was rejected: ${payload.reason}`;
      case "payment_failed":
        return "Your invoice was approved, but payment failed and is being resolved.";
      default:
        return payload.reason;
    }
  }
  if (row.event_type === "InfoRequested") {
    const payload = row.payload as unknown as InfoRequestedEvent;
    return `An approver requested more information${payload.reason ? `: ${payload.reason}` : "."}`;
  }
  return "Your invoice is being processed.";
}

// M8 "notify submitter": no email/SSE infra yet, so this exposes the recorded events for polling.
router.get("/notifications/:trackingId", async (req, res) => {
  try {
    const events = await eventsForTrackingOrCorrelation(req.params.trackingId);
    const notifiable = events
      .filter((e) => e.event_type === "DecisionFinalized" || e.event_type === "InfoRequested")
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .map((row) => ({
        eventType: row.event_type,
        occurredAt: row.occurred_at,
        message: notificationMessageFor(row),
      }));

    if (notifiable.length === 0) {
      res.status(404).json({ error: "No notifications found for this trackingId" });
      return;
    }
    res.status(200).json({ trackingId: req.params.trackingId, latest: notifiable[0], history: notifiable });
  } catch (err) {
    req.log.error("GET /notifications/:trackingId failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load notifications" });
  }
});
