import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { status as grpcStatus } from "@grpc/grpc-js";
import type { Logger } from "@approvalflow/logging";

const { registerWorkflow, registerActivity, runtimeStart, scheduleNewWorkflow } = vi.hoisted(() => ({
  registerWorkflow: vi.fn(),
  registerActivity: vi.fn(),
  runtimeStart: vi.fn().mockResolvedValue(undefined),
  scheduleNewWorkflow: vi.fn(),
}));

vi.mock("@dapr/dapr", () => ({
  WorkflowRuntime: vi.fn().mockImplementation(function WorkflowRuntimeMock() {
    return { registerWorkflow, registerActivity, start: runtimeStart, worker: { _isRunning: true } };
  }),
  DaprWorkflowClient: vi.fn().mockImplementation(function DaprWorkflowClientMock() {
    return { scheduleNewWorkflow };
  }),
}));

import { WorkflowRuntime } from "@dapr/dapr";
import { startInvoiceWorkflow, startWorkflowRuntime, SUPERVISOR_POLL_MS } from "../src/workflow/runtime";
import { allActivities } from "../src/workflow/activities";
import { invoiceApprovalWorkflow } from "../src/workflow/orchestrator";
import type { WorkflowInput } from "../src/types";

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const invoice: WorkflowInput = { trackingId: "t1", vendor: "Acme", invoiceNumber: "INV-1", total: 100 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startWorkflowRuntime", () => {
  it("registers the orchestrator workflow, every activity, and starts the runtime", async () => {
    await startWorkflowRuntime();

    expect(registerWorkflow).toHaveBeenCalledWith(invoiceApprovalWorkflow);
    expect(registerActivity).toHaveBeenCalledTimes(allActivities.length);
    for (const activity of allActivities) {
      expect(registerActivity).toHaveBeenCalledWith(activity);
    }
    expect(runtimeStart).toHaveBeenCalledOnce();
  });

  it("retries the first connection attempt when the sidecar isn't listening yet", async () => {
    runtimeStart.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValueOnce(undefined);

    await startWorkflowRuntime(3, 0);

    expect(runtimeStart).toHaveBeenCalledTimes(2);
  });

  it("throws once the retries are exhausted", async () => {
    runtimeStart.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(startWorkflowRuntime(2, 0)).rejects.toThrow("ECONNREFUSED");
    expect(runtimeStart).toHaveBeenCalledTimes(2);
  });
});

describe("startWorkflowRuntime - supervisor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing while the worker stays alive", async () => {
    runtimeStart.mockResolvedValue(undefined);
    vi.useFakeTimers();
    await startWorkflowRuntime();
    expect(WorkflowRuntime).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SUPERVISOR_POLL_MS);

    expect(WorkflowRuntime).toHaveBeenCalledTimes(1);
  });

  it("rebuilds and restarts the runtime when the worker dies", async () => {
    runtimeStart.mockResolvedValue(undefined);
    vi.useFakeTimers();
    await startWorkflowRuntime();
    const firstInstance = vi.mocked(WorkflowRuntime).mock.results[0].value as { worker: { _isRunning: boolean } };
    firstInstance.worker._isRunning = false;

    await vi.advanceTimersByTimeAsync(SUPERVISOR_POLL_MS);

    expect(WorkflowRuntime).toHaveBeenCalledTimes(2);
    expect(runtimeStart).toHaveBeenCalledTimes(2);
  });

  it("logs when rebuilding the runtime keeps failing", async () => {
    runtimeStart.mockResolvedValue(undefined);
    vi.useFakeTimers();
    await startWorkflowRuntime(1, 0);
    const firstInstance = vi.mocked(WorkflowRuntime).mock.results[0].value as { worker: { _isRunning: boolean } };
    firstInstance.worker._isRunning = false;
    runtimeStart.mockRejectedValue(new Error("still unreachable"));

    await vi.advanceTimersByTimeAsync(SUPERVISOR_POLL_MS);

    expect(runtimeStart).toHaveBeenCalledTimes(2);
  });
});

describe("startInvoiceWorkflow", () => {
  it("schedules a new workflow instance keyed by trackingId", async () => {
    scheduleNewWorkflow.mockResolvedValue(undefined);
    const log = fakeLogger();

    await startInvoiceWorkflow(invoice, log);

    expect(scheduleNewWorkflow).toHaveBeenCalledWith(invoiceApprovalWorkflow, invoice, "t1");
    expect(log.info).toHaveBeenCalledWith("workflow instance started", { trackingId: "t1" });
  });

  it("treats ALREADY_EXISTS as a no-op (redelivered event)", async () => {
    scheduleNewWorkflow.mockRejectedValue({ code: grpcStatus.ALREADY_EXISTS });
    const log = fakeLogger();

    await expect(startInvoiceWorkflow(invoice, log)).resolves.toBeUndefined();
    expect(log.info).toHaveBeenCalledWith(
      "workflow instance already exists - redelivered event, no-op",
      { trackingId: "t1" },
    );
  });

  it("logs and rethrows any other error", async () => {
    const err = new Error("placement service unreachable");
    scheduleNewWorkflow.mockRejectedValue(err);
    const log = fakeLogger();

    await expect(startInvoiceWorkflow(invoice, log)).rejects.toBe(err);
    expect(log.error).toHaveBeenCalledWith("failed to start workflow instance", {
      trackingId: "t1",
      error: String(err),
    });
  });
});
