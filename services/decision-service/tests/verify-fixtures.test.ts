import { afterEach, describe, expect, it, vi } from "vitest";

const fixturesPayload = {
  fixtures: [
    {
      id: "F1",
      scenario: "clean-saas",
      category: "saas",
      vendor: "Atlassian",
      invoiceNumber: "INV-1",
      total: 50,
      receiptPresent: true,
      trackingId: "t1",
      expected: { route: "auto_approve", violations: [], reason: "" },
    },
    {
      id: "F2",
      category: "saas",
      vendor: "Atlassian",
      invoiceNumber: "INV-2",
      total: 5000,
      receiptPresent: true,
      trackingId: "t2",
      expected: { route: "human_review", violations: ["SAAS-01"], reason: "" },
    },
    {
      id: "F3",
      scenario: "duplicate-of-F1",
      category: "saas",
      vendor: "Atlassian",
      invoiceNumber: "INV-1",
      total: 50,
      receiptPresent: true,
      trackingId: "t3",
      expected: { route: "auto_approve", violations: [], reason: "" },
    },
    {
      id: "F4",
      scenario: "mismatched-expectation",
      category: "saas",
      vendor: "Atlassian",
      invoiceNumber: "INV-4",
      total: 50,
      receiptPresent: true,
      trackingId: "t4",
      expected: { route: "human_review", violations: [], reason: "" },
    },
    {
      id: "F5",
      scenario: "fails-with-violations",
      category: "saas",
      vendor: "Totally Unknown Vendor",
      invoiceNumber: "INV-5",
      total: 50,
      receiptPresent: true,
      trackingId: "t5",
      expected: { route: "auto_approve", violations: [], reason: "" },
    },
    {
      // No scenario or category - StubProvider treats a blank category as ambiguous
      // (confidence 0.5, below the autonomy threshold), so this must escalate.
      id: "F6",
      vendor: "Atlassian",
      invoiceNumber: "INV-6",
      total: 50,
      receiptPresent: true,
      trackingId: "t6",
      expected: { route: "human_review", violations: [], reason: "" },
    },
  ],
};

describe("verify-fixtures", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("fs");
    vi.restoreAllMocks();
    process.argv = process.argv.slice(0, 2);
  });

  it("runs the fixture set, skipping duplicates and reporting pass/fail counts", async () => {
    vi.doMock("fs", () => ({
      readFileSync: vi.fn((path: string) => {
        if (String(path).endsWith("policy.md")) return "policy text";
        return JSON.stringify(fixturesPayload);
      }),
      writeFileSync: vi.fn(),
    }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await import("../src/verify-fixtures");
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("passed"));
    });

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.startsWith("PASS  F1"))).toBe(true);
    expect(lines.some((l) => l.startsWith("PASS  F2"))).toBe(true);
    expect(lines.some((l) => l.startsWith("SKIP  F3"))).toBe(true);
    expect(lines.some((l) => l.startsWith("FAIL  F4"))).toBe(true);
    expect(lines.some((l) => l.startsWith("FAIL  F5") && l.includes("[violations: GLOBAL-VENDOR"))).toBe(true);
    expect(lines.some((l) => l.startsWith("PASS  F6") && l.includes("expected=human_review"))).toBe(true);
    expect(lines.some((l) => l.includes("3 passed, 2 failed, 1 skipped (out of 6 fixtures)"))).toBe(true);
  });

  it("defaults to sample-invoices.json but accepts an override from argv", async () => {
    const readFileSync = vi.fn((path: string) => {
      if (String(path).endsWith("policy.md")) return "policy text";
      return JSON.stringify({ fixtures: [] });
    });
    vi.doMock("fs", () => ({ readFileSync, writeFileSync: vi.fn() }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [...process.argv.slice(0, 2), "custom-fixtures.json"];

    await import("../src/verify-fixtures");
    await vi.waitFor(() => {
      expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining("custom-fixtures.json"), "utf-8");
    });
  });
});
