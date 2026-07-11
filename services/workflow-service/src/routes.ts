import { Router } from "express";
import { getState, getStateWithEtag, saveStateWithEtag } from "./dapr";
import { workflowClient, startInvoiceWorkflow } from "./workflow/runtime";
import { approvalDecisionRequestSchema, workflowInputSchema, type ApprovalQueueItem } from "./types";

export const router = Router();

const approvalItemKeyOf = (trackingId: string) => `approval:${trackingId}`;
const decisionClaimKeyOf = (trackingId: string) => `decision-claimed:${trackingId}`;
const QUEUE_INDEX_KEY = "approval-queue-index";

// ADR-0007-style create-only claim (like submission-service's claimDedupKey): only the
// first POST per trackingId wins. Without it, two concurrent decisions could both
// raiseEvent - Dapr Workflow buffers the extra one instead of dropping it, so it'd
// resurface as a stale decision on a future, unrelated ApprovalDecision wait.
async function claimApprovalDecision(trackingId: string): Promise<boolean> {
  const { value, etag } = await getStateWithEtag<boolean>(decisionClaimKeyOf(trackingId));
  if (value) return false;
  return saveStateWithEtag(decisionClaimKeyOf(trackingId), true, etag);
}

router.get("/dapr/subscribe", (_req, res) => {
  res.json([
    { pubsubname: "pubsub", topic: "InvoiceSubmitted", route: "/events/invoice-submitted" },
    { pubsubname: "pubsub", topic: "InvoiceSupplemented", route: "/events/invoice-supplemented" },
  ]);
});

// submission-service's outbox publishes every write in its state store (dedup keys
// included) to this topic - only the invoice record itself (has "vendor") is real,
// same filtering as audit-service/src/subscriptions.ts.
router.post("/events/invoice-submitted", async (req, res) => {
  const raw = req.body?.data ?? req.body;
  let event: unknown = raw;
  if (typeof raw === "string") {
    try {
      event = JSON.parse(raw);
    } catch {
      res.status(200).json({ status: "SUCCESS" });
      return;
    }
  }

  if (!event || typeof event !== "object" || !("vendor" in event)) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const parseResult = workflowInputSchema.safeParse(event);
  if (!parseResult.success) {
    req.log.error("InvoiceSubmitted event failed validation", { details: parseResult.error.flatten() });
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  try {
    await startInvoiceWorkflow(parseResult.data, req.log);
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    // Ask Dapr to redeliver rather than silently dropping the invoice (§6/M15).
    req.log.error("failed to start invoice workflow", { trackingId: parseResult.data.trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});

router.post("/events/invoice-supplemented", async (req, res) => {
  const raw = req.body?.data ?? req.body;
  let event: unknown;
  try {
    event = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  const trackingId = (event as { trackingId?: unknown })?.trackingId;
  if (typeof trackingId !== "string") {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  try {
    await workflowClient.raiseEvent(trackingId, "InvoiceSupplemented", event);
    req.log.info("InvoiceSupplemented relayed to workflow", { trackingId });
    res.status(200).json({ status: "SUCCESS" });
  } catch (err) {
    // Same reasoning as /events/invoice-submitted above.
    req.log.error("failed to relay InvoiceSupplemented", { trackingId, error: String(err) });
    res.status(200).json({ status: "RETRY" });
  }
});

router.get("/approvals/queue", async (req, res) => {
  try {
    const index = (await getState<string[]>(QUEUE_INDEX_KEY)) ?? [];
    const items = await Promise.all(index.map((trackingId) => getState<ApprovalQueueItem>(approvalItemKeyOf(trackingId))));
    res.status(200).json({ items: items.filter((item): item is ApprovalQueueItem => item !== null) });
  } catch (err) {
    req.log.error("GET /approvals/queue failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load approval queue" });
  }
});

router.get("/approvals/:trackingId", async (req, res) => {
  try {
    const item = await getState<ApprovalQueueItem>(approvalItemKeyOf(req.params.trackingId));
    if (!item) {
      res.status(404).json({ error: "No pending approval found for this trackingId" });
      return;
    }
    res.status(200).json(item);
  } catch (err) {
    req.log.error("GET /approvals/:trackingId failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load approval item" });
  }
});

router.post("/approvals/:trackingId/decision", async (req, res) => {
  const parseResult = approvalDecisionRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid approval decision", details: parseResult.error.flatten() });
    return;
  }

  try {
    const item = await getState<ApprovalQueueItem>(approvalItemKeyOf(req.params.trackingId));
    if (!item) {
      res.status(404).json({ error: "No pending approval found for this trackingId" });
      return;
    }
    if (!(await claimApprovalDecision(req.params.trackingId))) {
      res.status(409).json({ error: "This approval has already been decided" });
      return;
    }
    await workflowClient.raiseEvent(req.params.trackingId, "ApprovalDecision", parseResult.data);
    req.log.info("approval decision raised", { trackingId: req.params.trackingId, action: parseResult.data.action });
    res.status(202).json({ trackingId: req.params.trackingId, action: parseResult.data.action });
  } catch (err) {
    req.log.error("POST /approvals/:trackingId/decision failed", { error: String(err) });
    res.status(500).json({ error: "Failed to record approval decision" });
  }
});
