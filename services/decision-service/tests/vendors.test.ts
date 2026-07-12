import { describe, expect, it } from "vitest";
import { isVendorKnown } from "../src/policy/vendors";

describe("isVendorKnown", () => {
  it("recognizes a known vendor by exact name", () => {
    expect(isVendorKnown("Atlassian")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isVendorKnown("atlassian")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isVendorKnown("  Atlassian  ")).toBe(true);
  });

  it("returns false for an unknown vendor", () => {
    expect(isVendorKnown("Some Random Shop")).toBe(false);
  });
});
