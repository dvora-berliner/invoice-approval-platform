import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney, formatPercent } from "../../src/lib/format";

describe("formatMoney", () => {
  it("formats a USD amount by default", () => {
    expect(formatMoney(100)).toBe("$100.00");
  });

  it("formats a given currency", () => {
    expect(formatMoney(100, "EUR")).toBe("€100.00");
  });

  it("falls back to a plain numeric string for an invalid currency code", () => {
    expect(formatMoney(100, "NOT-A-CODE")).toBe("100.00 NOT-A-CODE");
  });
});

describe("formatDateTime", () => {
  it("formats a valid ISO string", () => {
    const result = formatDateTime("2026-01-15T10:30:00.000Z");
    expect(result).toContain("2026");
  });

  it("returns the raw input for an invalid date string", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatPercent", () => {
  it("converts a fraction to a rounded percentage string", () => {
    expect(formatPercent(0.8)).toBe("80%");
  });

  it("rounds to the nearest whole percent", () => {
    expect(formatPercent(0.955)).toBe("96%");
  });
});
