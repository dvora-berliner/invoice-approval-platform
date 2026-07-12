import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimDedupKey,
  getInvoiceRecord,
  getInvoiceRecordWithEtag,
  getState,
  publishEvent,
  saveInvoiceRecord,
  saveInvoiceRecordWithEtag,
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

describe("publishEvent", () => {
  it("resolves when the Dapr sidecar accepts the publish", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(publishEvent("InvoiceSupplemented", { a: 1 })).resolves.toBeUndefined();
  });

  it("throws when the publish fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "boom" })));
    await expect(publishEvent("InvoiceSupplemented", { a: 1 })).rejects.toThrow(
      /Dapr publish to InvoiceSupplemented failed: 500/,
    );
  });
});

describe("getState", () => {
  it("returns null for 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(getState("k")).resolves.toBeNull();
  });

  it("returns null for 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getState("k")).resolves.toBeNull();
  });

  it("throws for a non-2xx, non-404 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(getState("k")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns null for an empty 200 body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "" })));
    await expect(getState("k")).resolves.toBeNull();
  });

  it("parses a JSON 200 body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify({ a: 1 }) })));
    await expect(getState("k")).resolves.toEqual({ a: 1 });
  });
});

describe("getInvoiceRecord", () => {
  it("returns null when no state exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getInvoiceRecord("invoice:x")).resolves.toBeNull();
  });

  it("double-parses the pre-stringified record", async () => {
    const record = { trackingId: "x", status: "pending" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: JSON.stringify(JSON.stringify(record)) })),
    );
    await expect(getInvoiceRecord("invoice:x")).resolves.toEqual(record);
  });
});

describe("getInvoiceRecordWithEtag", () => {
  it("throws for a non-200/204/404 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(getInvoiceRecordWithEtag("invoice:x")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("returns a null value with the etag for a 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204, etag: "etag-1" })));
    await expect(getInvoiceRecordWithEtag("invoice:x")).resolves.toEqual({ value: null, etag: "etag-1" });
  });

  it("returns a null value and empty etag for a 404 with no etag header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 404 })));
    await expect(getInvoiceRecordWithEtag("invoice:x")).resolves.toEqual({ value: null, etag: "" });
  });

  it("returns the double-parsed record with its etag for a 200", async () => {
    const record = { trackingId: "x", status: "pending" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ status: 200, text: JSON.stringify(JSON.stringify(record)), etag: "etag-2" }),
      ),
    );
    await expect(getInvoiceRecordWithEtag("invoice:x")).resolves.toEqual({ value: record, etag: "etag-2" });
  });

  it("returns a null value for a 200 with an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 200, text: "", etag: "etag-3" })));
    await expect(getInvoiceRecordWithEtag("invoice:x")).resolves.toEqual({ value: null, etag: "etag-3" });
  });
});

describe("saveInvoiceRecordWithEtag", () => {
  it("returns true when the conditional save succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(saveInvoiceRecordWithEtag("invoice:x", { a: 1 }, "etag-1")).resolves.toBe(true);
  });

  it("returns false when the conditional save conflicts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 409, ok: false })));
    await expect(saveInvoiceRecordWithEtag("invoice:x", { a: 1 }, "etag-1")).resolves.toBe(false);
  });
});

describe("saveInvoiceRecord", () => {
  it("resolves when the transaction succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 204 })));
    await expect(saveInvoiceRecord("invoice:x", { a: 1 })).resolves.toBeUndefined();
  });

  it("throws when the transaction fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(saveInvoiceRecord("invoice:x", { a: 1 })).rejects.toThrow(/Dapr state transaction failed: 500/);
  });
});

describe("claimDedupKey", () => {
  const invoiceKeyOf = (trackingId: string) => `invoice:${trackingId}`;

  it("claims immediately when the dedup key does not exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 404 })) // GET dedup key
      .mockResolvedValueOnce(fakeResponse({ status: 204 })); // POST conditional save succeeds
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).resolves.toEqual({ claimed: true });
  });

  it("reports a duplicate when the dedup key points at an existing invoice record", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200, text: JSON.stringify("track-existing") })) // GET dedup key
      .mockResolvedValueOnce(fakeResponse({ status: 200, text: JSON.stringify(JSON.stringify({ trackingId: "track-existing" })) })); // GET invoice record
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).resolves.toEqual({
      claimed: false,
      existingTrackingId: "track-existing",
    });
  });

  it("reclaims a stale dedup key whose invoice record no longer exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 200, text: JSON.stringify("track-gone"), etag: "etag-1" })) // GET dedup key
      .mockResolvedValueOnce(fakeResponse({ status: 404 })) // GET invoice record -> gone
      .mockResolvedValueOnce(fakeResponse({ status: 204 })); // POST conditional save succeeds
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).resolves.toEqual({ claimed: true });
  });

  it("throws when the initial GET fails with an unexpected status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ status: 500, text: "err" })));
    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).rejects.toThrow(/Dapr state get failed: 500/);
  });

  it("retries once on an etag conflict before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 404 })) // attempt 1: GET dedup key
      .mockResolvedValueOnce(fakeResponse({ status: 409, ok: false })) // attempt 1: POST conflicts
      .mockResolvedValueOnce(fakeResponse({ status: 404 })) // attempt 2: GET dedup key
      .mockResolvedValueOnce(fakeResponse({ status: 204 })); // attempt 2: POST succeeds
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).resolves.toEqual({ claimed: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws after exhausting all retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 404 }))
      .mockResolvedValueOnce(fakeResponse({ status: 409, ok: false }))
      .mockResolvedValueOnce(fakeResponse({ status: 404 }))
      .mockResolvedValueOnce(fakeResponse({ status: 409, ok: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimDedupKey("dedup:x", invoiceKeyOf, "track-1")).rejects.toThrow(
      /Failed to claim dedup key dedup:x after retries/,
    );
  });
});
