import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "../../src/test/renderWithTheme";
import { StatCard } from "../../src/components/StatCard/StatCard";

describe("StatCard", () => {
  it("renders the label and value", () => {
    renderWithTheme(<StatCard label="Submitted" value={42} />);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders the sub line when given", () => {
    renderWithTheme(<StatCard label="Auto-approved" value={5} sub="$1,000.00" />);
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("omits the sub line when not given", () => {
    renderWithTheme(<StatCard label="Rejected" value={0} />);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
