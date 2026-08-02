import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../src/test/renderWithTheme";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return { ...actual, api: { getStatus: vi.fn(), supplementInvoice: vi.fn() } };
});

import { api, ApiError } from "../../src/api/client";
import { CheckStatus } from "../../src/pages/CheckStatus/CheckStatus";
import type { InvoiceRecord } from "../../src/api/types";

const getStatusMock = vi.mocked(api.getStatus);
const supplementInvoiceMock = vi.mocked(api.supplementInvoice);

const baseRecord: InvoiceRecord = {
  trackingId: "track-1",
  prettyId: "INV-2026-0001",
  vendor: "Acme",
  invoiceNumber: "INV-1",
  total: 100,
  currency: "USD",
  status: "awaiting_approval",
  submittedAt: "2026-01-01T00:00:00.000Z",
  correlationId: "corr-1",
  message: "Your invoice needs a human approver's decision.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function lookup(user: ReturnType<typeof userEvent.setup>, id = "track-1") {
  await user.type(screen.getByRole("textbox", { name: /Tracking id/ }), id);
  await user.click(screen.getByRole("button", { name: /Look up/ }));
}

describe("CheckStatus", () => {
  it("looks up and renders a record", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue(baseRecord);
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText(/Acme/)).toBeInTheDocument());
    expect(getStatusMock).toHaveBeenCalledWith("track-1");
    expect(screen.getByText(baseRecord.message)).toBeInTheDocument();
  });

  it("shows the reason when it differs from the message", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue({ ...baseRecord, reason: "Escalated for manual review" });
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText(/Escalated for manual review/)).toBeInTheDocument());
  });

  it("shows an error message when the lookup fails", async () => {
    const user = userEvent.setup();
    getStatusMock.mockRejectedValue(new ApiError(404, "No invoice found for this trackingId"));
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("No invoice found for this trackingId")).toBeInTheDocument());
  });

  it("shows a generic error for a network failure", async () => {
    const user = userEvent.setup();
    getStatusMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Could not reach the submission service.")).toBeInTheDocument());
  });

  it("does not look up an empty trackingId", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CheckStatus />);

    await user.click(screen.getByRole("button", { name: /Look up/ }));

    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it("renders a Yes/No detail field for boolean values", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue({ ...baseRecord, receiptPresent: true });
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Receipt present")).toBeInTheDocument());
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("renders 'No' for a false boolean detail field", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue({ ...baseRecord, receiptPresent: false });
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText("Receipt present")).toBeInTheDocument());
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("falls back to a dash for a line item with no description", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue({
      ...baseRecord,
      lineItems: [{ description: "", quantity: 1, unitPrice: 10 }],
    });
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText(/— × 1/)).toBeInTheDocument());
  });

  it("renders line items when present", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue({
      ...baseRecord,
      lineItems: [{ description: "Widget", quantity: 2, unitPrice: 25 }],
    });
    renderWithTheme(<CheckStatus />);

    await lookup(user);

    await waitFor(() => expect(screen.getByText(/Widget × 2/)).toBeInTheDocument());
  });

  it("sends a supplement and refreshes the record", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValueOnce(baseRecord).mockResolvedValueOnce({ ...baseRecord, notes: "more info" });
    supplementInvoiceMock.mockResolvedValue({ trackingId: "track-1" });
    renderWithTheme(<CheckStatus />);

    await lookup(user);
    await waitFor(() => expect(screen.getByText(/Acme/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Provide additional information/ }));
    await user.type(screen.getByRole("textbox", { name: /What would you like to add/ }), "more info");
    await user.click(screen.getByRole("button", { name: /^Send$/ }));

    await waitFor(() => expect(screen.getByText(/re-evaluated/)).toBeInTheDocument());
    expect(supplementInvoiceMock).toHaveBeenCalledWith("track-1", { notes: "more info" });
    expect(getStatusMock).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when the supplement fails", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue(baseRecord);
    supplementInvoiceMock.mockRejectedValue(new ApiError(409, "Failed to supplement invoice due to concurrent updates"));
    renderWithTheme(<CheckStatus />);

    await lookup(user);
    await waitFor(() => expect(screen.getByText(/Acme/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Provide additional information/ }));
    await user.type(screen.getByRole("textbox", { name: /What would you like to add/ }), "more info");
    await user.click(screen.getByRole("button", { name: /^Send$/ }));

    await waitFor(() => expect(screen.getByText("Failed to supplement invoice due to concurrent updates")).toBeInTheDocument());
  });

  it("shows a generic error message when the supplement fails with a network error", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue(baseRecord);
    supplementInvoiceMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<CheckStatus />);

    await lookup(user);
    await waitFor(() => expect(screen.getByText(/Acme/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Provide additional information/ }));
    await user.type(screen.getByRole("textbox", { name: /What would you like to add/ }), "more info");
    await user.click(screen.getByRole("button", { name: /^Send$/ }));

    await waitFor(() => expect(screen.getByText("Could not send the supplement.")).toBeInTheDocument());
  });

  it("toggles the supplement form open and closed", async () => {
    const user = userEvent.setup();
    getStatusMock.mockResolvedValue(baseRecord);
    renderWithTheme(<CheckStatus />);

    await lookup(user);
    await waitFor(() => expect(screen.getByText(/Acme/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Provide additional information/ }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Provide additional information" })).toBeInTheDocument();
  });
});
