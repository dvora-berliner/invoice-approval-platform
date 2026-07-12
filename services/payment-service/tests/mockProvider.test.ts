import { afterEach, describe, expect, it, vi } from "vitest";
import { executeMockPayment } from "../src/mockProvider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("executeMockPayment", () => {
  it("succeeds when no outcome is simulated", () => {
    expect(executeMockPayment({ amount: 100 })).toEqual({ success: true });
  });

  it("succeeds when simulateOutcome is 'success'", () => {
    expect(executeMockPayment({ amount: 100, simulateOutcome: "success" })).toEqual({ success: true });
  });

  it("simulates a failure when requested and simulation is allowed", () => {
    const result = executeMockPayment({ amount: 100, simulateOutcome: "failure" });
    expect(result).toEqual({ success: false, error: "Simulated payment provider failure (test-only)" });
  });

  it("ignores a requested failure when simulation is disabled via env", () => {
    vi.stubEnv("MOCK_PROVIDER_ALLOW_SIMULATION", "false");
    expect(executeMockPayment({ amount: 100, simulateOutcome: "failure" })).toEqual({ success: true });
  });
});
