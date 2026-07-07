import { Router, type Response } from "express";
import { randomUUID } from "crypto";
import { computeDedupKey } from "./dedup";
import { claimDedupKey, getInvoiceRecord, saveInvoiceRecord } from "./dapr";
import { invoiceSubmissionSchema, type InvoiceRecord } from "./types";

export const router = Router();

const invoiceKeyOf = (trackingId: string) => `invoice:${trackingId}`;

// F2: status responses must include a plain-language explanation, not just a status code.
function statusMessage(status: InvoiceRecord["status"]): string {
  switch (status) {
    case "pending":
      return "Your invoice was received and is awaiting review.";
    case "auto_approved":
      return "Your invoice was automatically approved.";
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

async function respondDuplicate(res: Response, existingTrackingId: string): Promise<void> {
  const existingRecord = await getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(existingTrackingId));
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
      await respondDuplicate(res, claim.existingTrackingId);
      return;
    }

    const record: InvoiceRecord = {
      ...submission,
      trackingId,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    await saveInvoiceRecord(invoiceKeyOf(trackingId), record);

    res.status(202).json({ trackingId });
  } catch (err) {
    console.error("POST /invoices failed:", err);
    res.status(500).json({ error: "Failed to submit invoice" });
  }
});

router.get("/invoices/:trackingId/status", async (req, res) => {
  try {
    const record = await getInvoiceRecord<InvoiceRecord>(invoiceKeyOf(req.params.trackingId));
    if (!record) {
      res.status(404).json({ error: "No invoice found for this trackingId" });
      return;
    }
    res.status(200).json({ ...record, message: statusMessage(record.status) });
  } catch (err) {
    console.error("GET /invoices/:trackingId/status failed:", err);
    res.status(500).json({ error: "Failed to fetch invoice status" });
  }
});
