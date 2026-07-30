import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../../src/theme";
import { AuthProvider } from "../../src/auth/AuthContext";
import { Login } from "../../src/pages/Login/Login";

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>("../../src/api/client");
  return { ...actual, api: { login: vi.fn(), register: vi.fn() } };
});

import { api, ApiError } from "../../src/api/client";

const apiMock = vi.mocked(api);

function renderLogin() {
  return render(
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Login", () => {
  it("defaults to sign-in mode without a role field", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
  });

  it("calls api.login and stores the session on success", async () => {
    apiMock.login.mockResolvedValue({ token: "t", username: "alice", role: "submitter" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Username/), "alice");
    await user.type(screen.getByLabelText(/Password/), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(apiMock.login).toHaveBeenCalledWith({ username: "alice", password: "correct-password" });
    expect(localStorage.getItem("approvalflow.session")).toEqual(
      JSON.stringify({ token: "t", username: "alice", role: "submitter" }),
    );
  });

  it("shows the server's error message when login fails", async () => {
    apiMock.login.mockRejectedValue(new ApiError(401, "Invalid username or password"));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Username/), "alice");
    await user.type(screen.getByLabelText(/Password/), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
  });

  it("shows a generic message when the server is unreachable", async () => {
    apiMock.login.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Username/), "alice");
    await user.type(screen.getByLabelText(/Password/), "whatever");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });

  it("switches to register mode, showing the role field, and registers a user", async () => {
    apiMock.register.mockResolvedValue({ token: "t", username: "bob", role: "approver" });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Create one" }));
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Username/), "bob");
    await user.type(screen.getByLabelText(/Password/), "longenoughpw1");
    await user.click(screen.getByLabelText(/Role/));
    await user.click(await screen.findByRole("option", { name: "approver" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(apiMock.register).toHaveBeenCalledWith({ username: "bob", password: "longenoughpw1", role: "approver" });
    expect(localStorage.getItem("approvalflow.session")).toEqual(
      JSON.stringify({ token: "t", username: "bob", role: "approver" }),
    );
  });

  it("blocks registration with a weak password before calling the API", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Create one" }));
    await user.type(screen.getByLabelText(/Username/), "bob");
    await user.type(screen.getByLabelText(/Password/), "onlyletters");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Password does not meet the requirements/)).toBeInTheDocument();
    expect(apiMock.register).not.toHaveBeenCalled();
  });

  it("switches back to sign-in mode and clears any prior error", async () => {
    apiMock.login.mockRejectedValue(new ApiError(401, "Invalid username or password"));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Username/), "alice");
    await user.type(screen.getByLabelText(/Password/), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create one" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Invalid username or password")).not.toBeInTheDocument();
  });
});
