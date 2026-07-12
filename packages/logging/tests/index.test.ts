import { describe, expect, it } from "vitest";
import * as loggingPackage from "../src/index";

describe("package barrel exports", () => {
  it("re-exports the public API", () => {
    expect(typeof loggingPackage.createLogger).toBe("function");
    expect(typeof loggingPackage.correlationMiddleware).toBe("function");
    expect(typeof loggingPackage.extractCorrelationId).toBe("function");
    expect(typeof loggingPackage.withCorrelationHeader).toBe("function");
    expect(typeof loggingPackage.attachCorrelationId).toBe("function");
  });
});
