import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../../src/test/renderWithTheme";

vi.mock("../../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/client")>("../../../src/api/client");
  return { ...actual, api: { getAllInvoices: vi.fn() } };
});

import { api, ApiError } from "../../../src/api/client";
import { AllInvoices } from "../../../src/pages/ControllerDashboard/AllInvoices/AllInvoices";
import type { InvoiceRecord } from "../../../src/api/types";

const getAllInvoicesMock = vi.mocked(api.getAllInvoices);

const item: InvoiceRecord = {
  trackingId: "track-1",
  prettyId: "INV-2026-0001",
  submittedByUsername: "alice",
  vendor: "Acme",
  invoiceNumber: "INV-1",
  total: 100,
  currency: "USD",
  status: "pending",
  submittedAt: "2026-01-01T00:00:00.000Z",
  correlationId: "corr-1",
  message: "Your invoice was received and is awaiting review.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AllInvoices", () => {
  it("shows an empty state when nothing has been submitted", async () => {
    getAllInvoicesMock.mockResolvedValue({ items: [] });
    renderWithTheme(<AllInvoices />);

    await waitFor(() => expect(screen.getByText("No invoices submitted yet.")).toBeInTheDocument());
  });

  it("renders every invoice with its submitter", async () => {
    getAllInvoicesMock.mockResolvedValue({ items: [item] });
    renderWithTheme(<AllInvoices />);

    await waitFor(() => expect(screen.getByText("INV-2026-0001")).toBeInTheDocument());
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("copies the pretty id to the clipboard", async () => {
    const user = userEvent.setup();
    getAllInvoicesMock.mockResolvedValue({ items: [item] });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    renderWithTheme(<AllInvoices />);

    await waitFor(() => expect(screen.getByText("INV-2026-0001")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "copy invoice id" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("INV-2026-0001");
  });

  it("shows an error message when the list fails to load", async () => {
    getAllInvoicesMock.mockRejectedValue(new ApiError(500, "Failed to load"));
    renderWithTheme(<AllInvoices />);

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
  });
});
