import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StreakFlame, StreakWidget } from "./StreakWidget";

// jsdom has no ResizeObserver, which Radix's tooltip positioning (PopperContent) needs — same
// minimal stub as FeaturedGoalCard.test.tsx.
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const base = {
  level: 3,
  countWindow: 12,
  bodyweight: 82.5,
  workoutsWeek: 3,
  volumeWeekKg: 6200,
};

describe("StreakWidget", () => {
  it("renders the 4-week count and all three stats", () => {
    render(<StreakWidget {...base} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("workouts in the last 4 weeks")).toBeInTheDocument();
    expect(screen.getByText("82.5 kg")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("6.2 t")).toBeInTheDocument();
  });

  it("renders the bodyweight as a button with a gear icon when editable", async () => {
    const user = userEvent.setup();
    const onEditWeight = vi.fn();
    render(<StreakWidget {...base} onEditWeight={onEditWeight} />);
    await user.click(screen.getByRole("button", { name: /82\.5 kg/ }));
    expect(onEditWeight).toHaveBeenCalledTimes(1);
  });

  it("renders bodyweight as plain text with no edit button when not editable (demo)", () => {
    render(<StreakWidget {...base} />);
    // The flame's level-tooltip trigger is always a button; what must NOT be a button here is
    // the bodyweight value itself (no gear, no edit affordance in demo).
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Level 3 of 6");
  });

  it("shows the level tooltip on tap (0-6 scale is otherwise invisible)", async () => {
    const user = userEvent.setup();
    render(<StreakWidget {...base} />);
    await user.click(screen.getByRole("button", { name: "Level 3 of 6" }));
    // Radix renders the open tooltip's text in the floating content (plus the a11y label).
    expect((await screen.findAllByText("Level 3 of 6")).length).toBeGreaterThan(0);
  });

  it("shows a placeholder dot when bodyweight is unknown", () => {
    render(<StreakWidget {...base} bodyweight={null} />);
    expect(screen.getByText("·")).toBeInTheDocument();
  });
});

describe("StreakFlame (layered candle)", () => {
  it("renders an unlit outline at heat 0", () => {
    const { container } = render(<StreakFlame level={0} />);
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("none");
    expect(container.querySelectorAll("[data-flame-layer]")).toHaveLength(0);
  });

  it("stacks four teardrop layers once lit, each breathing on its own period", () => {
    const { container } = render(<StreakFlame level={3} heat={0.6} />);
    const layers = Array.from(container.querySelectorAll("[data-flame-layer]")) as HTMLElement[];
    expect(layers).toHaveLength(4);
    const durations = layers.map((l) => l.style.animationDuration);
    expect(new Set(durations).size).toBe(4);
    layers.forEach((l) => expect(l.className).toContain("animate-flame-drop"));
  });

  it("burns livelier the hotter it is (periods shrink with heat)", () => {
    const outerPeriod = (heat: number) => {
      const { container } = render(<StreakFlame level={3} heat={heat} />);
      const layer = container.querySelector("[data-flame-layer='0']") as HTMLElement;
      return parseFloat(layer.style.animationDuration);
    };
    expect(outerPeriod(0.9)).toBeLessThan(outerPeriod(0.3));
  });

  it("grows continuously with heat — mid heat lands between the extremes", () => {
    const width = (heat: number) => {
      const { container } = render(<StreakFlame level={3} heat={heat} />);
      return parseFloat((container.firstChild as HTMLElement).style.width);
    };
    const mid = width(0.5);
    expect(mid).toBeGreaterThan(width(0.2));
    expect(mid).toBeLessThan(width(0.9));
  });
});

describe("Ring30 bezel", () => {
  it("renders one tick per day, lit ticks in accent", () => {
    const days = Array.from({ length: 30 }, (_, i) => i % 2 === 0);
    const { container } = render(<StreakWidget {...base} daysWindow={days} />);
    const ticks = container.querySelectorAll("line");
    expect(ticks).toHaveLength(30);
    const lit = Array.from(ticks).filter((l) => l.getAttribute("stroke") === "var(--accent)");
    expect(lit).toHaveLength(15);
  });

  it("renders no bezel when daysWindow is absent", () => {
    const { container } = render(<StreakWidget {...base} />);
    expect(container.querySelectorAll("line")).toHaveLength(0);
  });
});
