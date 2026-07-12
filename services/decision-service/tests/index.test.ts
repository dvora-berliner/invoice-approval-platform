import { afterEach, describe, expect, it, vi } from "vitest";

describe("index bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("../src/app");
    vi.doUnmock("../src/providerFactory");
    vi.doUnmock("fs");
    vi.restoreAllMocks();
  });

  it("builds the app with the created provider, reads the policy file, and listens", async () => {
    vi.stubEnv("PORT", "");
    vi.stubEnv("LLM_PROVIDER", "stub");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    const fakeApp = { listen };
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const createProvider = vi.fn().mockResolvedValue({ recommend: vi.fn() });
    vi.doMock("../src/app", () => ({ buildApp }));
    vi.doMock("../src/providerFactory", () => ({ createProvider }));
    vi.doMock("fs", () => ({ readFileSync: vi.fn().mockReturnValue("policy text") }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(createProvider).toHaveBeenCalledWith("stub");
    expect(buildApp).toHaveBeenCalledWith(expect.any(Object), "policy text");
    expect(listen).toHaveBeenCalledWith(3002, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("decision-service listening on port 3002 (LLM_PROVIDER=stub)");
  });

  it("defaults LLM_PROVIDER to 'stub' when the environment variable is unset", async () => {
    vi.stubEnv("PORT", "");
    delete process.env.LLM_PROVIDER;
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    const createProvider = vi.fn().mockResolvedValue({ recommend: vi.fn() });
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.doMock("../src/providerFactory", () => ({ createProvider }));
    vi.doMock("fs", () => ({ readFileSync: vi.fn().mockReturnValue("policy text") }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(createProvider).toHaveBeenCalledWith("stub");
  });

  it("listens on the PORT from the environment when set", async () => {
    vi.stubEnv("PORT", "6000");
    vi.stubEnv("LLM_PROVIDER", "stub");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.doMock("../src/providerFactory", () => ({ createProvider: vi.fn().mockResolvedValue({ recommend: vi.fn() }) }));
    vi.doMock("fs", () => ({ readFileSync: vi.fn().mockReturnValue("policy text") }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(listen).toHaveBeenCalledWith(6000, expect.any(Function));
  });

  it("logs and exits the process when startup fails", async () => {
    vi.stubEnv("PORT", "");
    vi.stubEnv("LLM_PROVIDER", "stub");
    vi.doMock("../src/providerFactory", () => ({
      createProvider: vi.fn().mockRejectedValue(new Error("secret store unreachable")),
    }));
    vi.doMock("../src/app", () => ({ buildApp: vi.fn() }));
    vi.doMock("fs", () => ({ readFileSync: vi.fn().mockReturnValue("policy text") }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../src/index");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(errorSpy).toHaveBeenCalledWith("decision-service failed to start", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
