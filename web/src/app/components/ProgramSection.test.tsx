import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgramSection } from "./ProgramSection";
import { useExerciseCatalog, useProgram } from "../lib/queries";
import type { Program } from "../data/workouts";

// useProgram/useExerciseCatalog are react-query hooks (queries.ts) backed by GET /{token}/api/program
// and /api/exercises respectively. Mocked here so each test controls the query state directly.
vi.mock("../lib/queries", () => ({
  useProgram: vi.fn(),
  useExerciseCatalog: vi.fn(),
}));

const mockUseProgram = vi.mocked(useProgram);
const mockUseCatalog = vi.mocked(useExerciseCatalog);

type QueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

function setProgram(state: Partial<QueryState<Program | null>>) {
  mockUseProgram.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useProgram>);
}

function setCatalog(state: Partial<QueryState<Map<string, unknown>>> = {}) {
  mockUseCatalog.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useExerciseCatalog>);
}

const twoDayProgram: Program = {
  id: "prog1",
  name: "Strength Block A",
  days: [
    {
      id: "d1",
      name: "Day A",
      focus: "upper",
      durationMin: 45,
      blocks: [
        {
          type: "superset",
          items: [
            {
              exerciseId: "bench_press",
              exerciseName: "Bench Press",
              targetSets: 3,
              repMin: 8,
              repMax: 10,
              targetWeight: 60,
            },
            { exerciseId: "row_machine", exerciseName: "Row Machine", targetSets: 3, repMax: 12 },
          ],
        },
      ],
    },
    {
      id: "d2",
      name: "Day B",
      focus: "lower",
      blocks: [
        {
          type: "straight",
          items: [{ exerciseId: "goblet_squat", targetSets: 4, repMin: 6, repMax: 6 }],
        },
      ],
    },
  ],
};

describe("ProgramSection", () => {
  // F-PROGRAM-1/2 regression guards: loading, error, and "no active program" used to all render
  // nothing at all (no CTA, no ErrorState) — fixed 2026-07-12 so each is visibly distinct.
  it("shows a loading indicator while the program query is loading", () => {
    setProgram({ isLoading: true });
    setCatalog();
    render(<ProgramSection />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // F-PROGRAM-1
  it("shows a CTA to build a program when there is no active program (data: null, the 404 case) — does not try to read .days off null", () => {
    setProgram({ data: null, isLoading: false, isError: false });
    setCatalog();
    render(<ProgramSection />);
    expect(
      screen.getByText("No active program yet. Build one via chat with your AI."),
    ).toBeInTheDocument();
  });

  // F-PROGRAM-2
  it("shows ErrorState with a working retry on a genuine fetch error, distinct from the no-program CTA", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setProgram({ isError: true, isLoading: false, data: undefined, refetch });
    setCatalog();
    render(<ProgramSection />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/Build one via chat/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the same CTA when the program has zero days", () => {
    setProgram({ data: { ...twoDayProgram, days: [] } });
    setCatalog();
    render(<ProgramSection />);
    expect(
      screen.getByText("No active program yet. Build one via chat with your AI."),
    ).toBeInTheDocument();
  });

  it("renders the program name and first day's exercises by default", () => {
    setProgram({ data: twoDayProgram });
    setCatalog();
    render(<ProgramSection />);
    expect(screen.getByText("Strength Block A")).toBeInTheDocument();
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Row Machine")).toBeInTheDocument();
    // 3 sets x 8-10 reps
    expect(screen.getByText("3×8–10")).toBeInTheDocument();
    // targetWeight formatted via t("kg", {n})
    expect(screen.getByText("60 kg")).toBeInTheDocument();
  });

  it("shows day tabs only when there is more than one day, and switching tabs swaps the rendered exercises", async () => {
    const user = userEvent.setup();
    setProgram({ data: twoDayProgram });
    setCatalog();
    render(<ProgramSection />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.queryByText("Goblet Squat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Day B" }));
    expect(screen.queryByText("Bench Press")).not.toBeInTheDocument();
    // goblet_squat has no exerciseName and no catalog entry, so it falls back to the humanized slug
    expect(screen.getByText("goblet squat")).toBeInTheDocument();
    // repMin === repMax collapses to a single number, not a range
    expect(screen.getByText("4×6")).toBeInTheDocument();
  });

  it("hides day tabs for a single-day program", () => {
    setProgram({ data: { ...twoDayProgram, days: [twoDayProgram.days[0]] } });
    setCatalog();
    render(<ProgramSection />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("labels a multi-item superset block and expands an exercise row to show instructions on click", async () => {
    const user = userEvent.setup();
    setProgram({ data: twoDayProgram });
    setCatalog({
      data: new Map([
        [
          "bench_press",
          {
            id: "bench_press",
            name: "Bench Press",
            primaryMuscles: ["chest"],
            instructions: "Lower with control.",
          },
        ],
      ]),
    });
    render(<ProgramSection />);

    expect(screen.getByText("Superset 1")).toBeInTheDocument();

    const row = screen.getByRole("button", { name: /Bench Press/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Lower with control.")).not.toBeInTheDocument();

    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Lower with control.")).toBeInTheDocument();
  });

  it("falls back to a 'no instructions' note when the catalog has no entry for the exercise", async () => {
    const user = userEvent.setup();
    setProgram({ data: twoDayProgram });
    setCatalog();
    render(<ProgramSection />);

    await user.click(screen.getByRole("button", { name: /Bench Press/ }));
    expect(screen.getByText("No technique notes yet.")).toBeInTheDocument();
  });
});
