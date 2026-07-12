import { DaprWorkflowClient, WorkflowRuntime } from "@dapr/dapr";
import { status as grpcStatus } from "@grpc/grpc-js";
import type { Logger } from "@approvalflow/logging";
import { invoiceApprovalWorkflow } from "./orchestrator";
import { allActivities } from "./activities";
import type { WorkflowInput } from "../types";

export const workflowClient = new DaprWorkflowClient();

// ADR-0011: the underlying durabletask-js worker already retries on its own once
// connected (stream "end" -> 5s backoff -> reconnect, indefinitely) - but its *first*
// connection attempt throws with no retry if the sidecar isn't listening yet. That
// cold-start race is the one gap this wraps; an outer supervisor around the whole
// runtime would duplicate the SDK's own retry loop instead of closing a real gap.
export async function startWorkflowRuntime(retries = 10, delayMs = 1000): Promise<void> {
  const runtime = new WorkflowRuntime();
  runtime.registerWorkflow(invoiceApprovalWorkflow);
  for (const activity of allActivities) {
    runtime.registerActivity(activity);
  }
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
