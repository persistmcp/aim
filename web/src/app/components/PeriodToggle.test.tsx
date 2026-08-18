import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodToggle } from "./PeriodToggle";

describe("PeriodToggle", () => {
  it("marks the active option aria-pressed and the rest not", () => {
    render(<PeriodToggle options={["week", "month"]} value="week" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "month" })).toHaveAttribute("aria-pressed", "false");
  });

  // F-TOGGLE-1
  it("calls onChange with the option's value, not its label", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PeriodToggle
        options={[
          { value: "w", label: "Неделя" },
          { value: "m", label: "Месяц" },
        ]}
        value="w"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Месяц" }));
    expect(onChange).toHaveBeenCalledWith("m");
  });

  // The four period options used to wrap onto a second row inside a card header, which read as
  // two separate controls. Nothing in jsdom measures layout, so guard the two class-level
  // decisions that prevent it: the group never wraps, and in `fill` mode the segments share the
  // row instead of sizing to their labels.
  it("never wraps its segments onto a second row", () => {
    render(<PeriodToggle options={["1M", "3M", "6M", "Year"]} value="3M" onChange={() => {}} />);
    expect(screen.getByRole("group").className).not.toMatch(/flex-wrap/);
  });

  it("fill mode stretches the group and gives the active segment a larger share", () => {
    render(
      <PeriodToggle fill options={["1M", "3M", "6M", "Year"]} value="3M" onChange={() => {}} />,
    );
    expect(screen.getByRole("group").className).toMatch(/w-full/);
    expect(screen.getByRole("button", { name: "3M" }).className).toMatch(/flex-\[1\.4\]/);
    expect(screen.getByRole("button", { name: "1M" }).className).toMatch(/flex-1/);
  });

  it("renders no options without crashing", () => {
    render(<PeriodToggle options={[]} value="" onChange={() => {}} />);
    expect(screen.getByRole("group")).toBeEmptyDOMElement();
  });
});
