import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../src/test/renderWithTheme";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return { ...actual, api: { getMyInvoices: vi.fn() } };
});

import { api, ApiError } from "../../src/api/client";
import { MyInvoices } from "../../src/pages/MyInvoices/MyInvoices";
import type { InvoiceRecord } from "../../src/api/types";

const getMyInvoicesMock = vi.mocked(api.getMyInvoices);

const item: InvoiceRecord = {
  trackingId: "track-1",
  prettyId: "INV-2026-0001",
  vendor: "Acme",
  invoiceNumber: "INV-1",
  total: 100,
  currency: "USD",
  status: "pending",
  submittedAt: "2026-01-01T00:00:00.000Z",
  correlationId: "corr-1",
  message: "Your invoice was received and is awaiting review.",
};

const secondItem: InvoiceRecord = {
  ...item,
  trackingId: "track-2",
  prettyId: "INV-2026-0002",
  vendor: "Beta Corp",
  status: "paid",
  message: "Your invoice was approved and payment was completed.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MyInvoices", () => {
  it("shows an empty state when nothing has been submitted", async () => {
    getMyInvoicesMock.mockResolvedValue({ items: [] });
    renderWithTheme(<MyInvoices />);

    await waitFor(() => expect(screen.getByText(/haven't submitted/)).toBeInTheDocument());
  });

  it("lists submissions with their pretty id and lets you select one for detail", async () => {
    const user = userEvent.setup();
    getMyInvoicesMock.mockResolvedValue({ items: [item, secondItem] });
    renderWithTheme(<MyInvoices />);

    await waitFor(() => expect(screen.getByText("INV-2026-0001")).toBeInTheDocument());
    expect(screen.getByText("INV-2026-0002")).toBeInTheDocument();
    expect(screen.getByText(/Acme · INV-1/)).toBeInTheDocument();

    await user.click(screen.getByText("Beta Corp"));

    expect(screen.getByText(/Beta Corp · INV-1/)).toBeInTheDocument();
  });

  it("shows an error message when the list fails to load", async () => {
    getMyInvoicesMock.mockRejectedValue(new ApiError(500, "Failed to load your invoices"));
    renderWithTheme(<MyInvoices />);

    await waitFor(() => expect(screen.getByText("Failed to load your invoices")).toBeInTheDocument());
  });
});
