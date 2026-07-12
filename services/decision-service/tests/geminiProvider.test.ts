import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/llm/geminiProvider";
import type { InvoiceForDecision } from "../src/types";

const invoice: InvoiceForDecision = {
  trackingId: "t1",
  vendor: "Atlassian",
  invoiceNumber: "INV-1",
  total: 50,
};

function geminiResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GeminiProvider", () => {
  it("returns a parsed recommendation on success", async () => {
    const recommendation = {
      recommendedRoute: "auto_approve",
      confidence: 0.9,
      citedRules: [],
      reasoning: "Looks fine.",
    };
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(recommendation));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider("api-key");
    const result = await provider.recommend(invoice, 50, "policy text");

    expect(result).toEqual(recommendation);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("generateContent"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": "api-key" }),
      }),
    );
  });

  it("throws when the Gemini API responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error", json: async () => ({}) }),
    );

    const provider = new GeminiProvider("api-key");
    await expect(provider.recommend(invoice, 50, "policy text")).rejects.toThrow(/Gemini API error: 500/);
  });

  it("throws when the response has no text content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "", json: async () => ({ candidates: [] }) }),
    );

    const provider = new GeminiProvider("api-key");
    await expect(provider.recommend(invoice, 50, "policy text")).rejects.toThrow("Gemini response had no text content");
  });

  it("throws when the response text fails schema validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse({ recommendedRoute: "not-a-route" })));

    const provider = new GeminiProvider("api-key");
    await expect(provider.recommend(invoice, 50, "policy text")).rejects.toThrow();
  });

  it("aborts the request after the timeout elapses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider("api-key");
    const pending = provider.recommend(invoice, 50, "policy text");
    const assertion = expect(pending).rejects.toThrow("The operation was aborted");

    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });
});
