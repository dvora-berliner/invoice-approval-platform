import { describe, expect, it } from "vitest";
import * as provider from "../src/llm/provider";

describe("provider module", () => {
  it("loads without runtime exports (types are erased at compile time)", () => {
    expect(typeof provider).toBe("object");
  });
});
