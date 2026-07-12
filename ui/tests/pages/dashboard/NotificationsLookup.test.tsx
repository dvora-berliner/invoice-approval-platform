import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../../src/test/renderWithTheme";

vi.mock("../../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/client")>("../../../src/api/client");
  return { ...actual, api: { getNotifications: vi.fn() } };
});

import { api, ApiError } from "../../../src/api/client";
import { NotificationsLookup } from "../../../src/pages/ControllerDashboard/NotificationsLookup/NotificationsLookup";

const getNotificationsMock = vi.mocked(api.getNotifications);

beforeEach(() => {
  vi.clearAllMocks();
});

async function lookup(user: ReturnType<typeof userEvent.setup>, id = "track-1") {
  await user.type(screen.getByRole("textbox", { name: /Tracking id/ }), id);
  await user.click(screen.getByRole("button", { name: /Look up/ }));
}

describe("NotificationsLookup", () => {
  it("renders the latest notification and its history", async () => {
    const user = userEvent.setup();
    getNotificationsMock.mockResolvedValue({
      trackingId: "track-1",
      latest: { eventType: "DecisionFinalized", occurredAt: "2026-01-02T00:00:00.000Z", message: "Your invoice was approved and payment was completed." },
      history: [
        { eventType: "DecisionFinalized", occurredAt: "2026-01-02T00:00:00.000Z", message: "Your invoice was approved and payment was completed." },
        { eventType: "InfoRequested", occurredAt: "2026-01-01T00:00:00.000Z", message: "An approver requested more information: need receipt" },
      ],
    });
    renderWithTheme(<NotificationsLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Latest")).toBeInTheDocument());
    expect(screen.getAllByText(/approved and payment was completed/).length).toBeGreaterThan(0);
    expect(screen.getByText(/need receipt/)).toBeInTheDocument();
  });

  it("does not render a history list when there is only one entry", async () => {
    const user = userEvent.setup();
    getNotificationsMock.mockResolvedValue({
      trackingId: "track-1",
      latest: { eventType: "InfoRequested", occurredAt: "2026-01-01T00:00:00.000Z", message: "An approver requested more information." },
      history: [{ eventType: "InfoRequested", occurredAt: "2026-01-01T00:00:00.000Z", message: "An approver requested more information." }],
    });
    renderWithTheme(<NotificationsLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Latest")).toBeInTheDocument());
    expect(screen.getAllByText("An approver requested more information.")).toHaveLength(1);
  });

  it("shows an error message when the lookup fails", async () => {
    const user = userEvent.setup();
    getNotificationsMock.mockRejectedValue(new ApiError(404, "No notifications found for this trackingId"));
    renderWithTheme(<NotificationsLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("No notifications found for this trackingId")).toBeInTheDocument());
  });

  it("shows a generic error message for a network failure", async () => {
    const user = userEvent.setup();
    getNotificationsMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<NotificationsLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Could not reach audit-service.")).toBeInTheDocument());
  });

  it("does not look up an empty trackingId", async () => {
    const user = userEvent.setup();
    renderWithTheme(<NotificationsLookup />);

    await user.click(screen.getByRole("button", { name: /Look up/ }));

    expect(getNotificationsMock).not.toHaveBeenCalled();
  });
});
