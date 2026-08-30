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

  it("stacks four teardrop layers at full heat, each breathing on its own period", () => {
    const { container } = render(<StreakFlame level={6} heat={1} />);
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

// --- 2026-08-29: the bezel explains the fire instead of contradicting it -------------------
// The flame became a fuel gauge with no window, so a bare count of lit ticks now argues AGAINST
// the level (four ticks can be a full fire, eighteen can be a dying one). Two things carry the
// explanation instead: lit ticks fade with age, and the stretch since the last session is drawn
// as one cold arc — the only quantity the level actually responds to.

describe("bezel after the fuel-gauge rework", () => {
  const ring = (days: boolean[]) => render(<StreakWidget {...base} daysWindow={days} />).container;

  it("fades lit ticks with age, so an old session visibly warms less than a recent one", () => {
    const days = Array.from({ length: 28 }, () => true);
    const lit = Array.from(ring(days).querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke") === "var(--accent)",
    );
    const opacity = (i: number) => Number(lit[i].getAttribute("opacity"));
    expect(opacity(27)).toBe(1); // today
    expect(opacity(27 - 10)).toBeLessThan(1); // a week and a half ago
    expect(opacity(0)).toBeLessThan(opacity(27 - 10)); // four weeks ago, nearly spent
  });

  it("draws one cold arc covering the days since the last session", () => {
    const idle = Array.from({ length: 28 }, (_, i) => i < 20); // last session 8 days ago
    const arcs = ring(idle).querySelectorAll("path");
    expect(arcs).toHaveLength(1);
    expect(arcs[0].getAttribute("stroke")).not.toBe("var(--accent)");
  });

  it("draws no cold arc at all when the user trained today", () => {
    const current = Array.from({ length: 28 }, (_, i) => i % 3 === 0 || i === 27);
    expect(ring(current).querySelectorAll("path")).toHaveLength(0);
  });

  it("goes fully cold for a window with no training in it", () => {
    const none = Array.from({ length: 28 }, () => false);
    const c = ring(none);
    expect(c.querySelectorAll("path")).toHaveLength(1);
    expect(
      Array.from(c.querySelectorAll("line")).filter(
        (l) => l.getAttribute("stroke") === "var(--accent)",
      ),
    ).toHaveLength(0);
  });
});

describe("the flame ramp actually separates the levels", () => {
  // Reworked 2026-08-30. The owner reported his level-4 flame "looks like a full 6" and he was
  // right: the old ramp moved size and essentially nothing else (mid colour frozen across five of
  // seven anchors, constant layer proportions, a near-white core at every level), so the top half
  // of the scale was one drawing 4-6px apart. These assertions pin the channels that fixed it.
  const flame = (heat: number) => {
    const { container } = render(<StreakFlame level={6} heat={heat} />);
    const span = container.querySelector("span") as HTMLElement;
    return {
      size: parseFloat(span.style.height),
      layers: container.querySelectorAll("[data-flame-layer]").length,
      body: container.querySelector("[data-flame-layer='0']") as HTMLElement,
    };
  };

  it("maps heat onto seven anchors, ending on the seventh at full heat", () => {
    expect(flame(6 / 7).size).toBeCloseTo(54, 1);
    expect(flame(1).size).toBeCloseTo(57, 1);
  });

  it("keeps growing inside the top band instead of flattening", () => {
    expect(flame(1).size).toBeGreaterThan(flame(0.93).size);
    expect(flame(0.93).size).toBeGreaterThan(flame(6 / 7).size);
  });

  it("draws FEWER teardrops when the fire is low — the structural channel", () => {
    // Size alone cannot carry the scale on a 30px object. A dying fire is a shapeless glow; a
    // full one has an envelope, a body, an inner cone and a white-hot centre.
    expect(flame(0.15).layers).toBe(2);
    expect(flame(0.5).layers).toBe(3);
    expect(flame(1).layers).toBe(4);
  });

  it("scales the glow's ALPHA with heat, not just its blur radius", () => {
    // It used to be a hardcoded 0.27 at every level, so the one channel that reads at a glance on
    // a dark card was identical for a dying fire and a roaring one.
    const alpha = (h: number) => {
      const shadow = flame(h).body.style.boxShadow;
      const rgba = shadow.match(/rgba\([^)]*?([\d.]+)\s*\)/);
      if (rgba) return parseFloat(rgba[1]);
      const hex = shadow.match(/#[0-9a-f]{6}([0-9a-f]{2})/i);
      return hex ? parseInt(hex[1], 16) / 255 : NaN;
    };
    const [low, mid, high] = [alpha(0.15), alpha(0.5), alpha(1)];
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high - low).toBeGreaterThan(0.4);
  });

  it("has no bright core at the bottom of the scale", () => {
    // A near-white centre at level 1 is what made a nearly-dead fire read as a cheerful little
    // one. At low heat the innermost drawn layer must not be lighter than the outer body.
    const lum = (c: string) => {
      const m = c.match(/\d+/g)!.map(Number);
      return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    };
    const low = flame(0.15);
    const inner = low.body.parentElement!.querySelectorAll("[data-flame-layer]");
    const last = inner[inner.length - 1] as HTMLElement;
    expect(lum(last.style.backgroundColor)).toBeLessThan(
      lum(flame(1).body.style.backgroundColor) + 60,
    );
  });
});

describe("the tooltip explains the number, not just restates it", () => {
  it("carries a plain-language hint under the level line", async () => {
    render(<StreakWidget {...base} />);
    await userEvent.click(screen.getByRole("button", { name: /3/ }));
    const tip = await screen.findByRole("status");
    // Two lines: the level, and the one sentence that says what makes it move.
    expect(tip.textContent).toMatch(/3/);
    expect(tip.textContent!.length).toBeGreaterThan(40);
    expect(tip.className).not.toMatch(/whitespace-nowrap/);
  });
});
