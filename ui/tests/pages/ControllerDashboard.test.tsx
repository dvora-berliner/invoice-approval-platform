import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../src/test/renderWithTheme";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return {
    ...actual,
    api: {
      getDashboard: vi.fn(),
      getCeilingProof: vi.fn(),
      getTrail: vi.fn(),
      getNotifications: vi.fn(),
    },
  };
});

import { api } from "../../src/api/client";
import { ControllerDashboard } from "../../src/pages/ControllerDashboard/ControllerDashboard";

const getDashboardMock = vi.mocked(api.getDashboard);
const getCeilingProofMock = vi.mocked(api.getCeilingProof);

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardMock.mockResolvedValue({
    totalSubmitted: 1,
    totalEscalated: 0,
    totalFinalized: 1,
    autoApproved: { count: 1, usdAmount: 100 },
    humanApproved: { count: 0, usdAmount: 0 },
    rejected: 0,
    submittedByDay: {},
    finalizedByDay: {},
  });
  getCeilingProofMock.mockResolvedValue({ currentCeiling: 250, itemsChecked: 1, violations: [], passed: true });
});

describe("ControllerDashboard", () => {
  it("shows the overview panel by default", async () => {
    renderWithTheme(<ControllerDashboard />);
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalled());
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  it("switches to the ceiling proof panel", async () => {
    const user = userEvent.setup();
    renderWithTheme(<ControllerDashboard />);
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Ceiling proof" }));

    await waitFor(() => expect(getCeilingProofMock).toHaveBeenCalled());
    expect(await screen.findByText("Current ceiling")).toBeInTheDocument();
  });

  it("switches to the decision trail panel", async () => {
    const user = userEvent.setup();
    renderWithTheme(<ControllerDashboard />);
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Decision trail" }));

    expect(screen.getByRole("textbox", { name: /Tracking id or correlation id/ })).toBeInTheDocument();
  });

  it("switches to the notifications panel", async () => {
    const user = userEvent.setup();
    renderWithTheme(<ControllerDashboard />);
    await waitFor(() => expect(getDashboardMock).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Notifications" }));

    expect(screen.getByRole("textbox", { name: /Tracking id/ })).toBeInTheDocument();
  });
});
