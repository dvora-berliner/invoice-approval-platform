import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFxRates, loadThresholds, loadPolicyContext, getRelevantPolicyContext } from "../src/policy/configStore";
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

describe("loadPolicyContext", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("fs");
  });

  it("reads policy.md fresh on every call (F7 - no startup-only caching)", async () => {
    vi.resetModules();
    const readFileSync = vi.fn().mockReturnValueOnce("v1").mockReturnValueOnce("v2");
    vi.doMock("fs", () => ({ readFileSync }));

    const { loadPolicyContext } = await import("../src/policy/configStore");

    expect(loadPolicyContext()).toBe("v1");
    expect(loadPolicyContext()).toBe("v2");
    expect(readFileSync).toHaveBeenCalledTimes(2);
    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining("policy.md"), "utf-8");
  });
});

describe("getRelevantPolicyContext", () => {
  it("returns meaningfully less text than the full policy for a known category", () => {
    const context = getRelevantPolicyContext({ category: "meals" } as never);
    expect(context).toContain("MEAL-01");
    expect(context).not.toContain("TRAVEL-01");
    expect(context.length).toBeLessThan(loadPolicyContext().length);
  });
});
