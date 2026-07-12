import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCeiling } from "../src/config";

function fakeResponse(opts: { ok: boolean; json?: unknown; status?: number; text?: string }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.json,
    text: async () => opts.text ?? "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadCeiling", () => {
  it("returns the configured ceiling as a number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { "AUTONOMY-CEILING": { value: "250" } } })));
    await expect(loadCeiling()).resolves.toBe(250);
  });

  it("throws when the fetch is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, text: "down" })));
    await expect(loadCeiling()).rejects.toThrow(/Dapr configuration fetch failed: 500/);
  });

  it("throws when the returned value is not a finite number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { "AUTONOMY-CEILING": { value: "not-a-number" } } })));
    await expect(loadCeiling()).rejects.toThrow(/invalid AUTONOMY-CEILING value/);
  });
});
