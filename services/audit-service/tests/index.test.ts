import { afterEach, describe, expect, it, vi } from "vitest";

function fakeSecretResponse(opts: { ok: boolean; status?: number; body?: Record<string, string> }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.body ?? {},
  };
}

describe("index bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("../src/app");
    vi.doUnmock("../src/db");
    vi.restoreAllMocks();
  });

  it("loads the Postgres secret, initializes the pool and schema, then listens", async () => {
    vi.stubEnv("PORT", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse({ ok: true, body: { "postgres-password": "s3cret" } })));
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    const buildApp = vi.fn().mockReturnValue({ listen });
    const initPool = vi.fn();
    const ensureSchema = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../src/app", () => ({ buildApp }));
    vi.doMock("../src/db", () => ({ initPool, ensureSchema }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(initPool).toHaveBeenCalledWith("s3cret");
    expect(ensureSchema).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith(3005, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("audit-service listening on port 3005");
  });

  it("listens on the PORT from the environment when set", async () => {
    vi.stubEnv("PORT", "8888");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse({ ok: true, body: { "postgres-password": "s3cret" } })));
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.doMock("../src/db", () => ({ initPool: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(listen).toHaveBeenCalledWith(8888, expect.any(Function));
  });

  it("uses DAPR_HTTP_PORT from the environment when loading the secret", async () => {
    vi.stubEnv("PORT", "");
    vi.stubEnv("DAPR_HTTP_PORT", "4000");
    const fetchMock = vi.fn().mockResolvedValue(fakeSecretResponse({ ok: true, body: { "postgres-password": "s3cret" } }));
    vi.stubGlobal("fetch", fetchMock);
    const listen = vi.fn((_port: number, cb?: () => void) => cb?.());
    vi.doMock("../src/app", () => ({ buildApp: vi.fn().mockReturnValue({ listen }) }));
    vi.doMock("../src/db", () => ({ initPool: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/index");
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/v1.0/secrets/local-secrets/postgres-password");
  });

  it(
    "throws when the secret store rejects the request",
    async () => {
      vi.stubEnv("PORT", "");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse({ ok: false, status: 403 })));
      vi.doMock("../src/app", () => ({ buildApp: vi.fn() }));
      vi.doMock("../src/db", () => ({ initPool: vi.fn(), ensureSchema: vi.fn() }));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await import("../src/index");
      // getSecret retries (cold-start protection) before giving up - allow it to exhaust its retries.
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled(), { timeout: 12000 });

      expect(errorSpy).toHaveBeenCalledWith("audit-service failed to start", expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
    },
    15000
  );

  it("logs and exits when ensureSchema fails", async () => {
    vi.stubEnv("PORT", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse({ ok: true, body: { "postgres-password": "s3cret" } })));
    vi.doMock("../src/app", () => ({ buildApp: vi.fn() }));
    vi.doMock("../src/db", () => ({
      initPool: vi.fn(),
      ensureSchema: vi.fn().mockRejectedValue(new Error("schema migration failed")),
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../src/index");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());

    expect(errorSpy).toHaveBeenCalledWith("audit-service failed to start", expect.any(Error));
  });
});
