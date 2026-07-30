import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeSecretResponse(secret: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ "jwt-secret": secret }),
    text: async () => JSON.stringify({ "jwt-secret": secret }),
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getJwtSecret", () => {
  it("uses DAPR_HTTP_PORT from the environment when set", async () => {
    vi.stubEnv("DAPR_HTTP_PORT", "4000");
    const fetchMock = vi.fn().mockResolvedValue(fakeSecretResponse("test-secret"));
    vi.stubGlobal("fetch", fetchMock);
    const { getJwtSecret } = await import("../../src/auth/jwt");

    await getJwtSecret();

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/v1.0/secrets/local-secrets/jwt-secret");
    vi.unstubAllEnvs();
  });

  it("returns the secret from the Dapr secret store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse("test-secret")));
    const { getJwtSecret } = await import("../../src/auth/jwt");

    await expect(getJwtSecret()).resolves.toBe("test-secret");
  });

  it("caches the secret across calls (fetches it only once)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeSecretResponse("test-secret"));
    vi.stubGlobal("fetch", fetchMock);
    const { getJwtSecret } = await import("../../src/auth/jwt");

    await getJwtSecret();
    await getJwtSecret();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse("", false, 500)));
    const { getJwtSecret } = await import("../../src/auth/jwt");

    await expect(getJwtSecret(1, 0)).rejects.toThrow(/failed to load secret "jwt-secret"/);
  });

  it("retries on failure and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("sidecar not ready"))
      .mockResolvedValueOnce(fakeSecretResponse("test-secret"));
    vi.stubGlobal("fetch", fetchMock);
    const { getJwtSecret } = await import("../../src/auth/jwt");

    await expect(getJwtSecret(3, 0)).resolves.toBe("test-secret");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("signToken / verifyToken", () => {
  it("signs a token and verifies it back to the same payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse("test-secret")));
    const { signToken, verifyToken } = await import("../../src/auth/jwt");

    const token = await signToken({ username: "alice", role: "approver" });
    const payload = await verifyToken(token);

    expect(payload).toMatchObject({ username: "alice", role: "approver" });
  });

  it("rejects a token signed with a different secret", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse("secret-a")));
    const { signToken } = await import("../../src/auth/jwt");
    const token = await signToken({ username: "alice", role: "approver" });

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeSecretResponse("secret-b")));
    const { verifyToken } = await import("../../src/auth/jwt");

    await expect(verifyToken(token)).rejects.toThrow();
  });
});
