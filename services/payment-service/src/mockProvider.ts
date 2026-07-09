export type PaymentOutcome = { success: true } | { success: false; error: string };

export function executeMockPayment(input: { amount: number; simulateOutcome?: "success" | "failure" }): PaymentOutcome {
  const allowSimulation = process.env.MOCK_PROVIDER_ALLOW_SIMULATION !== "false";
  if (allowSimulation && input.simulateOutcome === "failure") {
    return { success: false, error: "Simulated payment provider failure (test-only)" };
  }
  return { success: true };
}
