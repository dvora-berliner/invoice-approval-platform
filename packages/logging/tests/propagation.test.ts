import { describe, expect, it } from "vitest";
import { attachCorrelationId, extractCorrelationId, withCorrelationHeader } from "../src/propagation";

describe("extractCorrelationId", () => {
  it("returns the correlationId when present and a string", () => {
    expect(extractCorrelationId({ correlationId: "abc" })).toBe("abc");
  });

  it("returns undefined when correlationId is not a string", () => {
    expect(extractCorrelationId({ correlationId: 123 })).toBeUndefined();
  });

  it("returns undefined when correlationId is missing", () => {
    expect(extractCorrelationId({ other: "field" })).toBeUndefined();
  });

  it("returns undefined for null payloads", () => {
    expect(extractCorrelationId(null)).toBeUndefined();
  });

  it("returns undefined for non-object payloads", () => {
    expect(extractCorrelationId("just a string")).toBeUndefined();
  });
});

describe("withCorrelationHeader", () => {
  it("adds the correlation header to an empty header set", () => {
    expect(withCorrelationHeader("corr-1")).toEqual({ "x-correlation-id": "corr-1" });
  });

  it("preserves existing headers", () => {
    expect(withCorrelationHeader("corr-1", { Authorization: "Bearer x" })).toEqual({
      Authorization: "Bearer x",
      "x-correlation-id": "corr-1",
    });
  });
});

describe("attachCorrelationId", () => {
  it("adds correlationId onto the payload without mutating the original", () => {
    const payload = { vendor: "Acme" };
    const result = attachCorrelationId("corr-1", payload);

    expect(result).toEqual({ vendor: "Acme", correlationId: "corr-1" });
    expect(payload).not.toHaveProperty("correlationId");
  });
});
