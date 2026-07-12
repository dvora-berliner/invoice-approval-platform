import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return {
    ...actual,
    api: {
      submitInvoice: vi.fn(),
      getStatus: vi.fn(),
      supplementInvoice: vi.fn(),
      getApprovalQueue: vi.fn().mockResolvedValue({ items: [] }),
      getApproval: vi.fn(),
      decideApproval: vi.fn(),
      getDashboard: vi.fn().mockResolvedValue({
        totalSubmitted: 0,
        totalEscalated: 0,
        totalFinalized: 0,
        autoApproved: { count: 0, usdAmount: 0 },
        humanApproved: { count: 0, usdAmount: 0 },
        rejected: 0,
        submittedByDay: {},
        finalizedByDay: {},
      }),
      getCeilingProof: vi.fn(),
      getTrail: vi.fn(),
      getNotifications: vi.fn(),
    },
  };
});

import App from "../../src/App/App";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("App", () => {
  it("shows the Submit screen by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Submit an invoice" })).toBeInTheDocument();
  });

  it("navigates to the Status screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByRole("heading", { name: "Check invoice status" })).toBeInTheDocument();
  });

  it("navigates to the Approvals screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Approvals" }));
    expect(screen.getByRole("heading", { name: "Approval queue" })).toBeInTheDocument();
  });

  it("navigates to the Dashboard screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Submitted")).toBeInTheDocument());
  });

  it("renders the ApprovalFlow wordmark", () => {
    const { container } = render(<App />);
    expect(container.querySelector("header h6")?.textContent).toBe("ApprovalFlow");
  });
});
