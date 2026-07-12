import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../../src/test/renderWithTheme";

vi.mock("../../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/client")>("../../../src/api/client");
  return { ...actual, api: { getTrail: vi.fn() } };
});

import { api, ApiError } from "../../../src/api/client";
import { TrailLookup } from "../../../src/pages/ControllerDashboard/TrailLookup/TrailLookup";
import type { DecisionEventRow } from "../../../src/api/types";

const getTrailMock = vi.mocked(api.getTrail);

beforeEach(() => {
  vi.clearAllMocks();
});

async function lookup(user: ReturnType<typeof userEvent.setup>, id = "track-1") {
  await user.type(screen.getByRole("textbox", { name: /Tracking id or correlation id/ }), id);
  await user.click(screen.getByRole("button", { name: /Look up/ }));
}

describe("TrailLookup", () => {
  it("renders a timeline summarizing each event type", async () => {
    const user = userEvent.setup();
    const events: DecisionEventRow[] = [
      {
        id: 1,
        event_type: "InvoiceSubmitted",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { vendor: "Acme", invoiceNumber: "INV-1", total: 100, currency: "USD" },
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        event_type: "EscalationCreated",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { reason: "over cap" },
        occurred_at: "2026-01-01T01:00:00.000Z",
        received_at: "2026-01-01T01:00:00.000Z",
      },
      {
        id: 3,
        event_type: "InfoRequested",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { approverId: "a1", reason: "need receipt" },
        occurred_at: "2026-01-01T02:00:00.000Z",
        received_at: "2026-01-01T02:00:00.000Z",
      },
      {
        id: 4,
        event_type: "InvoiceSupplemented",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: {},
        occurred_at: "2026-01-01T03:00:00.000Z",
        received_at: "2026-01-01T03:00:00.000Z",
      },
      {
        id: 5,
        event_type: "DecisionFinalized",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { outcome: "paid", reason: "payment executed" },
        occurred_at: "2026-01-01T04:00:00.000Z",
        received_at: "2026-01-01T04:00:00.000Z",
      },
      {
        id: 6,
        event_type: "SomeFutureEventType",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { a: 1 },
        occurred_at: "2026-01-01T05:00:00.000Z",
        received_at: "2026-01-01T05:00:00.000Z",
      },
    ];
    getTrailMock.mockResolvedValue({ id: "track-1", events });
    renderWithTheme(<TrailLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText(/Acme · INV-1/)).toBeInTheDocument());
    expect(screen.getByText(/Escalated — over cap/)).toBeInTheDocument();
    expect(screen.getByText(/Info requested by a1: need receipt/)).toBeInTheDocument();
    expect(screen.getByText("Submitter provided additional information")).toBeInTheDocument();
    expect(screen.getByText(/paid — payment executed/)).toBeInTheDocument();
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no events", async () => {
    const user = userEvent.setup();
    getTrailMock.mockResolvedValue({ id: "missing", events: [] });
    renderWithTheme(<TrailLookup />);

    await lookup(user, "missing");

    await waitFor(() => expect(screen.getByText("No events recorded for this id.")).toBeInTheDocument());
  });

  it("shows an error message when the lookup fails", async () => {
    const user = userEvent.setup();
    getTrailMock.mockRejectedValue(new ApiError(404, "No decision trail found for this id"));
    renderWithTheme(<TrailLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("No decision trail found for this id")).toBeInTheDocument());
  });

  it("does not look up an empty id", async () => {
    const user = userEvent.setup();
    renderWithTheme(<TrailLookup />);

    await user.click(screen.getByRole("button", { name: /Look up/ }));

    expect(getTrailMock).not.toHaveBeenCalled();
  });

  it("shows a generic error message for a network failure", async () => {
    const user = userEvent.setup();
    getTrailMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<TrailLookup />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Could not reach audit-service.")).toBeInTheDocument());
  });

  it("falls back to placeholder text for events with sparse payloads", async () => {
    const user = userEvent.setup();
    const events: DecisionEventRow[] = [
      {
        id: 1,
        event_type: "InvoiceSubmitted",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: {},
        occurred_at: "2026-01-01T00:00:00.000Z",
        received_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        event_type: "DecisionFinalized",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: {},
        occurred_at: "2026-01-01T01:00:00.000Z",
        received_at: "2026-01-01T01:00:00.000Z",
      },
      {
        id: 3,
        event_type: "EscalationCreated",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: {},
        occurred_at: "2026-01-01T02:00:00.000Z",
        received_at: "2026-01-01T02:00:00.000Z",
      },
      {
        id: 4,
        event_type: "InfoRequested",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: {},
        occurred_at: "2026-01-01T03:00:00.000Z",
        received_at: "2026-01-01T03:00:00.000Z",
      },
      {
        id: 5,
        event_type: "InvoiceSubmitted",
        tracking_id: "track-1",
        correlation_id: "corr-1",
        payload: { vendor: "Acme", invoiceNumber: "INV-2", total: 250 },
        occurred_at: "2026-01-01T04:00:00.000Z",
        received_at: "2026-01-01T04:00:00.000Z",
      },
    ];
    getTrailMock.mockResolvedValue({ id: "track-1", events });
    const { container } = renderWithTheme(<TrailLookup />);

    await lookup(user);

    await waitFor(() => expect(container.textContent).toContain("— · — ·"));
    expect(container.textContent).toContain("Escalated —");
    expect(container.textContent).toContain("Info requested by approver");
    expect(container.textContent).toContain("Acme · INV-2 · $250.00");
  });
});
