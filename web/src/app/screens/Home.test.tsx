import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Home } from "./Home";
import {
  useAdherence,
  useConnection,
  useExerciseCatalog,
  useGoals,
  useMe,
  useMuscleVolume,
  usePRs,
  useProfile,
  useProgram,
  useSessions,
  useSummary,
} from "../lib/queries";
import { isDemo } from "../lib/demo";
import type { PersonalRecord, WorkoutSession } from "../data/workouts";

// Home also renders AdherenceWidget, ProgramSection, MuscleLoadSection and (via the featured-goal
// card's coach FAB) useConnection, plus its own unconditional useGoals("all")/usePRs() calls that
// gate the "past goals" nav row and the new-PR reveal — all pulling from the same query module.
// Keep those permanently harmless (loading/empty) so every test below can focus on Home's own
// three queries without tripping over unrelated child components.
vi.mock("../lib/queries", () => ({
  useMe: vi.fn(),
  useSummary: vi.fn(),
  useSessions: vi.fn(),
  useAdherence: vi.fn(),
  useProfile: vi.fn(),
  useProgram: vi.fn(),
  useExerciseCatalog: vi.fn(),
  useMuscleVolume: vi.fn(),
  useMuscleBreakdown: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGoals: vi.fn(),
  usePRs: vi.fn(),
  useConnection: vi.fn(),
}));
// isDemo() defaults to false — the new-PR reveal's demo-gating test overrides it per-case.
vi.mock("../lib/demo", () => ({ isDemo: vi.fn(() => false) }));

const q = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  refetch: vi.fn(),
  ...overrides,
});

function baseSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "s1",
    dayName: "Push day",
    date: "2026-06-01",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    totalVolume: 6200,
    exercises: [],
    status: "completed",
    ...overrides,
  };
}

function setup({
  me = q({ data: {} }),
  summary = q({ data: { workouts_this_week: 0, volume_this_week: 0, volume_change_pct: null } }),
  sessions = q({ data: [] }),
  profile = q({ data: undefined }),
  goals,
  prs,
  demo = false,
}: {
  me?: unknown;
  summary?: unknown;
  sessions?: unknown;
  profile?: unknown;
  goals?: unknown;
  prs?: unknown;
  demo?: boolean;
} = {}) {
  // Reset every test to non-demo unless it opts in — mock return values otherwise leak across
  // tests within this file since there's no global mockReset between them.
  vi.mocked(isDemo).mockReturnValue(demo);
  vi.mocked(useMe).mockReturnValue(me as ReturnType<typeof useMe>);
  vi.mocked(useSummary).mockReturnValue(summary as ReturnType<typeof useSummary>);
  vi.mocked(useSessions).mockReturnValue(sessions as ReturnType<typeof useSessions>);
  vi.mocked(useProfile).mockReturnValue(profile as ReturnType<typeof useProfile>);
  // Always-safe defaults for the two other screen sections' queries. `useProgram` resolved (not
  // loading) with no program: ProgramSection now renders its own role="status"/role="alert" while
  // loading/erroring (fixed 2026-07-12), which would otherwise collide with assertions below that
  // target Home's own loading/error gate specifically.
  vi.mocked(useProgram).mockReturnValue(
    q({ data: null }) as unknown as ReturnType<typeof useProgram>,
  );
  vi.mocked(useExerciseCatalog).mockReturnValue(
    q() as unknown as ReturnType<typeof useExerciseCatalog>,
  );
  vi.mocked(useMuscleVolume).mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
  } as ReturnType<typeof useMuscleVolume>);
  vi.mocked(useAdherence).mockReturnValue(
    q({ data: undefined }) as unknown as ReturnType<typeof useAdherence>,
  );
  // Home's own history-nav-row gate — no past goals by default, so the row stays hidden unless a
  // test explicitly overrides it.
  vi.mocked(useGoals).mockReturnValue(
    (goals ?? q({ data: undefined })) as unknown as ReturnType<typeof useGoals>,
  );
  // The new-PR reveal gate — no PR data by default, so no test accidentally trips the vibration
  // effect unless it explicitly opts in via the `prs` param.
  vi.mocked(usePRs).mockReturnValue(
    (prs ?? q({ data: undefined })) as unknown as ReturnType<typeof usePRs>,
  );
  // The featured-goal card's coach FAB reads connection state.
  vi.mocked(useConnection).mockReturnValue(
    q({ data: undefined }) as unknown as ReturnType<typeof useConnection>,
  );
  // Home now also renders EditBodyweightSheet (FUNCTIONAL_IMPROVEMENTS_PLAN.md #5), which reaches
  // for useQueryClient() even while its Drawer is closed — a real QueryClient must be in context.
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Home", () => {
  it("shows Loading while summary or me is loading", () => {
    setup({ summary: q({ isLoading: true }) });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // F-HOME-1
  it("does not gate the loading spinner on a still-loading sessions query", () => {
    // summary/me are ready; only sessions is slow. The spinner must not still be shown once the
    // data that actually drives the header/stat tiles has arrived.
    setup({ sessions: q({ isLoading: true, data: undefined }) });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // F-HOME-2
  it("shows ErrorState (with a retry that refetches all three queries) when sessions alone errors", async () => {
    const user = userEvent.setup();
    const meRefetch = vi.fn();
    const summaryRefetch = vi.fn();
    const sessionsRefetch = vi.fn();
    setup({
      me: q({ data: {}, refetch: meRefetch }),
      summary: q({
        data: { workouts_this_week: 0, volume_this_week: 0, volume_change_pct: null },
        refetch: summaryRefetch,
      }),
      sessions: q({ isError: true, refetch: sessionsRefetch }),
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(meRefetch).toHaveBeenCalledTimes(1);
    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    expect(sessionsRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows ErrorState when summary or me errors too", () => {
    setup({ me: q({ isError: true }) });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  // F-HOME-3
  it("renders no 'last workout' paragraph at all when there are no sessions", () => {
    setup({ sessions: q({ data: [] }) });
    expect(screen.queryByText(/Last workout/)).not.toBeInTheDocument();
  });

  // F-HOME-4
  it("uses the 'today' ago-label for a session logged today, not a day count", () => {
    setup({ sessions: q({ data: [baseSession({ date: new Date().toISOString() })] }) });
    expect(screen.getByText(/Last workout: today/)).toBeInTheDocument();
  });

  // Regression: `session.date` is a bare "YYYY-MM-DD", and `new Date(that)` parses it as UTC
  // midnight. Read back through the local getters that build the ring's day keys, every session
  // west of UTC landed on the previous calendar day — the whole bezel was rotated by one tick
  // and the "today" tick never lit for anyone in the Americas.
  it("lights today's ring tick for a user in a timezone west of UTC", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    // The clock is pinned, not read: the bug only shows in the local evening (here 19:00 in Los
    // Angeles, which is already the 10th in UTC), so on a machine set to UTC+4 the real time
    // would never reproduce it and the test would pass against the broken code.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-10T02:00:00Z"));
    try {
      const today = "2026-08-09";
      const { container } = setup({
        sessions: q({ data: [baseSession({ date: today })] }),
        // The bezel only renders inside the streak widget, which needs a streak level.
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: [],
            modules: [],
            metrics: { top_e1rm: null, bodyweight_delta_30d: null },
            goals: [],
            streak: { level: 4, basis: "stated_target", heat: 0.7 },
          },
        }),
      });
      const ticks = Array.from(container.querySelectorAll("line"));
      expect(ticks).toHaveLength(28);
      // Oldest→newest, so the last tick is today.
      expect(ticks[27].getAttribute("stroke")).toBe("var(--accent)");
      expect(ticks.filter((l) => l.getAttribute("stroke") === "var(--accent)")).toHaveLength(1);
      // Same bug, same card, ten lines apart in the source: the ago-label subtracted timestamps
      // from a UTC-midnight parse, so from 17:00 local onward a session logged TODAY read
      // "yesterday" right beside a ring tick that correctly said today.
      expect(screen.getByText(/today/i)).toBeInTheDocument();
      expect(screen.queryByText(/yesterday/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      // `process.env.TZ = undefined` assigns the STRING "undefined", which Node reads as UTC —
      // that would silently switch every later test in this file to UTC and stop them catching a
      // revert of the very fix this test guards.
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("uses a day-count ago-label for an older session", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    setup({ sessions: q({ data: [baseSession({ date: fiveDaysAgo })] }) });
    expect(screen.getByText(/Last workout: 5 days ago/)).toBeInTheDocument();
  });

  it("hides the goal line when me.data.goals is empty or absent", () => {
    setup({ me: q({ data: { goals: [] } }) });
    expect(screen.queryByText(/^Goal:/)).not.toBeInTheDocument();
  });

  it("shows the goal line joined by a dot when goals are present", () => {
    setup({ me: q({ data: { goals: ["Get stronger", "Lose fat"] } }) });
    expect(screen.getByText("Goal: Get stronger · Lose fat")).toBeInTheDocument();
  });

  it("shows a placeholder, not '0 kg', when bodyweight is falsy", () => {
    setup({
      summary: q({
        data: {
          workouts_this_week: 0,
          volume_this_week: 0,
          volume_change_pct: null,
          bodyweight: 0,
        },
      }),
    });
    expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("renders the bodyweight stat tile value when present", () => {
    setup({
      summary: q({
        data: {
          workouts_this_week: 0,
          volume_this_week: 0,
          volume_change_pct: null,
          bodyweight: 82,
        },
      }),
    });
    expect(screen.getByText("82 kg")).toBeInTheDocument();
  });

  // F-HOME-5: regression guard — a real nonzero week (480kg) used to round to "0 t" (Math.round,
  // zero decimals), visually identical to a true zero week; fixed 2026-07-12 to match
  // SessionDetail's one-decimal precision for the same unit.
  it("shows one decimal of precision on the volume tile, distinguishing a light week from a true zero", () => {
    setup({
      summary: q({
        data: { workouts_this_week: 1, volume_this_week: 480, volume_change_pct: null },
      }),
    });
    expect(screen.getByText("0.5 t")).toBeInTheDocument();
    expect(screen.queryByText("0 t")).not.toBeInTheDocument();
  });

  describe("goal-aware layout (/api/profile)", () => {
    it("falls back to the default 3 tiles while profile is still loading", () => {
      setup({ profile: q({ data: undefined, isLoading: true }) });
      expect(screen.getByText("Workouts this week")).toBeInTheDocument();
      expect(screen.getByText("Volume this week")).toBeInTheDocument();
      expect(screen.getByText("Body weight")).toBeInTheDocument();
    });

    // F-HOME-11: the StreakWidget consolidates the tile grid once the backend has a level.
    it("renders the streak widget instead of the tile grid when profile carries a streak level", () => {
      setup({
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: ["workouts_week", "top_e1rm", "bodyweight"],
            modules: ["program", "muscle_load"],
            metrics: { top_e1rm: 112.5, bodyweight_delta_30d: null },
            goals: [],
            streak: { level: 4, basis: "behavioral" },
          },
        }),
      });
      expect(screen.getByText("workouts in the last 4 weeks")).toBeInTheDocument();
      // The old standalone tiles are gone — their numbers live inside the streak card now.
      expect(screen.queryByText("Workouts this week")).not.toBeInTheDocument();
      expect(screen.queryByText("Best e1RM")).not.toBeInTheDocument();
    });

    it("keeps the tile grid when the streak level is null (insufficient history)", () => {
      setup({
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: ["workouts_week", "top_e1rm", "bodyweight"],
            modules: ["program", "muscle_load"],
            metrics: { top_e1rm: 112.5, bodyweight_delta_30d: null },
            goals: [],
            streak: { level: null, basis: "insufficient_data" },
          },
        }),
      });
      expect(screen.getByText("Best e1RM")).toBeInTheDocument();
      expect(screen.queryByText("workouts in the last 4 weeks")).not.toBeInTheDocument();
    });

    it("renders the strength tile set (best e1RM) when primary_goal is strength", () => {
      setup({
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: ["workouts_week", "top_e1rm", "bodyweight"],
            modules: ["goal_progress", "program", "muscle_load"],
            metrics: { top_e1rm: 112.5, bodyweight_delta_30d: null },
            goals: [],
          },
        }),
      });
      expect(screen.getByText("Best e1RM")).toBeInTheDocument();
      expect(screen.getByText("112.5 kg")).toBeInTheDocument();
      expect(screen.queryByText("Volume this week")).not.toBeInTheDocument();
    });

    it("shows a placeholder for top_e1rm when no tracked lift has a computed value yet", () => {
      setup({
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: ["top_e1rm"],
            modules: [],
            metrics: { top_e1rm: null, bodyweight_delta_30d: null },
            goals: [],
          },
        }),
      });
      expect(screen.getByText("Best e1RM")).toBeInTheDocument();
      expect(screen.getByText("·")).toBeInTheDocument();
    });

    it("signs a positive bodyweight delta and renders the fat-loss delta tile", () => {
      setup({
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "fat_loss",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: ["bodyweight_delta_30d"],
            modules: [],
            metrics: { top_e1rm: null, bodyweight_delta_30d: 1.5 },
            goals: [],
          },
        }),
      });
      expect(screen.getByText("+1.5 kg")).toBeInTheDocument();
    });

    it("renders the featured goal card instead of the flat goal line when goal_progress is in modules", () => {
      setup({
        me: q({ data: { goals: ["Get stronger"] } }),
        profile: q({
          data: {
            intake_status: "core_complete",
            primary_goal: "strength",
            locations: [],
            training_days_per_week: 3,
            focus_muscles: [],
            tiles: [],
            modules: ["goal_progress"],
            metrics: { top_e1rm: null, bodyweight_delta_30d: null },
            goals: [],
            featured_goal: {
              id: "g1",
              kind: "performance",
              title: "Bench 100kg",
              target: null,
              status: "active",
              review_date: null,
              current: 77,
              progress_pct: 77,
              goal_type: "milestone",
              featured: true,
              progress: { type: "bar", pct: 77 },
            },
          },
        }),
      });
      expect(screen.getByText("Bench 100kg")).toBeInTheDocument();
      expect(screen.getByText("77%")).toBeInTheDocument();
      // The old flat "Goal: ..." line must not also render — same goal, shown once.
      expect(screen.queryByText(/^Goal:/)).not.toBeInTheDocument();
    });

    it("keeps the flat goal line when profile has no goals to show", () => {
      setup({
        me: q({ data: { goals: ["Get stronger"] } }),
        profile: q({
          data: {
            intake_status: "not_started",
            primary_goal: null,
            locations: [],
            training_days_per_week: null,
            focus_muscles: [],
            tiles: ["workouts_week", "volume_week", "bodyweight"],
            modules: ["program", "muscle_load"],
            metrics: { top_e1rm: null, bodyweight_delta_30d: null },
            goals: [],
          },
        }),
      });
      expect(screen.getByText("Goal: Get stronger")).toBeInTheDocument();
    });
  });

  describe("past-goals nav row", () => {
    it("hides the nav row when there are no past (non-active) goals", () => {
      setup({ goals: q({ data: [{ id: "g1", status: "active" }] }) });
      expect(screen.queryByRole("link", { name: /Past goals/ })).not.toBeInTheDocument();
    });

    it("shows a nav row linking to /goal-history when past goals exist", () => {
      setup({ goals: q({ data: [{ id: "g1", status: "achieved" }] }) });
      const link = screen.getByRole("link", { name: /Past goals/ });
      expect(link).toHaveAttribute("href", "/goal-history");
    });
  });

  describe("new-PR reveal", () => {
    const benchPR: PersonalRecord = {
      exerciseId: "bench",
      exerciseName: "Bench press",
      weight: 105,
      reps: 3,
      date: "2026-07-19",
    };

    beforeEach(() => {
      localStorage.clear();
    });

    it("renders a celebratory strip for a PR newer than what's already seen", () => {
      localStorage.setItem("ws_pr_seen", JSON.stringify({ bench: "2026-07-01" }));
      setup({ prs: q({ data: [benchPR] }) });
      expect(screen.getByText("New PR!")).toBeInTheDocument();
      expect(screen.getByText("Bench press")).toBeInTheDocument();
    });

    it("renders nothing when the fetched PR is already recorded as seen", () => {
      localStorage.setItem("ws_pr_seen", JSON.stringify({ bench: "2026-07-19" }));
      setup({ prs: q({ data: [benchPR] }) });
      expect(screen.queryByText("New PR!")).not.toBeInTheDocument();
      expect(screen.queryByText("Bench press")).not.toBeInTheDocument();
    });

    it("does not celebrate on a brand-new browser with no seen-history yet (first-run seeding)", () => {
      setup({ prs: q({ data: [benchPR] }) });
      expect(screen.queryByText("New PR!")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("ws_pr_seen")!)).toEqual({ bench: "2026-07-19" });
    });

    it("vibrates exactly once for a new PR, even across a forced re-render", () => {
      const vibrate = vi.fn();
      vi.stubGlobal("navigator", { ...navigator, vibrate });
      localStorage.setItem("ws_pr_seen", JSON.stringify({ bench: "2026-07-01" }));
      const { rerender } = setup({ prs: q({ data: [benchPR] }) });
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 200]);
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <Home />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(vibrate).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it("suppresses the whole feature in demo mode, even with objectively new-looking data", () => {
      const vibrate = vi.fn();
      vi.stubGlobal("navigator", { ...navigator, vibrate });
      localStorage.setItem("ws_pr_seen", JSON.stringify({ bench: "2026-07-01" }));
      setup({ prs: q({ data: [benchPR] }), demo: true });
      expect(screen.queryByText("New PR!")).not.toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();
      expect(localStorage.getItem("ws_pr_seen")).toBe(JSON.stringify({ bench: "2026-07-01" }));
      vi.unstubAllGlobals();
    });
  });
});
