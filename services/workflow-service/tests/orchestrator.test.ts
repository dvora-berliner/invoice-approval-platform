import { describe, expect, it } from "vitest";
import { invoiceApprovalWorkflow } from "../src/workflow/orchestrator";
import {
  callDecisionActivity,
  paymentCompensateActivity,
  paymentExecuteActivity,
  paymentReserveActivity,
  persistApprovalItemActivity,
  publishEventActivity,
  releaseBudgetActivity,
  removeApprovalItemActivity,
  reserveBudgetActivity,
} from "../src/workflow/activities";
import type { DecisionResult, WorkflowInput } from "../src/types";

interface Call {
  name: string;
  input: unknown;
}

function makeCtx() {
  const calls: Call[] = [];
  const events: string[] = [];
  const ctx = {
    callActivity: (fn: { name: string }, input: unknown) => {
      calls.push({ name: fn.name, input });
      return { __call: fn.name };
    },
    waitForExternalEvent: (name: string) => {
      events.push(name);
      return { __event: name };
    },
    getCurrentUtcDateTime: () => new Date("2026-01-01T00:00:00.000Z"),
  };
  return { ctx: ctx as never, calls, events };
}

const invoice: WorkflowInput = {
  trackingId: "t1",
  correlationId: "corr-1",
  vendor: "Acme",
  invoiceNumber: "INV-1",
  total: 100,
  department: "sales-2026Q2",
};

const autoApprove: DecisionResult = {
  route: "auto_approve",
  usdAmount: 100,
  confidence: 0.95,
  citedRules: [],
  reason: "clean",
  appliedCeiling: 250,
};

const humanReview: DecisionResult = {
  route: "human_review",
  usdAmount: 300,
  confidence: 0.5,
  citedRules: ["SAAS-01"],
  reason: "over cap",
  appliedCeiling: 250,
};

const reject: DecisionResult = {
  route: "reject",
  usdAmount: 100,
  confidence: 0.9,
  citedRules: ["MEAL-03"],
  reason: "alcohol only",
  appliedCeiling: 250,
};

describe("invoiceApprovalWorkflow - auto_approve payment saga", () => {
  it("pays successfully when budget and payment both succeed", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next(); // decide
    await gen.next(autoApprove); // reserveBudget
    await gen.next({ ok: true, remaining: 400 }); // paymentReserve
    await gen.next({ reservationId: "r1", status: "reserved" }); // paymentExecute
    await gen.next({ reservationId: "r1", status: "executed" }); // publishEvent(DecisionFinalized)
    const result = await gen.next();

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "paid" });
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      paymentReserveActivity.name,
      paymentExecuteActivity.name,
      publishEventActivity.name,
    ]);
    const finalizedCall = calls[4].input as { payload: { outcome: string } };
    expect(finalizedCall.payload.outcome).toBe("paid");
  });

  it("passes simulateOutcome:failure to paymentExecuteActivity when forcePaymentFailure is set (D5 test hook)", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, { ...invoice, forcePaymentFailure: true });

    await gen.next(); // decide
    await gen.next(autoApprove); // reserveBudget
    await gen.next({ ok: true, remaining: 400 }); // paymentReserve
    await gen.next({ reservationId: "r1", status: "reserved" }); // paymentExecute

    const paymentExecuteCall = calls[3].input as { simulateOutcome?: string };
    expect(paymentExecuteCall.simulateOutcome).toBe("failure");
  });

  it("rejects when the department budget is insufficient", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: false, remaining: 10 }); // reserveBudget fails
    const result = await gen.next();

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "rejected", reason: "insufficient_budget" });
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("defaults the reported remaining budget to 0 when reserveBudget omits it", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: false }); // no `remaining` field
    await gen.next();

    const finalizedCall = calls[2].input as { payload: { reason: string } };
    expect(finalizedCall.payload.reason).toBe("Insufficient department budget (remaining $0)");
  });

  it("compensates and releases the budget when payment fails at the business level", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: true, remaining: 400 });
    await gen.next({ reservationId: "r1", status: "reserved" });
    await gen.next({ reservationId: "r1", status: "failed", error: "card declined" }); // execute fails
    await gen.next(); // compensate
    await gen.next(); // release budget
    const result = await gen.next(); // publish DecisionFinalized

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "payment_failed" });
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      paymentReserveActivity.name,
      paymentExecuteActivity.name,
      paymentCompensateActivity.name,
      releaseBudgetActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("defaults the payment_failed reason when the execute result omits an error message", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: true, remaining: 400 });
    await gen.next({ reservationId: "r1", status: "reserved" });
    await gen.next({ reservationId: "r1", status: "failed" }); // no `error` field
    await gen.next();
    await gen.next();
    await gen.next();

    const finalizedCall = calls[6].input as { payload: { reason: string } };
    expect(finalizedCall.payload.reason).toBe("Payment failed");
  });

  it("compensates and releases the budget when an activity faults after a reservation exists", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: true, remaining: 400 });
    await gen.next({ reservationId: "r1", status: "reserved" });
    await gen.throw(new Error("payment-service unreachable")); // paymentExecuteActivity faults
    await gen.next(); // compensate
    await gen.next(); // release budget
    const result = await gen.next(); // publish DecisionFinalized

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "payment_failed", reason: "saga_exception" });
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      paymentReserveActivity.name,
      paymentExecuteActivity.name,
      paymentCompensateActivity.name,
      releaseBudgetActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("only releases the budget (no compensate) when the fault happens before a reservation exists", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.next({ ok: true, remaining: 400 }); // budget reserved
    await gen.throw(new Error("payment-service unreachable")); // paymentReserveActivity faults
    await gen.next(); // release budget only
    const result = await gen.next(); // publish DecisionFinalized

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "payment_failed", reason: "saga_exception" });
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      paymentReserveActivity.name,
      releaseBudgetActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("does nothing extra when the fault happens before any budget reservation", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(autoApprove);
    await gen.throw(new Error("state store unreachable")); // reserveBudgetActivity itself faults
    const result = await gen.next(); // publish DecisionFinalized directly

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "payment_failed", reason: "saga_exception" });
    expect(calls.map((c) => c.name)).toEqual([callDecisionActivity.name, reserveBudgetActivity.name, publishEventActivity.name]);
  });

  it("defaults to the 'unassigned' department when none is set on the invoice", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, { ...invoice, department: undefined });

    await gen.next();
    await gen.next(autoApprove);
    const reserveCall = (await gen.next()).value as unknown;
    void reserveCall;

    expect((calls[1].input as { department: string }).department).toBe("unassigned");
  });
});

describe("invoiceApprovalWorkflow - top-level reject", () => {
  it("finalizes as rejected with no payment saga", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(reject);
    const result = await gen.next();

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "rejected" });
    expect(calls.map((c) => c.name)).toEqual([callDecisionActivity.name, publishEventActivity.name]);
  });
});

describe("invoiceApprovalWorkflow - human review loop", () => {
  it("finalizes as rejected when the approver rejects", async () => {
    const { ctx, calls, events } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next(); // -> decide
    await gen.next(humanReview); // -> persistApprovalItem
    await gen.next(); // -> publish EscalationCreated
    await gen.next(); // -> waitForExternalEvent(ApprovalDecision)
    await gen.next({ action: "reject", approverId: "approver-1", reason: "not policy compliant" }); // -> removeApprovalItem
    await gen.next(); // -> publish DecisionFinalized(rejected)
    const result = await gen.next(); // -> done

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "rejected" });
    expect(events).toEqual(["ApprovalDecision"]);
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      persistApprovalItemActivity.name,
      publishEventActivity.name,
      removeApprovalItemActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("defaults the rejection reason when the approver gives none", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next();
    await gen.next(humanReview);
    await gen.next();
    await gen.next();
    await gen.next({ action: "reject", approverId: "approver-1" }); // no `reason` field
    await gen.next();
    await gen.next();

    const finalizedCall = calls[4].input as { payload: { reason: string } };
    expect(finalizedCall.payload.reason).toBe("Rejected by approver");
  });

  it("re-decides after request_info and proceeds to payment once compliant", async () => {
    const { ctx, calls, events } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next(); // -> decide
    await gen.next(humanReview); // -> persistApprovalItem
    await gen.next(); // -> publish EscalationCreated
    await gen.next(); // -> waitForExternalEvent(ApprovalDecision)
    await gen.next({ action: "request_info", approverId: "approver-1", reason: "need receipt" }); // -> removeApprovalItem
    await gen.next(); // -> publish InfoRequested
    await gen.next(); // -> waitForExternalEvent(InvoiceSupplemented)
    await gen.next({ notes: "receipt attached" }); // -> callDecisionActivity (re-decide)
    await gen.next(autoApprove); // loop exits -> reserveBudget
    await gen.next({ ok: true, remaining: 400 }); // -> paymentReserve
    await gen.next({ reservationId: "r1", status: "reserved" }); // -> paymentExecute
    await gen.next({ reservationId: "r1", status: "executed" }); // -> publish DecisionFinalized(paid)
    const result = await gen.next(); // -> done

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "paid" });
    expect(events).toEqual(["ApprovalDecision", "InvoiceSupplemented"]);
    expect(calls.map((c) => c.name)).toEqual([
      callDecisionActivity.name,
      persistApprovalItemActivity.name,
      publishEventActivity.name,
      removeApprovalItemActivity.name,
      publishEventActivity.name,
      callDecisionActivity.name,
      reserveBudgetActivity.name,
      paymentReserveActivity.name,
      paymentExecuteActivity.name,
      publishEventActivity.name,
    ]);
  });

  it("proceeds to the payment saga once an approver approves", async () => {
    const { ctx, calls } = makeCtx();
    const gen = invoiceApprovalWorkflow(ctx, invoice);

    await gen.next(); // -> decide
    await gen.next(humanReview); // -> persistApprovalItem
    await gen.next(); // -> publish EscalationCreated
    await gen.next(); // -> waitForExternalEvent(ApprovalDecision)
    await gen.next({ action: "approve", approverId: "approver-1" }); // -> removeApprovalItem
    await gen.next(); // -> reserveBudget
    await gen.next({ ok: true, remaining: 400 }); // -> paymentReserve
    await gen.next({ reservationId: "r1", status: "reserved" }); // -> paymentExecute
    await gen.next({ reservationId: "r1", status: "executed" }); // -> publish DecisionFinalized(paid)
    const result = await gen.next(); // -> done

    expect(result.done).toBe(true);
    expect(result.value).toEqual({ outcome: "paid" });
    const finalizedCall = calls[calls.length - 1].input as { payload: { approverId: string } };
    expect(finalizedCall.payload.approverId).toBe("approver-1");
  });
});
