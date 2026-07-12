import type { WorkflowActivityContext } from "@dapr/dapr";
import { createLogger } from "@approvalflow/logging";
import { saveState, deleteState, getStateWithEtag, saveStateWithEtag, invokeService, publishEvent } from "../dapr";
import { defaultBudgetFor } from "../policy/budgets";
import type { ApprovalQueueItem, BudgetRecord, DecisionResult, WorkflowInput } from "../types";

// All I/O lives here, not in orchestrator.ts - Dapr Workflow replays the orchestrator
// from history, so it must stay deterministic (no direct fetch/Date.now/Math.random).

const approvalItemKeyOf = (trackingId: string) => `approval:${trackingId}`;
const decisionClaimKeyOf = (trackingId: string) => `decision-claimed:${trackingId}`;
const budgetKeyOf = (department: string) => `budget:${department}`;
const QUEUE_INDEX_KEY = "approval-queue-index";
const MAX_ETAG_RETRIES = 5;

export async function callDecisionActivity(_ctx: WorkflowActivityContext, input: WorkflowInput): Promise<DecisionResult> {
  const log = createLogger("workflow-service", input.correlationId);
  const result = await invokeService<DecisionResult>("decision-service", "decide", input, input.correlationId);
  log.info("decision-service returned a route", { trackingId: input.trackingId, route: result.route });
  return result;
}

export interface PersistApprovalItemInput {
  item: ApprovalQueueItem;
}
export async function persistApprovalItemActivity(_ctx: WorkflowActivityContext, input: PersistApprovalItemInput): Promise<void> {
  const log = createLogger("workflow-service", input.item.correlationId);
  await saveState(approvalItemKeyOf(input.item.trackingId), input.item);
  // The routes.ts create-only claim on POST /approvals/:id/decision guards a single
  // escalation cycle (double-click protection); F5's request_info loop can re-escalate
  // the same trackingId, so each new cycle needs a fresh claim - reset it here.
  await deleteState(decisionClaimKeyOf(input.item.trackingId));

  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<string[]>(QUEUE_INDEX_KEY);
    const index = value ?? [];
    if (index.includes(input.item.trackingId)) return;
    const updated = [...index, input.item.trackingId];
    if (await saveStateWithEtag(QUEUE_INDEX_KEY, updated, etag)) {
      log.info("added to approval queue", { trackingId: input.item.trackingId });
      return;
    }
  }
  log.error("failed to add to approval queue index after retries", { trackingId: input.item.trackingId });
  throw new Error(`Failed to add ${input.item.trackingId} to approval queue index after retries`);
}

export interface RemoveApprovalItemInput {
  trackingId: string;
  correlationId?: string;
}
// Index update happens *before* deleting the item's own state: if the index update
// exhausts its retries and throws, nothing's deleted yet, so nothing's left orphaned.
export async function removeApprovalItemActivity(_ctx: WorkflowActivityContext, input: RemoveApprovalItemInput): Promise<void> {
  const log = createLogger("workflow-service", input.correlationId);

  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<string[]>(QUEUE_INDEX_KEY);
    const index = value ?? [];
    if (!index.includes(input.trackingId)) {
      await deleteState(approvalItemKeyOf(input.trackingId));
      return;
    }
    const updated = index.filter((id) => id !== input.trackingId);
    if (await saveStateWithEtag(QUEUE_INDEX_KEY, updated, etag)) {
      await deleteState(approvalItemKeyOf(input.trackingId));
      log.info("removed from approval queue", { trackingId: input.trackingId });
      return;
    }
  }
  log.error("failed to remove from approval queue index after retries - item left intact", { trackingId: input.trackingId });
  throw new Error(`Failed to remove ${input.trackingId} from approval queue index after retries`);
}

export interface PublishEventInput {
  topic: string;
  payload: { trackingId: string; correlationId?: string } & Record<string, unknown>;
}
export async function publishEventActivity(_ctx: WorkflowActivityContext, input: PublishEventInput): Promise<void> {
  const log = createLogger("workflow-service", input.payload.correlationId);
  await publishEvent(input.topic, input.payload);
  log.info("published event", { topic: input.topic, trackingId: input.payload.trackingId });
}

export interface BudgetInput {
  department: string;
  amount: number;
  correlationId?: string;
}
export interface ReserveBudgetResult {
  ok: boolean;
  remaining?: number;
}
// ADR-0007 pattern applied to a balance instead of a dedup key.
export async function reserveBudgetActivity(_ctx: WorkflowActivityContext, input: BudgetInput): Promise<ReserveBudgetResult> {
  const log = createLogger("workflow-service", input.correlationId);
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<BudgetRecord>(budgetKeyOf(input.department));
    const current = value ?? { department: input.department, remaining: defaultBudgetFor(input.department) };
    if (current.remaining < input.amount) {
      log.warn("budget insufficient", { department: input.department, amount: input.amount, remaining: current.remaining });
      return { ok: false, remaining: current.remaining };
    }
    const updated: BudgetRecord = { ...current, remaining: current.remaining - input.amount };
    if (await saveStateWithEtag(budgetKeyOf(input.department), updated, etag)) {
      log.info("budget reserved", { department: input.department, amount: input.amount, remaining: updated.remaining });
      return { ok: true, remaining: updated.remaining };
    }
  }
  log.error("failed to reserve budget after retries (concurrent contention)", { department: input.department });
  throw new Error(`Failed to reserve budget for ${input.department} after retries (concurrent contention)`);
}

export async function releaseBudgetActivity(_ctx: WorkflowActivityContext, input: BudgetInput): Promise<void> {
  const log = createLogger("workflow-service", input.correlationId);
  for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt++) {
    const { value, etag } = await getStateWithEtag<BudgetRecord>(budgetKeyOf(input.department));
    const current = value ?? { department: input.department, remaining: defaultBudgetFor(input.department) };
    const updated: BudgetRecord = { ...current, remaining: current.remaining + input.amount };
    if (await saveStateWithEtag(budgetKeyOf(input.department), updated, etag)) {
      log.info("budget released", { department: input.department, amount: input.amount, remaining: updated.remaining });
      return;
    }
  }
  log.error("failed to release budget after retries (concurrent contention)", { department: input.department });
  throw new Error(`Failed to release budget for ${input.department} after retries (concurrent contention)`);
}

export interface PaymentReserveInput {
  trackingId: string;
  correlationId?: string;
  amount: number;
  currency?: string;
  department?: string;
}
export interface PaymentReserveResult {
  reservationId: string;
  status: string;
}
export async function paymentReserveActivity(_ctx: WorkflowActivityContext, input: PaymentReserveInput): Promise<PaymentReserveResult> {
  const log = createLogger("workflow-service", input.correlationId);
  const result = await invokeService<PaymentReserveResult>(
    "payment-service",
    "payments/reserve",
    {
      idempotencyKey: `${input.trackingId}:reserve`,
      amount: input.amount,
      currency: input.currency,
      department: input.department,
      trackingId: input.trackingId,
    },
    input.correlationId
  );
  log.info("payment reserved", { trackingId: input.trackingId, reservationId: result.reservationId });
  return result;
}

export interface PaymentExecuteInput {
  trackingId: string;
  correlationId?: string;
  reservationId: string;
}
export interface PaymentExecuteResult {
  reservationId: string;
  status: "executed" | "failed" | "reserved" | "compensated";
  error?: string;
}
export async function paymentExecuteActivity(_ctx: WorkflowActivityContext, input: PaymentExecuteInput): Promise<PaymentExecuteResult> {
  const log = createLogger("workflow-service", input.correlationId);
  const result = await invokeService<PaymentExecuteResult>(
    "payment-service",
    "payments/execute",
    { idempotencyKey: `${input.trackingId}:execute`, reservationId: input.reservationId },
    input.correlationId
  );
  log.info("payment execute result", { trackingId: input.trackingId, status: result.status });
  return result;
}

export interface PaymentCompensateInput {
  trackingId: string;
  correlationId?: string;
  reservationId: string;
}
export async function paymentCompensateActivity(_ctx: WorkflowActivityContext, input: PaymentCompensateInput): Promise<void> {
  const log = createLogger("workflow-service", input.correlationId);
  await invokeService(
    "payment-service",
    "payments/compensate",
    { idempotencyKey: `${input.trackingId}:compensate`, reservationId: input.reservationId },
    input.correlationId
  );
  log.info("payment compensated", { trackingId: input.trackingId, reservationId: input.reservationId });
}

export const allActivities = [
  callDecisionActivity,
  persistApprovalItemActivity,
  removeApprovalItemActivity,
  publishEventActivity,
  reserveBudgetActivity,
  releaseBudgetActivity,
  paymentReserveActivity,
  paymentExecuteActivity,
  paymentCompensateActivity,
];
