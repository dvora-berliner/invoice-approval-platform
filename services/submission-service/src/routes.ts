import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { attachCorrelationId } from "@approvalflow/logging";
import { computeDedupKey } from "./dedup";
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
} from "./dapr";
import {
  invoiceSubmissionSchema,
  invoiceStatusUpdateSchema,
  invoiceSupplementSchema,
  type InvoiceRecord,
  type InvoiceStatus,
} from "./types";

export const router = Router();

const invoiceKeyOf = (trackingId: string) => `invoice:${trackingId}`;
const TERMINAL_STATUSES: ReadonlySet<InvoiceStatus> = new Set(["paid", "rejected", "payment_failed"]);
const MAX_ETAG_RETRIES = 5;

const submitterIndexKeyOf = (username: string) => `submitter-index:${username}`;
const ALL_INVOICES_INDEX_KEY = "all-invoices-index";
const INVOICE_COUNTER_KEY = "invoice-counter";
const prettyKeyOf = (prettyId: string) => `pretty:${prettyId}`;

async function appendToIndex(key: string, trackingId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<string[]>(key);
    if (await saveStateWithEtag(key, [...(value ?? []), trackingId], etag)) return;
  }
  throw new Error(`Failed to append to index ${key} after retries`);
}

async function nextPrettyId(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<number>(INVOICE_COUNTER_KEY);
    const next = (value ?? 0) + 1;
    if (await saveStateWithEtag(INVOICE_COUNTER_KEY, next, etag)) {
      return `INV-${year}-${String(next).padStart(4, "0")}`;
    }
  }
  throw new Error("Failed to allocate a pretty invoice id after retries");
}

// F2: status responses must include a plain-language explanation, not just a status code.
function statusMessage(status: InvoiceRecord["status"]): string {
  switch (status) {
    case "pending":
      return "Your invoice was received and is awaiting review.";
    case "awaiting_approval":
      return "Your invoice needs a human approver's decision.";
    case "rejected":
      return "Your invoice was rejected.";
    case "paid":
      return "Your invoice was approved and payment was completed.";
    case "payment_failed":
      return "Your invoice was approved, but payment failed and is being resolved.";
  }
}

async function respondDuplicate(req: Request, res: Response, existingTrackingId: string): Promise<void> {
  const existingRecord = await getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(existingTrackingId));
  req.log.info("duplicate submission short-circuited", { trackingId: existingTrackingId });
  res.status(200).json({
    ...existingRecord,
    trackingId: existingTrackingId,
    duplicateSubmission: true,
    message: existingRecord
      ? `This invoice was already submitted (current status: ${existingRecord.status}).`
      : statusMessage("pending"),
  });
}

router.post("/invoices", async (req, res) => {
  try {
    const parseResult = invoiceSubmissionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid invoice submission", details: parseResult.error.flatten() });
      return;
    }
    const submission = parseResult.data;

    const dedupKey = `dedup:${computeDedupKey(submission)}`;
    const trackingId = randomUUID();

    const claim = await claimDedupKey(dedupKey, invoiceKeyOf, trackingId);
    if (!claim.claimed) {
      await respondDuplicate(req, res, claim.existingTrackingId);
      return;
    }

    const prettyId = await nextPrettyId();
    const submittedByUsername = req.header("x-user-username") || undefined;

    const record: InvoiceRecord = attachCorrelationId(req.correlationId, {
      ...submission,
      trackingId,
      prettyId,
      submittedByUsername,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
    await saveInvoiceRecord(invoiceKeyOf(trackingId), record);
    await saveStateWithEtag(prettyKeyOf(prettyId), trackingId, "");
    await appendToIndex(ALL_INVOICES_INDEX_KEY, trackingId);
    if (submittedByUsername) await appendToIndex(submitterIndexKeyOf(submittedByUsername), trackingId);

    req.log.info("invoice submitted", { trackingId, prettyId });
    res.status(202).json({ trackingId, prettyId });
  } catch (err) {
    req.log.error("POST /invoices failed", { error: String(err) });
    res.status(500).json({ error: "Failed to submit invoice" });
  }
});

router.get("/invoices/:trackingId/status", async (req, res) => {
  try {
    let record = await getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(req.params.trackingId));
    if (!record) {
      const resolvedTrackingId = await getState<string>(prettyKeyOf(req.params.trackingId.toUpperCase()));
      if (resolvedTrackingId) record = await getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(resolvedTrackingId));
    }
    if (!record) {
      res.status(404).json({ error: "No invoice found for this trackingId" });
      return;
    }
    res.status(200).json({ ...record, message: record.reason ?? statusMessage(record.status) });
  } catch (err) {
    req.log.error("GET /invoices/:trackingId/status failed", { error: String(err) });
    res.status(500).json({ error: "Failed to fetch invoice status" });
  }
});

async function loadIndexedInvoices(indexKey: string): Promise<InvoiceRecord[]> {
  const index = (await getState<string[]>(indexKey)) ?? [];
  const items = await Promise.all(index.map((id) => getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(id))));
  return items
    .filter((item): item is InvoiceRecord => item !== null)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

router.get("/invoices/mine", async (req, res) => {
  const username = req.header("x-user-username");
  if (!username) {
    res.status(400).json({ error: "Missing user identity" });
    return;
  }
  try {
    res.status(200).json({ items: await loadIndexedInvoices(submitterIndexKeyOf(username)) });
  } catch (err) {
    req.log.error("GET /invoices/mine failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load your invoices" });
  }
});

// Admin-only - enforced at the gateway, not re-checked here (same trust model as the rest
// of this service's routes).
router.get("/invoices", async (req, res) => {
  try {
    res.status(200).json({ items: await loadIndexedInvoices(ALL_INVOICES_INDEX_KEY) });
  } catch (err) {
    req.log.error("GET /invoices failed", { error: String(err) });
    res.status(500).json({ error: "Failed to load invoices" });
  }
});

// Internal - called by audit-service only, via Dapr service invocation.
router.patch("/invoices/:trackingId/status", async (req, res) => {
  const parseResult = invoiceStatusUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid status update", details: parseResult.error.flatten() });
    return;
  }

  const key = invoiceKeyOf(req.params.trackingId);
  try {
    for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
      const { value: record, etag } = await getInvoiceRecordWithEtag<InvoiceRecord>(key);
      if (!record) {
        res.status(404).json({ error: "No invoice found for this trackingId" });
        return;
      }
      // Guards against a reordered redelivery regressing a terminal status.
      if (TERMINAL_STATUSES.has(record.status) && !TERMINAL_STATUSES.has(parseResult.data.status)) {
        req.log.warn("ignoring out-of-order status update", {
          trackingId: req.params.trackingId,
          current: record.status,
          attempted: parseResult.data.status,
        });
        res.status(200).json({ trackingId: req.params.trackingId, status: record.status });
        return;
      }
      const updated: InvoiceRecord = { ...record, status: parseResult.data.status, reason: parseResult.data.reason };
      if (await saveInvoiceRecordWithEtag(key, updated, etag)) {
        req.log.info("invoice status updated", { trackingId: req.params.trackingId, status: parseResult.data.status });
        res.status(200).json({ trackingId: req.params.trackingId, status: parseResult.data.status });
        return;
      }
    }
    req.log.error("failed to update invoice status after retries (concurrent contention)", { trackingId: req.params.trackingId });
    res.status(409).json({ error: "Failed to update invoice status due to concurrent updates" });
  } catch (err) {
    req.log.error("PATCH /invoices/:trackingId/status failed", { error: String(err) });
    res.status(500).json({ error: "Failed to update invoice status" });
  }
});

// F5: submitter supplies missing/corrected fields; resumes the paused workflow.
router.patch("/invoices/:trackingId/supplement", async (req, res) => {
  const parseResult = invoiceSupplementSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid supplement", details: parseResult.error.flatten() });
    return;
  }

  const key = invoiceKeyOf(req.params.trackingId);
  try {
    let saved: InvoiceRecord | undefined;
    for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
      const { value: record, etag } = await getInvoiceRecordWithEtag<InvoiceRecord>(key);
      if (!record) {
        res.status(404).json({ error: "No invoice found for this trackingId" });
        return;
      }
      const updated: InvoiceRecord = { ...record, ...parseResult.data };
      // Record update + outbox marker are written atomically (see dapr.ts) so the
      // relay poller can never publish without the write having landed, or vice versa.
      const event = {
        trackingId: req.params.trackingId,
        correlationId: updated.correlationId,
        occurredAt: new Date().toISOString(),
        ...parseResult.data,
      };
      if (await saveInvoiceRecordWithOutboxEvent(key, updated, etag, "InvoiceSupplemented", event)) {
        saved = updated;
        break;
      }
    }
    if (!saved) {
      req.log.error("failed to supplement invoice after retries (concurrent contention)", { trackingId: req.params.trackingId });
      res.status(409).json({ error: "Failed to supplement invoice due to concurrent updates" });
      return;
    }
    req.log.info("invoice supplemented", { trackingId: req.params.trackingId, fields: Object.keys(parseResult.data) });
    res.status(202).json({ trackingId: req.params.trackingId });
  } catch (err) {
    req.log.error("PATCH /invoices/:trackingId/supplement failed", { error: String(err) });
    res.status(500).json({ error: "Failed to supplement invoice" });
  }
});
