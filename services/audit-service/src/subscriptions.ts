import { Router } from "express";

export const router = Router();

router.get("/dapr/subscribe", (_req, res) => {
  res.json([
    {
      pubsubname: "pubsub",
      topic: "InvoiceSubmitted",
      route: "/events/invoice-submitted",
    },
  ]);
});

router.post("/events/invoice-submitted", (req, res) => {
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

  // Only the invoice record itself (has "vendor") is a real audit event -
  // the dedup key's own write publishes a plain trackingId string too.
  if (!event || typeof event !== "object" || !("vendor" in event)) {
    res.status(200).json({ status: "SUCCESS" });
    return;
  }

  console.log("audit-service received InvoiceSubmitted event:", event);
  res.status(200).json({ status: "SUCCESS" });
});
