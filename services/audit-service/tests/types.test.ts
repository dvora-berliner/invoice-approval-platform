import { describe, expect, it } from "vitest";
import * as types from "../src/types";

describe("types module", () => {
  it("loads without runtime exports (types are erased at compile time)", () => {
    expect(typeof types).toBe("object");
  });
});
