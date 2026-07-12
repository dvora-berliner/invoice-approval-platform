import { afterEach, describe, expect, it, vi } from "vitest";
import { pushInvoiceStatus } from "../src/serviceClient";

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
