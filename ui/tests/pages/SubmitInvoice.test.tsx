import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../src/test/renderWithTheme";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return { ...actual, api: { submitInvoice: vi.fn() } };
});

import { api, ApiError } from "../../src/api/client";
import { SubmitInvoice } from "../../src/pages/SubmitInvoice/SubmitInvoice";

const submitInvoiceMock = vi.mocked(api.submitInvoice);

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: /Vendor/ }), "Acme");
  await user.type(screen.getByRole("textbox", { name: /Invoice number/ }), "INV-1");
  await user.type(screen.getByRole("spinbutton", { name: /Total/ }), "100");
}

describe("SubmitInvoice", () => {
  it("submits the form and shows the returned trackingId", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123" });
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText("track-123")).toBeInTheDocument());
    expect(submitInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: "Acme", invoiceNumber: "INV-1", total: 100 }),
    );
  });

  it("shows the pretty id as a reference alongside the tracking id", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123", prettyId: "INV-2026-0001" });
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText("INV-2026-0001")).toBeInTheDocument());
  });

  it("shows a duplicate warning without clearing the form", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({
      trackingId: "track-123",
      duplicateSubmission: true,
      message: "This invoice was already submitted (current status: pending).",
    });
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText(/current status: pending/)).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: /Vendor/ })).toHaveValue("Acme");
  });

  it("shows field-level validation errors from the API", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockRejectedValue(
      new ApiError(400, "Invalid invoice submission", { fieldErrors: { vendor: ["vendor is required"] } }),
    );
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText("Invalid invoice submission")).toBeInTheDocument());
    expect(screen.getByText("vendor is required")).toBeInTheDocument();
  });

  it("shows an API error with no field-level details", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockRejectedValue(new ApiError(500, "Failed to submit invoice"));
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText("Failed to submit invoice")).toBeInTheDocument());
  });

  it("shows a generic error message for a network failure", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(screen.getByText("Could not reach the submission service.")).toBeInTheDocument());
  });

  it("adds and removes a line item row", async () => {
    const user = userEvent.setup();
    const { container } = renderWithTheme(<SubmitInvoice />);

    await user.click(screen.getByRole("button", { name: /Add line/ }));
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();

    const removeButton = container.querySelector('[class*="lineItemRemove"]') as HTMLButtonElement;
    await user.click(removeButton);

    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
  });

  it("includes a filled line item in the submitted payload", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123" });
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Add line/ }));
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Widget");

    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(submitInvoiceMock).toHaveBeenCalled());
    const payload = submitInvoiceMock.mock.calls[0][0];
    expect(payload.lineItems).toEqual([{ description: "Widget", quantity: 1, unitPrice: 0 }]);
  });

  it("only patches the edited row when multiple line items are present", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123" });
    renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Add line/ }));
    await user.click(screen.getByRole("button", { name: /Add line/ }));
    const descriptions = screen.getAllByRole("textbox", { name: "Description" });
    await user.type(descriptions[0], "First");
    await user.type(descriptions[1], "Second");

    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(submitInvoiceMock).toHaveBeenCalled());
    const payload = submitInvoiceMock.mock.calls[0][0];
    expect(payload.lineItems).toEqual([
      { description: "First", quantity: 1, unitPrice: 0 },
      { description: "Second", quantity: 1, unitPrice: 0 },
    ]);
  });

  it("omits the date when the date field is cleared", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123" });
    const { container } = renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "" } });

    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));

    await waitFor(() => expect(submitInvoiceMock).toHaveBeenCalled());
    const payload = submitInvoiceMock.mock.calls[0][0];
    expect(payload.date).toBeUndefined();
  });

  it("fills every optional field, changes every select, and copies the tracking id", async () => {
    const user = userEvent.setup();
    submitInvoiceMock.mockResolvedValue({ trackingId: "track-123" });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const { container } = renderWithTheme(<SubmitInvoice />);

    await fillRequiredFields(user);

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-15" } });

    await user.click(screen.getByRole("combobox", { name: /Currency/ }));
    await user.click(await screen.findByRole("option", { name: "EUR" }));

    await user.click(screen.getByRole("combobox", { name: /Category/ }));
    await user.click(await screen.findByRole("option", { name: "meals" }));

    await user.click(screen.getByRole("combobox", { name: /Department/ }));
    await user.click(await screen.findByRole("option", { name: "sales-2026Q2" }));

    await user.type(screen.getByRole("textbox", { name: /Submitter email/ }), "a@b.com");
    await user.type(screen.getByRole("spinbutton", { name: /Attendees/ }), "4");
    await user.type(screen.getByRole("spinbutton", { name: /Tax amount/ }), "5");
    await user.type(screen.getByRole("textbox", { name: /Notes/ }), "urgent");
    await user.click(screen.getByRole("checkbox", { name: /Receipt is attached/ }));

    await user.click(screen.getByRole("button", { name: /Add line/ }));
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Widget");
    await user.clear(screen.getByRole("spinbutton", { name: "Qty" }));
    await user.type(screen.getByRole("spinbutton", { name: "Qty" }), "3");
    await user.type(screen.getByRole("spinbutton", { name: "Unit price" }), "10");

    await user.click(screen.getByRole("button", { name: /Submit invoice/ }));
    await waitFor(() => expect(screen.getByText("track-123")).toBeInTheDocument());

    const payload = submitInvoiceMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      currency: "EUR",
      category: "meals",
      department: "sales-2026Q2",
      submitter: "a@b.com",
      date: "2026-05-15",
      attendees: 4,
      taxAmount: 5,
      notes: "urgent",
      receiptPresent: false,
      lineItems: [{ description: "Widget", quantity: 3, unitPrice: 10 }],
    });

    await user.click(screen.getByRole("button", { name: "copy invoice id" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("track-123");
  });
});
