import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "../../src/test/renderWithTheme";
import { StatusChip } from "../../src/components/StatusChip/StatusChip";

describe("StatusChip", () => {
  it("renders a humanized label by default, replacing underscores with spaces", () => {
    renderWithTheme(<StatusChip value="awaiting_approval" />);
    expect(screen.getByText("awaiting approval")).toBeInTheDocument();
  });

  it("renders a custom label when given", () => {
    renderWithTheme(<StatusChip value="paid" label="Paid in full" />);
    expect(screen.getByText("Paid in full")).toBeInTheDocument();
  });

  it.each(["pending", "awaiting_approval", "paid", "auto_approve", "approve", "rejected", "reject", "payment_failed", "human_review", "request_info", "some_unknown_status"])(
    "renders without error for value=%s",
    (value) => {
      renderWithTheme(<StatusChip value={value} />);
    },
  );
});
