import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "../../src/test/renderWithTheme";
import { BarSeries } from "../../src/components/BarRow/BarRow";

describe("BarSeries", () => {
  it("renders a row per data point with its label and value", () => {
    renderWithTheme(
      <BarSeries
        data={[
          ["2026-01-01", 5],
          ["2026-01-02", 10],
        ]}
      />,
    );
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("2026-01-02")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("renders a zero-value row without a visible bar width", () => {
    renderWithTheme(<BarSeries data={[["2026-01-01", 0]]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders nothing for an empty series", () => {
    const { container } = renderWithTheme(<BarSeries data={[]} />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
