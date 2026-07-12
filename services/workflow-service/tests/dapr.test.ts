import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteState,
  getState,
  getStateWithEtag,
  invokeService,
  publishEvent,
  saveState,
  saveStateWithEtag,
} from "../src/dapr";

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
  it("resolves when the save succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(saveState("k", { a: 1 })).resolves.toBeUndefined();
  });

  it("throws when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(saveState("k", { a: 1 })).rejects.toThrow(/Dapr state save failed: 500/);
  });
});

describe("deleteState", () => {
  it("resolves on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(deleteState("k")).resolves.toBeUndefined();
  });

  it("resolves when the key is already gone (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404, ok: false })));
    await expect(deleteState("k")).resolves.toBeUndefined();
  });

  it("throws for an unexpected failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, ok: false, text: "err" })));
    await expect(deleteState("k")).rejects.toThrow(/Dapr state delete failed: 500/);
  });
});

describe("getStateWithEtag", () => {
  it("throws for a non-200/204/404 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(getStateWithEtag("k")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns a null value with the etag for non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204, etag: "e1" })));
    await expect(getStateWithEtag("k")).resolves.toEqual({ value: null, etag: "e1" });
  });

  it("returns an empty-string etag when the header is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getStateWithEtag("k")).resolves.toEqual({ value: null, etag: "" });
  });

  it("parses the body and returns the etag for 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify([1, 2]), etag: "e2" })));
    await expect(getStateWithEtag("k")).resolves.toEqual({ value: [1, 2], etag: "e2" });
  });

  it("returns a null value for an empty 200 body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "", etag: "e3" })));
    await expect(getStateWithEtag("k")).resolves.toEqual({ value: null, etag: "e3" });
  });
});

describe("saveStateWithEtag", () => {
  it("returns true on success and false on conflict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(saveStateWithEtag("k", 1, "e1")).resolves.toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 409, ok: false })));
    await expect(saveStateWithEtag("k", 1, "e1")).resolves.toBe(false);
  });
});

describe("invokeService", () => {
  it("attaches a correlation header when a correlationId is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeService("decision-service", "decide", { a: 1 }, "corr-1");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/invoke/decision-service/method/decide"),
      expect.objectContaining({ headers: expect.objectContaining({ "x-correlation-id": "corr-1" }) }),
    );
  });

  it("omits the correlation header when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await invokeService("decision-service", "decide", { a: 1 });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("returns undefined for an empty response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "" })));
    await expect(invokeService("payment-service", "payments/reserve", {})).resolves.toBeUndefined();
  });

  it("throws when the upstream call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, ok: false, text: "boom" })));
    await expect(invokeService("payment-service", "payments/reserve", {})).rejects.toThrow(
      /Dapr service invocation payment-service\/payments\/reserve failed: 500/,
    );
  });
});

describe("publishEvent", () => {
  it("resolves on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(publishEvent("DecisionFinalized", { a: 1 })).resolves.toBeUndefined();
  });

  it("throws on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(publishEvent("DecisionFinalized", { a: 1 })).rejects.toThrow(/Dapr publish to DecisionFinalized failed: 500/);
  });
});
