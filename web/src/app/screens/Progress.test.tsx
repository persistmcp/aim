import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Progress } from "./Progress";
import { useBodyMetrics, useExercises, usePRs, useProgression, useSessions } from "../lib/queries";

vi.mock("../lib/queries", () => ({
  useExercises: vi.fn(),
  usePRs: vi.fn(),
  useBodyMetrics: vi.fn(),
  useSessions: vi.fn(),
  useProgression: vi.fn(),
}));

const q = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  refetch: vi.fn(),
  ...overrides,
});

const todayMinus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const exercisesList = [
  { id: "ex1", name: "Bench Press" },
  { id: "ex2", name: "Squat" },
];

// Chart/count data is intentionally left empty across every test here (no recharts render path —
// jsdom has no ResizeObserver, and this suite is about query-state wiring, not chart visuals).
const emptyProgression = { chart: [], bestWeight: 0, est1rm: undefined, trendPct: undefined };

function setup({
  exercises = q({ data: exercisesList }),
  prs = q({ data: [] }),
  metrics = q({ data: [] }),
  sessions = q({ data: [] }),
  progression = q({ data: emptyProgression }),
}: Record<string, unknown> = {}) {
  vi.mocked(useExercises).mockReturnValue(exercises as ReturnType<typeof useExercises>);
  vi.mocked(usePRs).mockReturnValue(prs as ReturnType<typeof usePRs>);
  vi.mocked(useBodyMetrics).mockReturnValue(metrics as ReturnType<typeof useBodyMetrics>);
  vi.mocked(useSessions).mockReturnValue(sessions as ReturnType<typeof useSessions>);
  vi.mocked(useProgression).mockReturnValue(progression as ReturnType<typeof useProgression>);
  return render(
    <MemoryRouter>
      <Progress />
    </MemoryRouter>,
  );
}

describe("Progress", () => {
  // F-PROGRESS-1
  it("does not lock onto the first exercise while PRs are still loading", () => {
    const progression = vi.mocked(useProgression);
    setup({
      prs: q({ isLoading: true, data: undefined }),
      exercises: q({ data: exercisesList }),
    });
    // The effect bails out early while prs.isLoading is true, so exerciseId must still be
    // undefined — not exercises.data[0].id.
    expect(progression).toHaveBeenLastCalledWith(undefined);
  });

  // F-PROGRESS-1
  it("defaults to the user's top PR exercise once both prs and exercises have loaded", () => {
    const progression = vi.mocked(useProgression);
    setup({
      prs: q({
        data: [
          { exerciseId: "ex2", exerciseName: "Squat", weight: 100, reps: 5, date: "2026-07-01" },
        ],
      }),
      exercises: q({ data: exercisesList }),
    });
    expect(progression).toHaveBeenLastCalledWith("ex2");
  });

  it("falls back to the first exercise when the user has exercises but zero PRs", () => {
    const progression = vi.mocked(useProgression);
    setup({ prs: q({ data: [] }), exercises: q({ data: exercisesList }) });
    expect(progression).toHaveBeenLastCalledWith("ex1");
  });

  it("shows ErrorState with a working retry when any of the four queries errors", async () => {
    const user = userEvent.setup();
    const exercisesRefetch = vi.fn();
    const prsRefetch = vi.fn();
    const sessionsRefetch = vi.fn();
    const metricsRefetch = vi.fn();
    setup({
      exercises: q({ data: exercisesList, refetch: exercisesRefetch }),
      prs: q({ data: [], refetch: prsRefetch }),
      sessions: q({ data: [], refetch: sessionsRefetch }),
      // metrics alone errors — the gate must not require every query to fail.
      metrics: q({ isError: true, refetch: metricsRefetch }),
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(exercisesRefetch).toHaveBeenCalledTimes(1);
    expect(prsRefetch).toHaveBeenCalledTimes(1);
    expect(sessionsRefetch).toHaveBeenCalledTimes(1);
    expect(metricsRefetch).toHaveBeenCalledTimes(1);
  });

  // F-PROGRESS-2
  it("hides the best-set/1RM/trend stat row when there is nothing in the window", () => {
    setup({ progression: q({ data: { ...emptyProgression, bestWeight: 0 } }) });
    expect(screen.queryByText("Top set")).not.toBeInTheDocument();
    expect(screen.queryByText("Est. 1RM")).not.toBeInTheDocument();
  });

  // The stat row is derived from the period-filtered chart points, NOT from the envelope's
  // all-history bestWeight/est1rm/trendPct — those ignored the 1M/3M/6M/Year toggle entirely, so
  // the card showed an all-time trend next to a one-month line. The envelope values below are
  // deliberately absurd: if any of them reaches the screen, the regression is back.
  it("derives the stat row from the points inside the selected period", () => {
    setup({
      prs: q({ data: [] }),
      progression: q({
        data: {
          chart: [
            { date: "1 Aug", iso: todayMinus(20), topSet: 100, estimated1RM: 110 },
            { date: "8 Aug", iso: todayMinus(3), topSet: 120, estimated1RM: 132 },
          ],
          bestWeight: 999,
          est1rm: 999,
          trendPct: 999,
        },
      }),
    });
    expect(screen.getByText("Top set")).toBeInTheDocument();
    expect(screen.getByText("120 kg")).toBeInTheDocument();
    expect(screen.getByText("132 kg")).toBeInTheDocument();
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.queryByText("999 kg")).not.toBeInTheDocument();
  });

  // F-PROGRESS-3
  it("renders the PR-empty message, without crashing, when there's no PR for the selected exercise", () => {
    setup({ prs: q({ data: [] }), exercises: q({ data: exercisesList }) });
    expect(screen.getByText("No record yet")).toBeInTheDocument();
  });

  // The PR row's "1RM ~N" is computed client-side from the set actually shown, because the API's
  // est_1rm is a SEPARATE maximum from a possibly different day. These cases come from the
  // backend's stats.epley_1rm (100.0 / 116.67 / 163.33 / 120.0, rounded for display), so the two
  // implementations cannot drift apart unnoticed.
  it.each([
    [100, 1, "100 kg"],
    [100, 5, "117 kg"],
    [140, 5, "163 kg"],
    [90, 10, "120 kg"],
  ])("matches the backend's Epley for %s kg x %s", (weight, reps, expected) => {
    setup({
      prs: q({
        data: [
          { exerciseId: "ex1", exerciseName: "Bench Press", weight, reps, date: "2026-07-01" },
        ],
      }),
    });
    expect(screen.getByText(new RegExp(`1RM ~${expected}`))).toBeInTheDocument();
  });

  it("renders the matching PR when one exists for the selected exercise", () => {
    setup({
      prs: q({
        data: [
          { exerciseId: "ex2", exerciseName: "Squat", weight: 140, reps: 3, date: "2026-07-01" },
        ],
      }),
      exercises: q({ data: exercisesList }),
    });
    expect(screen.getByText(/140 kg × 3/)).toBeInTheDocument();
  });
});
