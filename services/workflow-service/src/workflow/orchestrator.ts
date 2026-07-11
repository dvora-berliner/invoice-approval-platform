import type { WorkflowContext } from "@dapr/dapr";
import {
  callDecisionActivity,
  persistApprovalItemActivity,
  removeApprovalItemActivity,
  publishEventActivity,
  reserveBudgetActivity,
  releaseBudgetActivity,
  paymentReserveActivity,
  paymentExecuteActivity,
  paymentCompensateActivity,
  type ReserveBudgetResult,
  type PaymentReserveResult,
  type PaymentExecuteResult,
} from "./activities";
import type {
  ApprovalDecisionRequest,
  ApprovalQueueItem,
  DecisionFinalizedEvent,
  DecisionResult,
  EscalationCreatedEvent,
  FinalOutcome,
  InfoRequestedEvent,
  WorkflowInput,
  WorkflowResult,
} from "../types";

// Pure - `now` is always ctx.getCurrentUtcDateTime(), never Date.now().
// Always carries decision.usdAmount/citedRules/agentReasoning/appliedCeiling - F9/F10 need these on every outcome.
function finalizedEvent(
  invoice: WorkflowInput,
  decision: DecisionResult,
  outcome: FinalOutcome,
  reason: string,
  now: Date,
  approverId?: string
): DecisionFinalizedEvent {
  return {
    eventType: "DecisionFinalized",
    trackingId: invoice.trackingId,
    correlationId: invoice.correlationId,
    outcome,
    reason,
    usdAmount: decision.usdAmount,
    appliedCeiling: decision.appliedCeiling,
    citedRules: decision.citedRules,
    agentReasoning: decision.agentReasoning,
    approverId,
    timestamp: now.toISOString(),
  };
}

// ARCHITECTURE.md §3b/§4: decide -> (reject | human_review pause/resume | auto_approve)
// -> budget reservation + payment saga with compensation.
export function* invoiceApprovalWorkflow(
  ctx: WorkflowContext,
  input: WorkflowInput
): Generator<any, WorkflowResult, any> {
  let invoice = input;
  let decision: DecisionResult = yield ctx.callActivity(callDecisionActivity, invoice);
  let approverId: string | undefined;

  while (decision.route === "human_review") {
    const item: ApprovalQueueItem = {
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
      invoice,
      decision,
      createdAt: ctx.getCurrentUtcDateTime().toISOString(),
    };
    yield ctx.callActivity(persistApprovalItemActivity, { item });

    const escalation: EscalationCreatedEvent = {
      eventType: "EscalationCreated",
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
      usdAmount: decision.usdAmount,
      reason: decision.reason,
      timestamp: ctx.getCurrentUtcDateTime().toISOString(),
    };
    yield ctx.callActivity(publishEventActivity, { topic: "EscalationCreated", payload: escalation });

    // Durable pause - survives a workflow-service restart (M11).
    const approvalRequest: ApprovalDecisionRequest = yield ctx.waitForExternalEvent("ApprovalDecision");
    yield ctx.callActivity(removeApprovalItemActivity, {
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
    });

    if (approvalRequest.action === "reject") {
      yield ctx.callActivity(publishEventActivity, {
        topic: "DecisionFinalized",
        payload: finalizedEvent(
          invoice,
          decision,
          "rejected",
          approvalRequest.reason ?? "Rejected by approver",
          ctx.getCurrentUtcDateTime(),
          approvalRequest.approverId
        ),
      });
      return { outcome: "rejected" };
    }

    if (approvalRequest.action === "request_info") {
      const infoRequested: InfoRequestedEvent = {
        eventType: "InfoRequested",
        trackingId: invoice.trackingId,
        correlationId: invoice.correlationId,
        approverId: approvalRequest.approverId,
        reason: approvalRequest.reason,
        timestamp: ctx.getCurrentUtcDateTime().toISOString(),
      };
      yield ctx.callActivity(publishEventActivity, { topic: "InfoRequested", payload: infoRequested });

      // Merge the submitter's fields before re-deciding, or F5 would re-run on stale data.
      const supplement: Partial<WorkflowInput> = yield ctx.waitForExternalEvent("InvoiceSupplemented");
      invoice = { ...invoice, ...supplement };
      decision = yield ctx.callActivity(callDecisionActivity, invoice);
      continue;
    }

    // action === "approve"
    approverId = approvalRequest.approverId;
    break;
  }

  if (decision.route === "reject") {
    yield ctx.callActivity(publishEventActivity, {
      topic: "DecisionFinalized",
      payload: finalizedEvent(invoice, decision, "rejected", decision.reason, ctx.getCurrentUtcDateTime()),
    });
    return { outcome: "rejected" };
  }

  // route === "auto_approve", or a human approver just approved above - payment saga (§4).
  // try/catch: an activity that faults (not just returns a failure status) throws at
  // its yield - without catching that here, it would abort the whole orchestrator
  // uncaught, skipping compensation and leaving a reserved budget dangling.
  const department = invoice.department ?? "unassigned";
  let budgetReserved = false;
  let reservation: PaymentReserveResult | undefined;
  try {
    const reserveResult: ReserveBudgetResult = yield ctx.callActivity(reserveBudgetActivity, {
      department,
      amount: decision.usdAmount,
      correlationId: invoice.correlationId,
    });
    if (!reserveResult.ok) {
      yield ctx.callActivity(publishEventActivity, {
        topic: "DecisionFinalized",
        payload: finalizedEvent(
          invoice,
          decision,
          "rejected",
          `Insufficient department budget (remaining $${reserveResult.remaining ?? 0})`,
          ctx.getCurrentUtcDateTime(),
          approverId
        ),
      });
      return { outcome: "rejected", reason: "insufficient_budget" };
    }
    budgetReserved = true;

    const reserveResponse: PaymentReserveResult = yield ctx.callActivity(paymentReserveActivity, {
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
      amount: decision.usdAmount,
      currency: "USD",
      department,
    });
    reservation = reserveResponse; // visible to the catch block below
    const executeResult: PaymentExecuteResult = yield ctx.callActivity(paymentExecuteActivity, {
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
      reservationId: reserveResponse.reservationId,
    });

    if (executeResult.status === "executed") {
      yield ctx.callActivity(publishEventActivity, {
        topic: "DecisionFinalized",
        payload: finalizedEvent(invoice, decision, "paid", "Payment executed successfully", ctx.getCurrentUtcDateTime(), approverId),
      });
      return { outcome: "paid" };
    }

    // Payment failed (business-level, not thrown) - compensate and release the budget.
    yield ctx.callActivity(paymentCompensateActivity, {
      trackingId: invoice.trackingId,
      correlationId: invoice.correlationId,
      reservationId: reserveResponse.reservationId,
    });
    yield ctx.callActivity(releaseBudgetActivity, {
      department,
      amount: decision.usdAmount,
      correlationId: invoice.correlationId,
    });
    yield ctx.callActivity(publishEventActivity, {
      topic: "DecisionFinalized",
      payload: finalizedEvent(
        invoice,
        decision,
        "payment_failed",
        executeResult.error ?? "Payment failed",
        ctx.getCurrentUtcDateTime(),
        approverId
      ),
    });
    return { outcome: "payment_failed" };
  } catch (err) {
    // Undo whatever already succeeded. /payments/compensate 409s instead of
    // double-compensating, so it's safe to call even if execute actually went through.
    if (reservation) {
      yield ctx.callActivity(paymentCompensateActivity, {
        trackingId: invoice.trackingId,
        correlationId: invoice.correlationId,
        reservationId: reservation.reservationId,
      });
    }
    if (budgetReserved) {
      yield ctx.callActivity(releaseBudgetActivity, {
        department,
        amount: decision.usdAmount,
        correlationId: invoice.correlationId,
      });
    }
    yield ctx.callActivity(publishEventActivity, {
      topic: "DecisionFinalized",
      payload: finalizedEvent(
        invoice,
        decision,
        "payment_failed",
        `Payment saga failed: ${String(err)}`,
        ctx.getCurrentUtcDateTime(),
        approverId
      ),
    });
    return { outcome: "payment_failed", reason: "saga_exception" };
  }
}
