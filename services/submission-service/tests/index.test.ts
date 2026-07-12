import { afterEach, describe, expect, it, vi } from "vitest";

function mockApp() {
  const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
  return { app: { listen } };
}

describe("index bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("../src/app");
    vi.restoreAllMocks();
  });

  it("listens on the default port 3001 when PORT is not set", async () => {
    vi.stubEnv("PORT", "");
    const { app } = mockApp();
    vi.doMock("../src/app", () => ({ app }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");

    expect(app.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("submission-service listening on port 3001");
  });

  it("listens on the PORT from the environment when set", async () => {
    vi.stubEnv("PORT", "5555");
    const { app } = mockApp();
    vi.doMock("../src/app", () => ({ app }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");

    expect(app.listen).toHaveBeenCalledWith(5555, expect.any(Function));
  });
});
