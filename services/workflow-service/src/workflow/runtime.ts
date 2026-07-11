import { DaprWorkflowClient, WorkflowRuntime } from "@dapr/dapr";
import { status as grpcStatus } from "@grpc/grpc-js";
import type { Logger } from "@approvalflow/logging";
import { invoiceApprovalWorkflow } from "./orchestrator";
import { allActivities } from "./activities";
import type { WorkflowInput } from "../types";

export const workflowClient = new DaprWorkflowClient();

export async function startWorkflowRuntime(): Promise<void> {
  const runtime = new WorkflowRuntime();
  runtime.registerWorkflow(invoiceApprovalWorkflow);
  for (const activity of allActivities) {
    runtime.registerActivity(activity);
  }
  // start() only awaits the gRPC handshake - the work-item loop itself runs in the
  // background (see @dapr/dapr's TaskHubGrpcWorker.start), so this resolves quickly.
  await runtime.start();
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
