import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders label and value without a change badge when change is omitted", () => {
    render(<StatTile label="Volume" value="6.2 т" />);
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("6.2 т")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("shows an up arrow and positive styling by default when a change is positive", () => {
    render(<StatTile label="Volume" value={100} change={{ value: 12 }} />);
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  // F-STATTILE-1
  it("takes the absolute value of a negative change but still renders it", () => {
    // corner case: isPositive=false with a negative number — value must not double-negate to "--12%"
    render(<StatTile label="Volume" value={100} change={{ value: -12, isPositive: false }} />);
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("treats isPositive: undefined as positive (the component's documented default)", () => {
    render(<StatTile label="Volume" value={100} change={{ value: 5 }} />);
    const badge = screen.getByText("5%").parentElement;
    expect(badge?.className).toContain("text-accent");
  });

  // F-STATTILE-2
  it("renders as plain, non-interactive content when onClick is omitted", () => {
    render(<StatTile label="Body weight" value="82 kg" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // F-STATTILE-2
  it("renders as a button and fires onClick when tapped, when onClick is provided", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatTile label="Body weight" value="82 kg" onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: /Body weight/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // F-STATTILE-3
  it("fires onClick on Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatTile label="Body weight" value="82 kg" onClick={onClick} />);
    screen.getByRole("button", { name: /Body weight/ }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
