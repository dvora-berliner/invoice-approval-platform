import { createHash } from "crypto";
import type { InvoiceSubmission } from "./types";

export function computeDedupKey(invoice: InvoiceSubmission): string {
  const raw = JSON.stringify([invoice.vendor, invoice.invoiceNumber, invoice.total]);
  return createHash("sha256").update(raw).digest("hex");
}
