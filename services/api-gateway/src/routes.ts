import { Router, type Request, type Response } from "express";
import { invokeService } from "./dapr";

export const router = Router();

// Only routes meant for external callers are proxied - decision-service, payment-service,
// and audit-service's internal PATCH /invoices/:id/status are never exposed here.
function proxy(appId: string, methodOf: (req: Request) => string) {
  return async (req: Request, res: Response) => {
    try {
      const { status, body } = await invokeService(appId, methodOf(req), req);
      res.status(status).json(body);
    } catch (err) {
      req.log.error(`proxy to ${appId} failed`, { error: String(err) });
      res.status(502).json({ error: `Upstream service ${appId} unavailable` });
    }
  };
}

// submission-service (F1, F2, F3, F5)
router.post("/invoices", proxy("submission-service", () => "invoices"));
router.get("/invoices/:trackingId/status", proxy("submission-service", (req) => `invoices/${req.params.trackingId}/status`));
router.patch("/invoices/:trackingId/supplement", proxy("submission-service", (req) => `invoices/${req.params.trackingId}/supplement`));

// workflow-service (F4, F5)
router.get("/approvals/queue", proxy("workflow-service", () => "approvals/queue"));
router.get("/approvals/:trackingId", proxy("workflow-service", (req) => `approvals/${req.params.trackingId}`));
router.post("/approvals/:trackingId/decision", proxy("workflow-service", (req) => `approvals/${req.params.trackingId}/decision`));

// audit-service (F8, F9, F10, M8)
router.get("/audit/trail/:id", proxy("audit-service", (req) => `trail/${req.params.id}`));
router.get("/audit/dashboard", proxy("audit-service", () => "dashboard"));
router.get("/audit/ceiling-proof", proxy("audit-service", () => "ceiling-proof"));
router.get("/audit/notifications/:trackingId", proxy("audit-service", (req) => `notifications/${req.params.trackingId}`));
