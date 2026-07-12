import { afterEach, describe, expect, it, vi } from "vitest";

describe("index bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("../src/app");
    vi.doUnmock("../src/workflow/runtime");
    vi.restoreAllMocks();
  });

  it("starts the workflow runtime before listening on the default port 3003", async () => {
    vi.stubEnv("PORT", "");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    const buildApp = vi.fn().mockReturnValue({ listen });
    const startWorkflowRuntime = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../src/app", () => ({ buildApp }));
    vi.doMock("../src/workflow/runtime", () => ({ startWorkflowRuntime }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(startWorkflowRuntime).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith(3003, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("workflow-service listening on port 3003");
  });

  it("listens on the PORT from the environment when set", async () => {
    vi.stubEnv("PORT", "7000");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.doMock("../src/workflow/runtime", () => ({ startWorkflowRuntime: vi.fn().mockResolvedValue(undefined) }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(listen).toHaveBeenCalledWith(7000, expect.any(Function));
  });

  it("logs and exits the process when the workflow runtime fails to start", async () => {
    vi.stubEnv("PORT", "");
    vi.doMock("../src/app", () => ({ buildApp: vi.fn() }));
    vi.doMock("../src/workflow/runtime", () => ({
      startWorkflowRuntime: vi.fn().mockRejectedValue(new Error("placement unreachable")),
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../src/index");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(errorSpy).toHaveBeenCalledWith("workflow-service failed to start", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
