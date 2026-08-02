import { afterEach, describe, expect, it, vi } from "vitest";
import { pushInvoiceStatus, resolveTrackingId } from "../src/serviceClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushInvoiceStatus", () => {
  it("resolves when submission-service accepts the status update", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushInvoiceStatus("t1", "corr-1", "paid", "all good")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/invoke/submission-service/method/invoices/t1/status"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "x-correlation-id": "corr-1" }),
        body: JSON.stringify({ status: "paid", reason: "all good" }),
      }),
    );
  });

  it("throws when submission-service rejects the update", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "not found" }));

    await expect(pushInvoiceStatus("t1", "corr-1", "paid", "all good")).rejects.toThrow(
      /failed to push status to submission-service: 404/,
    );
  });
});

describe("resolveTrackingId", () => {
  it("resolves a pretty id to its tracking id via submission-service", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ trackingId: "t1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveTrackingId("INV-2026-0001")).resolves.toBe("t1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/invoke/submission-service/method/invoices/INV-2026-0001/status"),
    );
  });

  it("falls back to the input unchanged when submission-service doesn't recognize it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(resolveTrackingId("c1")).resolves.toBe("c1");
  });

  it("falls back to the input unchanged when submission-service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(resolveTrackingId("c1")).resolves.toBe("c1");
  });
});
