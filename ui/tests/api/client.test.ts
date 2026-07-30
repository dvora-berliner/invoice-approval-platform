import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/api/client";

function fakeResponse(opts: { ok: boolean; status?: number; json?: unknown; contentType?: string }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    headers: { get: (name: string) => (name === "content-type" ? (opts.contentType ?? "application/json") : null) },
    json: async () => opts.json,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("api client base URL", () => {
  it("falls back to http://localhost:3000 when VITE_API_BASE_URL is unset", async () => {
    const original = import.meta.env.VITE_API_BASE_URL;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL;
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const fresh = await import("../../src/api/client");
    await fresh.api.getStatus("t1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/invoices/t1/status", expect.anything());

    (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL = original;
    vi.resetModules();
  });
});

describe("api client - auth", () => {
  it("registers a new user via POST /auth/register", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, status: 201, json: { token: "t", username: "u1", role: "submitter" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.register({ username: "u1", password: "longenough", role: "submitter" });

    expect(result).toEqual({ token: "t", username: "u1", role: "submitter" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("logs in via POST /auth/login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, json: { token: "t", username: "u1", role: "approver" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.login({ username: "u1", password: "correct" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "u1", password: "correct" }) }),
    );
  });

  it("attaches an Authorization header when a session is stored", async () => {
    localStorage.setItem(
      "approvalflow.session",
      JSON.stringify({ token: "stored-token", username: "u1", role: "submitter" }),
    );
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getStatus("t1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer stored-token");
  });

  it("omits the Authorization header when there is no stored session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getStatus("t1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe("api client", () => {
  it("submits an invoice via POST /invoices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.submitInvoice({ vendor: "Acme", invoiceNumber: "INV-1", total: 100 });

    expect(result).toEqual({ trackingId: "t1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/invoices",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("looks up status via GET, url-encoding the trackingId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t/1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getStatus("t/1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/invoices/t%2F1/status", expect.anything());
  });

  it("supplements an invoice via PATCH", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.supplementInvoice("t1", { notes: "more info" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/invoices/t1/supplement",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ notes: "more info" }) }),
    );
  });

  it("fetches the approval queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { items: [] } })));
    await expect(api.getApprovalQueue()).resolves.toEqual({ items: [] });
  });

  it("fetches a single approval item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getApproval("t1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/approvals/t1", expect.anything());
  });

  it("posts an approval decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1", action: "approve" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.decideApproval("t1", { approverId: "a1", action: "approve" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/approvals/t1/decision",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ approverId: "a1", action: "approve" }) }),
    );
  });

  it("fetches the dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: {} })));
    await api.getDashboard();
  });

  it("fetches the ceiling proof", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: {} })));
    await api.getCeilingProof();
  });

  it("fetches the decision trail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { id: "t1", events: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getTrail("t1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/audit/trail/t1", expect.anything());
  });

  it("fetches notifications", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, json: { trackingId: "t1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getNotifications("t1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/audit/notifications/t1", expect.anything());
  });

  it("throws an ApiError with the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404, json: { error: "not found" } })));

    await expect(api.getStatus("missing")).rejects.toMatchObject({
      status: 404,
      message: "not found",
    });
  });

  it("throws an ApiError with the details field when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 400, json: { error: "bad request", details: { field: "vendor" } } })),
    );

    try {
      await api.submitInvoice({ vendor: "", invoiceNumber: "INV-1", total: 100 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).details).toEqual({ field: "vendor" });
    }
  });

  it("falls back to a generic message when the error body has no 'error' field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, json: {} })));

    await expect(api.getStatus("t1")).rejects.toMatchObject({ message: "Request failed with status 500" });
  });

  it("falls back to a generic message when the response body isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 502, contentType: "text/plain" })));

    await expect(api.getStatus("t1")).rejects.toMatchObject({ message: "Request failed with status 502" });
  });

  it("returns undefined body for a non-JSON success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: true, contentType: "text/plain" })));

    await expect(api.getStatus("t1")).resolves.toBeUndefined();
  });

  it("treats an unparseable JSON success body as undefined", async () => {
    const res = fakeResponse({ ok: true, contentType: "application/json" });
    res.json = async () => {
      throw new Error("invalid json");
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    await expect(api.getStatus("t1")).resolves.toBeUndefined();
  });
});
