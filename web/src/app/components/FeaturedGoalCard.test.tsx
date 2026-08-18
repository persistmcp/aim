import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FeaturedGoalCard } from "./FeaturedGoalCard";
import type { FeaturedGoal } from "../data/workouts";
import { useConnection } from "../lib/queries";

vi.mock("../lib/queries", () => ({ useConnection: vi.fn() }));

// jsdom has no ResizeObserver, which recharts' ResponsiveContainer (used by the trend sparkline)
// needs — a minimal stub, scoped to this file, same pattern as other jsdom-gap polyfills in this
// suite (e.g. SettingsMenu.test.tsx's pointer-capture stubs).
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderCard(goal: FeaturedGoal | null) {
  vi.mocked(useConnection).mockReturnValue({ data: { connected: true } } as any);
  return render(
    <MemoryRouter>
      <FeaturedGoalCard goal={goal} />
    </MemoryRouter>,
  );
}

function goal(overrides: Partial<FeaturedGoal> = {}): FeaturedGoal {
  return {
    id: "g1",
    kind: "performance",
    title: "Bench 100kg",
    target: null,
    status: "active",
    review_date: null,
    current: null,
    progress_pct: null,
    goal_type: "milestone",
    progress: null,
    ...overrides,
  };
}

describe("FeaturedGoalCard", () => {
  it("renders nothing when there is no featured goal", () => {
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title-only, no bar, when progress is null", () => {
    renderCard(goal({ title: "Feel stronger overall" }));
    expect(screen.getByText("Feel stronger overall")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders a ring with the percentage label for a milestone (bar) progress type", () => {
    renderCard(goal({ progress: { type: "bar", pct: 77 } }));
    expect(screen.getByText("77%")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "77");
  });

  it("shows accumulated framing (current value, 'toward X' caption) below 50%", () => {
    renderCard(
      goal({
        current: 30,
        target: { value: 100 },
        progress: { type: "bar", pct: 30 },
      }),
    );
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("toward 100")).toBeInTheDocument();
  });

  it("flips to remaining framing ('N to go') at or above 50%", () => {
    renderCard(
      goal({
        current: 90,
        target: { value: 100 },
        progress: { type: "bar", pct: 90 },
      }),
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("to 100")).toBeInTheDocument();
    expect(screen.queryByText("toward 100")).not.toBeInTheDocument();
  });

  it("shows a plain stage phrase, no cross-scale numbers, for an e1RM milestone", () => {
    // The real-world "0.1 осталось" bug (bugs/photo_2026-08-01_15-01-45.jpg): a goal titled
    // "70 кг × 10" tracked by e1RM 87→93 showed "0.1" — a number on a scale the title never
    // mentions. Numeric reframing ("0.1 kg to 93 kg") was still rejected; e1RM goals now get a
    // plain stage phrase and keep all numbers off the card.
    renderCard(
      goal({
        current: 92.9,
        target: { value: 93, baseline_value: 87, unit: "kg", metric: "e1rm" },
        progress: { type: "bar", pct: 98 },
      }),
    );
    expect(screen.getByText("almost there")).toBeInTheDocument();
    // The e1RM numbers must NOT appear — they live on a different scale than the goal title.
    expect(screen.queryByText(/93/)).not.toBeInTheDocument();
    expect(screen.queryByText("0.1 kg")).not.toBeInTheDocument();
  });

  it("frames a bodyweight cut (current falling toward target) as positive distances, not a negative", () => {
    // baseline_value=100, value=90 (losing weight), current=94 — current is numerically ABOVE
    // target here, which would go negative under a naive target-minus-current subtraction.
    renderCard(
      goal({
        current: 94,
        target: { value: 90, baseline_value: 100 },
        progress: { type: "bar", pct: 60 },
      }),
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("to 90")).toBeInTheDocument();
  });

  it("celebrates overshoot ('+N over the goal') when a climbing milestone beats its target", () => {
    renderCard(
      goal({
        current: 118,
        target: { value: 110 },
        progress: { type: "bar", pct: 100 },
      }),
    );
    expect(screen.getByText("+8")).toBeInTheDocument();
    expect(screen.getByText("over the goal")).toBeInTheDocument();
    expect(screen.queryByText("to 110")).not.toBeInTheDocument();
  });

  it("replaces the trend chart with a 'not enough data' caption below 3 points", () => {
    renderCard(
      goal({
        goal_type: "trend",
        progress: {
          type: "trend",
          metric: "e1rm",
          exercise_id: "bench",
          direction: null,
          trend_pct: null,
          series: [
            { date: "2026-07-01", value: 100 },
            { date: "2026-07-08", value: 100 },
          ],
        },
      }),
    );
    expect(screen.getByText("Not enough data yet — keep logging workouts")).toBeInTheDocument();
  });

  it("explains a missing landmark in words instead of a bare grey status dot", () => {
    renderCard(
      goal({
        goal_type: "weekly_volume",
        progress: {
          type: "weekly_bands",
          muscle: "calves",
          band: "mev",
          current_status: null,
          current_sets: 4,
          landmark: null,
          history: [{ week: "2026-W25", sets: 4, status: null }],
        },
      }),
    );
    expect(screen.getByText(/no volume guideline for this muscle/)).toBeInTheDocument();
  });

  it("labels the weekly pill row with its week count (disambiguates from the day pills)", () => {
    renderCard(
      goal({
        goal_type: "weekly_volume",
        progress: {
          type: "weekly_bands",
          muscle: "chest",
          band: "mev",
          current_status: "in_range",
          current_sets: 12,
          landmark: { mev: 8, mav: 20 },
          history: [
            { week: "2026-W24", sets: 10, status: "in_range" },
            { week: "2026-W25", sets: 12, status: "in_range" },
          ],
        },
      }),
    );
    expect(screen.getByText("last 2 weeks")).toBeInTheDocument();
  });

  it("celebrates a freshly-achieved milestone exactly once (localStorage-gated)", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    localStorage.removeItem("ws_goal_achieved_seen");
    const achieved = () =>
      goal({
        id: "g-celebrate",
        current: 100,
        target: { value: 100 },
        progress: { type: "bar", pct: 100 },
      });
    const { unmount } = renderCard(achieved());
    expect(screen.getByText("Goal achieved!")).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("ws_goal_achieved_seen")!)["g-celebrate"]).toBe(true);
    unmount();
    // A later visit to the same achieved goal stays calm — the bloom is a moment, not a state.
    renderCard(achieved());
    expect(screen.queryByText("Goal achieved!")).not.toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("opens the detail sheet when the card body is tapped", async () => {
    renderCard(goal({ progress: { type: "bar", pct: 40 }, target: { value: 100 }, current: 40 }));
    const card = screen.getByRole("button", { name: "Goal details" });
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(card);
    // The sheet repeats the goal title inside the drawer — two occurrences total.
    expect((await screen.findAllByText("Bench 100kg")).length).toBeGreaterThan(1);
  });

  it("celebrates overshoot ('+N over the goal') when a bodyweight-cut goal passes its target", () => {
    // baseline=90, target=80 (cut), current=72 — 8kg PAST the target. Backend clamps pct at
    // 100; the card surfaces the overshoot distance instead of underselling it as "0 to go".
    renderCard(
      goal({
        current: 72,
        target: { value: 80, baseline_value: 90 },
        progress: { type: "bar", pct: 100 },
      }),
    );
    expect(screen.getByText("+8")).toBeInTheDocument();
    expect(screen.getByText("over the goal")).toBeInTheDocument();
  });

  it("shows zero accumulated progress (not a false positive) when a bodyweight goal moves the wrong direction", () => {
    // baseline=90, target=80 (cut), current=95 — gained weight, moved AWAY from the cut target.
    // Backend clamps pct at 0. Must not report this as "5 toward 80".
    renderCard(
      goal({
        current: 95,
        target: { value: 80, baseline_value: 90 },
        progress: { type: "bar", pct: 0 },
      }),
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("toward 80")).toBeInTheDocument();
  });

  it("does not render the milestone ring for a non-milestone goal_type even if progress is bar-shaped", () => {
    // A frequency goal wrongly marked featured (coach-prompt guidance only, not server-enforced)
    // falls back to the same bar-shaped progress a milestone gets — but a ring implying a
    // one-time finish line would be misleading for a goal that resets every week.
    renderCard(
      goal({
        goal_type: "frequency",
        title: "4x per week",
        current: 0,
        target: { value: 4 },
        progress: { type: "bar", pct: 0 },
      }),
    );
    expect(screen.getByText("4x per week")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("falls back to a plain percentage, no framing headline, when target/current don't resolve to numbers", () => {
    renderCard(goal({ current: null, target: null, progress: { type: "bar", pct: 55 } }));
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.queryByText(/^to \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^toward/)).not.toBeInTheDocument();
  });

  // F-FEATUREDGOAL-2: the glow used to snap on instantly at pct=80; it now ramps smoothly from
  // 80% to 100% instead, but still never shows below the 80% threshold at all.
  function glowDiv(container: HTMLElement) {
    // scoped to a div (the FAB's lucide icon also carries aria-hidden, but renders as an svg)
    return container.querySelector("div[aria-hidden]");
  }

  it("shows no glow below the 80% threshold for a milestone", () => {
    const { container } = renderCard(goal({ progress: { type: "bar", pct: 79 } }));
    expect(glowDiv(container)).not.toBeInTheDocument();
  });

  it("ramps glow opacity between 80% and 100% instead of snapping straight to full", () => {
    const { container: at80 } = renderCard(goal({ progress: { type: "bar", pct: 80 } }));
    const { container: at100 } = renderCard(goal({ progress: { type: "bar", pct: 100 } }));
    const opacityAt80 = Number(
      glowDiv(at80)
        ?.getAttribute("style")
        ?.match(/opacity:\s*([\d.]+)/)?.[1],
    );
    const opacityAt100 = Number(
      glowDiv(at100)
        ?.getAttribute("style")
        ?.match(/opacity:\s*([\d.]+)/)?.[1],
    );
    expect(opacityAt80).toBeGreaterThan(0);
    expect(opacityAt80).toBeLessThan(opacityAt100);
    expect(opacityAt100).toBeCloseTo(0.1, 5);
  });

  it("renders a status dot and zero-filled history row for weekly_bands progress", () => {
    renderCard(
      goal({
        goal_type: "weekly_volume",
        progress: {
          type: "weekly_bands",
          muscle: "chest",
          band: "mev",
          current_status: "in_range",
          current_sets: 17,
          landmark: { mev: 8, mav: 20 },
          history: [
            { week: "2026-W20", sets: 0, status: "under" },
            { week: "2026-W21", sets: 17, status: "in_range" },
          ],
        },
      }),
    );
    expect(screen.getByText(/17 sets this week/)).toBeInTheDocument();
    // No progress bar for a recurring goal — it has no single finish line.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("outlines only the current (last) week's pill in the weekly_bands history row", () => {
    const { container } = renderCard(
      goal({
        goal_type: "weekly_volume",
        progress: {
          type: "weekly_bands",
          muscle: "chest",
          band: "mev",
          current_status: "in_range",
          current_sets: 17,
          landmark: { mev: 8, mav: 20 },
          history: [
            { week: "2026-W20", sets: 12, status: "in_range" },
            { week: "2026-W21", sets: 17, status: "in_range" },
          ],
        },
      }),
    );
    const pills = container.querySelectorAll('span[role="img"]');
    expect(pills).toHaveLength(2);
    expect(pills[0]).not.toHaveClass("ring-2");
    expect(pills[1]).toHaveClass("ring-2");
    // Each pill carries its own accessible name — the row isn't blanket aria-hidden, so a screen
    // reader can read out per-week status instead of only the current week's summary line.
    expect(pills[0]).toHaveAttribute("aria-label", "2026-W20: 12 sets, In range");
  });

  it("renders an unlandmarked muscle's weekly_bands progress without crashing", () => {
    // status: null throughout — a muscle with no MEV/MAV entry (e.g. "neck") per
    // landmarks.status_for's own "no landmark data, never a fabricated status" contract.
    renderCard(
      goal({
        goal_type: "weekly_volume",
        progress: {
          type: "weekly_bands",
          muscle: "neck",
          band: "mev",
          current_status: null,
          current_sets: 3,
          landmark: null,
          history: [{ week: "2026-W29", sets: 3, status: null }],
        },
      }),
    );
    expect(screen.getByText(/3 sets this week/)).toBeInTheDocument();
  });

  it("renders a direction label and a signed rate-of-change headline for trend progress", () => {
    renderCard(
      goal({
        goal_type: "trend",
        progress: {
          type: "trend",
          metric: "e1rm",
          exercise_id: "sq1",
          direction: "up",
          trend_pct: 10,
          series: [
            { date: "2026-01-01", value: 100 },
            { date: "2026-02-01", value: 110 },
          ],
        },
      }),
    );
    expect(screen.getByText("Trending up")).toBeInTheDocument();
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText("vs last month")).toBeInTheDocument();
    // Still no completion metaphor — trend has no fixed finish line by design.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("omits the rate-of-change headline when trend_pct isn't available yet", () => {
    renderCard(
      goal({
        goal_type: "trend",
        progress: {
          type: "trend",
          metric: "e1rm",
          exercise_id: "sq1",
          direction: null,
          trend_pct: null,
          series: [],
        },
      }),
    );
    expect(screen.getByText("Holding steady")).toBeInTheDocument();
    expect(screen.queryByText("vs last month")).not.toBeInTheDocument();
  });

  it("renders an ok status and a current-value marker for tolerance progress within the band", () => {
    renderCard(
      goal({
        goal_type: "maintenance",
        progress: {
          type: "tolerance",
          baseline: 10000,
          current: 9500,
          tolerance_pct: 20,
          drop_pct: 5,
          status: "ok",
          series: [],
        },
      }),
    );
    expect(screen.getByText("Within range")).toBeInTheDocument();
    expect(screen.getByTestId("maintenance-current-marker")).toBeInTheDocument();
  });

  it("renders a warn message with the drop percentage for tolerance progress outside the band", () => {
    renderCard(
      goal({
        goal_type: "maintenance",
        progress: {
          type: "tolerance",
          baseline: 10000,
          current: 6000,
          tolerance_pct: 20,
          drop_pct: 40,
          status: "warn",
          series: [],
        },
      }),
    );
    expect(screen.getByText(/40% below baseline/)).toBeInTheDocument();
  });

  it("always renders the coach FAB alongside the goal", () => {
    renderCard(goal());
    expect(
      screen.getByRole("button", { name: "Talk this over with your coach" }),
    ).toBeInTheDocument();
  });
});
