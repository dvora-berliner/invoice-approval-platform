import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFxRates, loadThresholds } from "../src/policy/configStore";
import { DEFAULT_THRESHOLDS, type AutonomyThresholds } from "../src/policy/thresholds";
import { FALLBACK_FX_RATES } from "../src/policy/fx";

function fakeResponse(opts: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.json,
    text: async () => opts.text ?? "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadThresholds", () => {
  it("returns thresholds parsed from Dapr configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          ok: true,
          json: { "AUTONOMY-CEILING": { value: "500" }, "AUTONOMY-CONFIDENCE": { value: "0.75" } },
        }),
      ),
    );

    const result = await loadThresholds();
    expect(result).toEqual<AutonomyThresholds>({ ceiling: 500, confidence: 0.75 });
  });

  it("falls back to defaults when the fetch is not ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, text: "down" })));

    await expect(loadThresholds()).resolves.toEqual(DEFAULT_THRESHOLDS);
  });

  it("falls back to defaults when the returned values are not finite numbers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: true, json: { "AUTONOMY-CEILING": { value: "not-a-number" } } }),
      ),
    );

    await expect(loadThresholds()).resolves.toEqual(DEFAULT_THRESHOLDS);
  });

  it("falls back to defaults when fetch itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(loadThresholds()).resolves.toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("loadFxRates", () => {
  it("returns rates parsed from Dapr configuration, always including USD:1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: true, json: { "FX-RATES": { value: JSON.stringify({ EUR: 1.1, GBP: 1.3 }) } } }),
      ),
    );

    await expect(loadFxRates()).resolves.toEqual({ USD: 1, EUR: 1.1, GBP: 1.3 });
  });

  it("falls back when the fetch is not ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, text: "down" })));

    await expect(loadFxRates()).resolves.toEqual(FALLBACK_FX_RATES);
  });

  it("falls back when the FX-RATES key is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: {} })));

    await expect(loadFxRates()).resolves.toEqual(FALLBACK_FX_RATES);
  });

  it("falls back when fetch itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(loadFxRates()).resolves.toEqual(FALLBACK_FX_RATES);
  });
});
