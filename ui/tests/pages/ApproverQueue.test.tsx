import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../../src/test/renderWithTheme";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return { ...actual, api: { getApprovalQueue: vi.fn(), decideApproval: vi.fn() } };
});

import { api, ApiError } from "../../src/api/client";
import { ApproverQueue } from "../../src/pages/ApproverQueue/ApproverQueue";
import type { ApprovalQueueItem } from "../../src/api/types";

const getApprovalQueueMock = vi.mocked(api.getApprovalQueue);
const decideApprovalMock = vi.mocked(api.decideApproval);

const item: ApprovalQueueItem = {
  trackingId: "track-1",
  correlationId: "corr-1",
  invoice: { trackingId: "track-1", vendor: "Acme", invoiceNumber: "INV-1", total: 300, currency: "USD", category: "saas" },
  decision: {
    route: "human_review",
    usdAmount: 300,
    confidence: 0.6,
    citedRules: ["SAAS-01"],
    reason: "over cap",
    agentReasoning: "The amount exceeds the monthly SaaS cap.",
    appliedCeiling: 250,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const secondItem: ApprovalQueueItem = {
  ...item,
  trackingId: "track-2",
  invoice: { ...item.invoice, trackingId: "track-2", vendor: "Beta Corp" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ApproverQueue", () => {
  it("shows an empty state when the queue has nothing pending", async () => {
    getApprovalQueueMock.mockResolvedValue({ items: [] });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/Queue is empty/)).toBeInTheDocument());
  });

  it("loads and displays the first item's details automatically", async () => {
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds the monthly SaaS cap/)).toBeInTheDocument());
    expect(screen.getByText("SAAS-01")).toBeInTheDocument();
  });

  it("shows an error message when the queue fails to load", async () => {
    getApprovalQueueMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText("Could not reach workflow-service.")).toBeInTheDocument());
  });

  it("shows the server's error message when the queue fails to load with an ApiError", async () => {
    getApprovalQueueMock.mockRejectedValue(new ApiError(500, "workflow-service is down for maintenance"));
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText("workflow-service is down for maintenance")).toBeInTheDocument());
  });

  it("shows a dash for a missing category or department", async () => {
    getApprovalQueueMock.mockResolvedValue({
      items: [{ ...item, invoice: { ...item.invoice, category: undefined, department: undefined } }],
    });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText("Category")).toBeInTheDocument());
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("switches the detail panel when a different item is selected", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item, secondItem] });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    await user.click(screen.getByText("Beta Corp"));

    await waitFor(() => {
      const headings = screen.getAllByText(/Beta Corp/);
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it("requires an approver id before recording a decision", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("Enter your approver id first.")).toBeInTheDocument());
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("records an approve decision and reloads the queue", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    decideApprovalMock.mockResolvedValue({ trackingId: "track-1", action: "approve" });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: /Approver id/ }), "approver-1");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("Recorded: approve.")).toBeInTheDocument());
    expect(decideApprovalMock).toHaveBeenCalledWith("track-1", { approverId: "approver-1", action: "approve", reason: undefined });
    expect(getApprovalQueueMock).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when recording the decision fails", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    decideApprovalMock.mockRejectedValue(new ApiError(409, "This approval has already been decided"));
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: /Approver id/ }), "approver-1");
    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(screen.getByText("This approval has already been decided")).toBeInTheDocument());
  });

  it("shows a generic error message when recording the decision fails with a network error", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    decideApprovalMock.mockRejectedValue(new Error("network down"));
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: /Approver id/ }), "approver-1");
    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(screen.getByText("Could not record the decision.")).toBeInTheDocument());
  });

  it("includes an optional reason in the decision request", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    decideApprovalMock.mockResolvedValue({ trackingId: "track-1", action: "request_info" });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());

    await user.type(screen.getByRole("textbox", { name: /Approver id/ }), "approver-1");
    await user.type(screen.getByRole("textbox", { name: /Reason \/ note/ }), "need receipt");
    await user.click(screen.getByRole("button", { name: "Request info" }));

    await waitFor(() =>
      expect(decideApprovalMock).toHaveBeenCalledWith("track-1", {
        approverId: "approver-1",
        action: "request_info",
        reason: "need receipt",
      }),
    );
  });

  it("reloads the queue when Refresh is clicked", async () => {
    const user = userEvent.setup();
    getApprovalQueueMock.mockResolvedValue({ items: [item] });
    renderWithTheme(<ApproverQueue />);

    await waitFor(() => expect(screen.getByText(/The amount exceeds/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Refresh/ }));

    await waitFor(() => expect(getApprovalQueueMock).toHaveBeenCalledTimes(2));
  });
});
