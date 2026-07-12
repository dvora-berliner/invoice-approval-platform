import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider, getSecret } from "../src/providerFactory";
import { StubProvider } from "../src/llm/stubProvider";
import { GeminiProvider } from "../src/llm/geminiProvider";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSecret", () => {
  it("returns the named secret value from the Dapr secret store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ "gemini-api-key": "sekrit" }) }),
    );

    await expect(getSecret("gemini-api-key")).resolves.toBe("sekrit");
  });

  it("throws when the Dapr secret store responds with an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    await expect(getSecret("gemini-api-key", 1, 0)).rejects.toThrow(/failed to load secret "gemini-api-key"/);
  });

  it("retries on failure and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ "gemini-api-key": "sekrit" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSecret("gemini-api-key", 3, 0)).resolves.toBe("sekrit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses DAPR_HTTP_PORT from the environment when set", async () => {
    vi.stubEnv("DAPR_HTTP_PORT", "4000");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ "gemini-api-key": "sekrit" }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { getSecret: getSecretWithCustomPort } = await import("../src/providerFactory");
    await getSecretWithCustomPort("gemini-api-key");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/v1.0/secrets/local-secrets/gemini-api-key");
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("createProvider", () => {
  it("returns a StubProvider by default", async () => {
    const provider = await createProvider("stub");
    expect(provider).toBeInstanceOf(StubProvider);
  });

  it("returns a StubProvider for any unrecognized provider name", async () => {
    const provider = await createProvider("something-else");
    expect(provider).toBeInstanceOf(StubProvider);
  });

  it("returns a GeminiProvider when configured, loading the API key via Dapr secrets", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ "gemini-api-key": "sekrit" }) }),
    );

    const provider = await createProvider("gemini");
    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});
