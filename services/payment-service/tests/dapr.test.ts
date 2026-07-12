import { afterEach, describe, expect, it, vi } from "vitest";
import { getState, saveState } from "../src/dapr";

function fakeResponse(opts: { status: number; text?: string; ok?: boolean }) {
  return {
    status: opts.status,
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    text: async () => opts.text ?? "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getState", () => {
  it("returns null for 204 and 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(getState("k")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getState("k")).resolves.toBeNull();
  });

  it("throws for a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(getState("k")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns null for an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "" })));
    await expect(getState("k")).resolves.toBeNull();
  });

  it("parses a JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify({ a: 1 }) })));
    await expect(getState("k")).resolves.toEqual({ a: 1 });
  });
});

describe("saveState", () => {
  it("resolves on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(saveState("k", { a: 1 })).resolves.toBeUndefined();
  });

  it("throws on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(saveState("k", { a: 1 })).rejects.toThrow(/Dapr state save failed: 500/);
  });
});
