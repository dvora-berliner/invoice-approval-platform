import { afterEach, describe, expect, it, vi } from "vitest";

describe("index bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("../src/app");
    vi.restoreAllMocks();
  });

  it("listens on the default port 3004 when PORT is not set", async () => {
    vi.stubEnv("PORT", "");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");

    expect(listen).toHaveBeenCalledWith(3004, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("payment-service listening on port 3004");
  });

  it("listens on the PORT from the environment when set", async () => {
    vi.stubEnv("PORT", "9999");
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");

    expect(listen).toHaveBeenCalledWith(9999, expect.any(Function));
  });
});
