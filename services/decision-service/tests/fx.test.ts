import { describe, expect, it } from "vitest";
import { FALLBACK_FX_RATES, convertToUsd, isForeignCurrency } from "../src/policy/fx";

describe("convertToUsd", () => {
  it("passes USD through at rate 1", () => {
    expect(convertToUsd(100, "USD", FALLBACK_FX_RATES)).toBe(100);
  });

  it("defaults to USD when currency is undefined", () => {
    expect(convertToUsd(100, undefined, FALLBACK_FX_RATES)).toBe(100);
  });

  it("converts a foreign currency using the given rate", () => {
    expect(convertToUsd(100, "EUR", FALLBACK_FX_RATES)).toBe(108);
  });

  it("is case-insensitive on the currency code", () => {
    expect(convertToUsd(100, "eur", FALLBACK_FX_RATES)).toBe(108);
  });

  it("rounds to 2 decimal places", () => {
    expect(convertToUsd(33.333, "EUR", FALLBACK_FX_RATES)).toBe(36);
  });

  it("throws for an unknown currency", () => {
    expect(() => convertToUsd(100, "XYZ", FALLBACK_FX_RATES)).toThrow("Unknown currency: XYZ");
  });
});

describe("isForeignCurrency", () => {
  it("is false for USD", () => {
    expect(isForeignCurrency("USD")).toBe(false);
  });

  it("is false when currency is undefined", () => {
    expect(isForeignCurrency(undefined)).toBe(false);
  });

  it("is true for a non-USD currency", () => {
    expect(isForeignCurrency("EUR")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isForeignCurrency("usd")).toBe(false);
  });
});
