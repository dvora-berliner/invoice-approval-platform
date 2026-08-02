import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import type { Role } from "../../src/auth/types";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return {
    ...actual,
    api: {
      register: vi.fn(),
      login: vi.fn(),
      submitInvoice: vi.fn(),
      getStatus: vi.fn(),
      supplementInvoice: vi.fn(),
      getMyInvoices: vi.fn().mockResolvedValue({ items: [] }),
      getAllInvoices: vi.fn().mockResolvedValue({ items: [] }),
      getApprovalQueue: vi.fn().mockResolvedValue({ items: [] }),
      getApproval: vi.fn(),
      decideApproval: vi.fn(),
      getDashboard: vi.fn().mockResolvedValue({
        totalSubmitted: 0,
        totalEscalated: 0,
        pendingHumanReview: 0,
        totalFinalized: 0,
        autoApproved: { count: 0, usdAmount: 0 },
        humanApproved: { count: 0, usdAmount: 0 },
        paymentFailed: { count: 0, usdAmount: 0 },
        autoRejected: 0,
        humanRejected: 0,
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
import { api, UNAUTHORIZED_EVENT } from "../../src/api/client";

const apiMock = vi.mocked(api);

function loginAs(role: Role) {
  localStorage.setItem(
    "approvalflow.session",
    JSON.stringify({ token: "test-token", username: "test-user", role }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("App - unauthenticated", () => {
  it("shows the login screen when there is no session", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the ApprovalFlow wordmark even before signing in", () => {
    const { container } = render(<App />);
    expect(container.querySelector("header h6")?.textContent).toBe("ApprovalFlow");
  });

  it("shows the tabbed console after a successful login", async () => {
    apiMock.login.mockResolvedValue({ token: "test-token", username: "alice", role: "submitter" });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Username/), "alice");
    await user.type(screen.getByLabelText(/Password/), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Submit an invoice" })).toBeInTheDocument();
    expect(screen.getByText("alice - submitter")).toBeInTheDocument();
  });
});

describe("App - authenticated (role-gated tabs)", () => {
  it("shows Submit, My invoices and Status tabs for a submitter, Submit by default", () => {
    loginAs("submitter");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Submit an invoice" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "My invoices" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("navigates to the Status screen", async () => {
    loginAs("submitter");
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByRole("heading", { name: "Check invoice status" })).toBeInTheDocument();
  });

  it("shows only Status and Approvals tabs for an approver", async () => {
    loginAs("approver");
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("tab", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "My invoices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Dashboard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Approvals" }));
    expect(screen.getByRole("heading", { name: "Approval queue" })).toBeInTheDocument();
  });

  it("shows every tab for an admin", async () => {
    loginAs("admin");
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("tab", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Approvals" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Submitted")).toBeInTheDocument());
  });

  it("signs out back to the login screen", async () => {
    loginAs("admin");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("approvalflow.session")).toBeNull();
  });

  it("bounces to the login screen when the token expires mid-session", async () => {
    loginAs("admin");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Submit an invoice" })).toBeInTheDocument();

    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
