import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../../../src/test/renderWithTheme";

vi.mock("../../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/client")>("../../../src/api/client");
  return { ...actual, api: { getDashboard: vi.fn() } };
});

import { api, ApiError } from "../../../src/api/client";
import { DashboardOverview } from "../../../src/pages/ControllerDashboard/DashboardOverview/DashboardOverview";

const getDashboardMock = vi.mocked(api.getDashboard);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardOverview", () => {
  it("renders the aggregate stats and per-day charts", async () => {
    getDashboardMock.mockResolvedValue({
      totalSubmitted: 10,
      totalEscalated: 3,
      totalFinalized: 8,
      autoApproved: { count: 5, usdAmount: 500 },
      humanApproved: { count: 3, usdAmount: 900 },
      rejected: 0,
      submittedByDay: { "2026-01-01": 4, "2026-01-02": 6 },
      finalizedByDay: { "2026-01-01": 8 },
    });
    renderWithTheme(<DashboardOverview />);

    await waitFor(() => expect(screen.getByText("10")).toBeInTheDocument());
    expect(screen.getByText("Auto-approved")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("shows placeholder text when there is no data yet", async () => {
    getDashboardMock.mockResolvedValue({
      totalSubmitted: 0,
      totalEscalated: 0,
      totalFinalized: 0,
      autoApproved: { count: 0, usdAmount: 0 },
      humanApproved: { count: 0, usdAmount: 0 },
      rejected: 0,
      submittedByDay: {},
      finalizedByDay: {},
    });
    renderWithTheme(<DashboardOverview />);

    await waitFor(() => expect(screen.getByText("No submissions yet.")).toBeInTheDocument());
    expect(screen.getByText("Nothing finalized yet.")).toBeInTheDocument();
  });

  it("shows an error message when the dashboard fails to load", async () => {
    getDashboardMock.mockRejectedValue(new ApiError(500, "Failed to load dashboard"));
    renderWithTheme(<DashboardOverview />);

    await waitFor(() => expect(screen.getByText("Failed to load dashboard")).toBeInTheDocument());
  });

  it("shows a generic error message for a network failure", async () => {
    getDashboardMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<DashboardOverview />);

    await waitFor(() => expect(screen.getByText("Could not reach audit-service.")).toBeInTheDocument());
  });
});
