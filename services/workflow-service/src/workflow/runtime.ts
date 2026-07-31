import { DaprWorkflowClient, WorkflowRuntime } from "@dapr/dapr";
import { status as grpcStatus } from "@grpc/grpc-js";
import { createLogger, type Logger } from "@approvalflow/logging";
import { invoiceApprovalWorkflow } from "./orchestrator";
import { allActivities } from "./activities";
import type { WorkflowInput } from "../types";

export const workflowClient = new DaprWorkflowClient();

export const SUPERVISOR_POLL_MS = 5000;

function buildRuntime(): WorkflowRuntime {
  const runtime = new WorkflowRuntime();
  runtime.registerWorkflow(invoiceApprovalWorkflow);
  for (const activity of allActivities) {
    runtime.registerActivity(activity);
  }
  return runtime;
}

async function startWithRetry(runtime: WorkflowRuntime, retries: number, delayMs: number): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      // start() only awaits the gRPC handshake - the work-item loop itself runs in the
      // background (see @dapr/dapr's TaskHubGrpcWorker.start), so this resolves quickly.
      await runtime.start();
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// ADR-0011: the SDK's worker never recovers once its background stream dies - and that
// death is otherwise invisible, since start() already resolved before it happens. This
// polls the worker's own internal running-flag (undocumented, but the only signal
// available) and rebuilds + restarts the whole runtime whenever it goes down.
function isAlive(runtime: WorkflowRuntime): boolean {
  const worker = (runtime as unknown as { worker?: { _isRunning?: boolean } }).worker;
  return worker?._isRunning !== false;
}

export async function startWorkflowRuntime(retries = 10, delayMs = 1000): Promise<void> {
  let runtime = buildRuntime();
  await startWithRetry(runtime, retries, delayMs);

  const log = createLogger("workflow-service");
  const interval = setInterval(() => {
    if (isAlive(runtime)) return;
    log.error("workflow runtime worker died - rebuilding and restarting");
    runtime = buildRuntime();
    startWithRetry(runtime, retries, delayMs).catch((err) => {
      log.error("failed to restart workflow runtime worker", { error: String(err) });
    });
  }, SUPERVISOR_POLL_MS);
  interval.unref();
}

// A fixed instanceId (trackingId) is this service's §5 "processed-event ledger": a
// redelivered InvoiceSubmitted event hits ALREADY_EXISTS, a legitimate no-op. Any other
// error must not be swallowed the same way (§6/M15 "fail cleanly, never silently").
export async function startInvoiceWorkflow(input: WorkflowInput, log: Logger): Promise<void> {
  try {
    await workflowClient.scheduleNewWorkflow(invoiceApprovalWorkflow, input, input.trackingId);
    log.info("workflow instance started", { trackingId: input.trackingId });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === grpcStatus.ALREADY_EXISTS) {
      log.info("workflow instance already exists - redelivered event, no-op", { trackingId: input.trackingId });
      return;
    }
    log.error("failed to start workflow instance", { trackingId: input.trackingId, error: String(err) });
    throw err;
  }
}
