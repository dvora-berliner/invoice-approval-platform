import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser, getUser } from "../../src/auth/userStore";

function fakeResponse(opts: { status: number; text?: string; etag?: string; ok?: boolean }) {
  const headers = new Map<string, string>();
  if (opts.etag !== undefined) headers.set("etag", opts.etag);
  return {
    status: opts.status,
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => opts.text ?? "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getUser", () => {
  it("returns null when the user does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getUser("ghost")).resolves.toBeNull();
  });

  it("returns the stored user on a 200", async () => {
    const user = { username: "alice", passwordHash: "hash", role: "submitter" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify(user) })));
    await expect(getUser("alice")).resolves.toEqual(user);
  });

  it("throws on an unexpected status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(getUser("alice")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns null for a 200 with an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "" })));
    await expect(getUser("alice")).resolves.toBeNull();
  });
});

describe("createUser", () => {
  const user = { username: "alice", passwordHash: "hash", role: "submitter" as const };

  it("creates the user when the username is free", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 404 })) // GET - not taken
      .mockResolvedValueOnce(fakeResponse({ status: 204 })); // POST conditional save succeeds
    vi.stubGlobal("fetch", fetchMock);

    await expect(createUser(user)).resolves.toBe(true);
  });

  it("returns false when the username is already taken", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify(user) })));

    await expect(createUser(user)).resolves.toBe(false);
    // Only the existence check should fire - no attempt to overwrite an existing user.
  });

  it("throws when the initial GET fails unexpectedly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(createUser(user)).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns false when the conditional save loses a race", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 404 }))
      .mockResolvedValueOnce(fakeResponse({ status: 409, ok: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createUser(user)).resolves.toBe(false);
  });
});
