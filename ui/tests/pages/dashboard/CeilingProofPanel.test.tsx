import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../../../src/test/renderWithTheme";

vi.mock("../../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/client")>("../../../src/api/client");
  return { ...actual, api: { getCeilingProof: vi.fn() } };
});

import { api, ApiError } from "../../../src/api/client";
import { CeilingProofPanel } from "../../../src/pages/ControllerDashboard/CeilingProofPanel/CeilingProofPanel";

const getCeilingProofMock = vi.mocked(api.getCeilingProof);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CeilingProofPanel", () => {
  it("shows a passed result with no violations", async () => {
    getCeilingProofMock.mockResolvedValue({ currentCeiling: 250, itemsChecked: 20, violations: [], passed: true });
    renderWithTheme(<CeilingProofPanel />);

    await waitFor(() => expect(screen.getByText("Passed")).toBeInTheDocument());
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("lists violations when the proof fails", async () => {
    getCeilingProofMock.mockResolvedValue({
      currentCeiling: 250,
      itemsChecked: 5,
      passed: false,
      violations: [
        {
          tracking_id: "track-1",
          correlation_id: "corr-1",
          payload: {
            eventType: "DecisionFinalized",
            trackingId: "track-1",
            outcome: "paid",
            reason: "auto-approved above ceiling",
            usdAmount: 500,
            appliedCeiling: 250,
            timestamp: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });
    renderWithTheme(<CeilingProofPanel />);

    await waitFor(() => expect(screen.getByText("Violations found")).toBeInTheDocument());
    expect(screen.getByText("track-1")).toBeInTheDocument();
    expect(screen.getByText(/auto-approved above ceiling/)).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    getCeilingProofMock.mockRejectedValue(new ApiError(502, "Unable to verify"));
    renderWithTheme(<CeilingProofPanel />);

    await waitFor(() => expect(screen.getByText("Unable to verify")).toBeInTheDocument());
  });

  it("shows a generic error message for a network failure", async () => {
    getCeilingProofMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<CeilingProofPanel />);

    await waitFor(() => expect(screen.getByText("Could not reach audit-service.")).toBeInTheDocument());
  });
});
