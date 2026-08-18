import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuscleLoadSection } from "./MuscleLoadSection";
import { useMuscleVolume, useProfile } from "../lib/queries";
import { loadHeat } from "../lib/muscle";
import { loadColor } from "./MuscleMap2D";
import type { MuscleVolume } from "../lib/muscleVolume";

vi.mock("../lib/queries", () => ({
  useMuscleVolume: vi.fn(),
  useProfile: vi.fn(),
  // The detail sheet's lazy breakdown query — disabled until a muscle is tapped, so an inert
  // stub is the honest default.
  useMuscleBreakdown: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

const mockedUseMuscleVolume = vi.mocked(useMuscleVolume);

// Focus muscles are a supplementary personalization signal (COACHING_PLAN.md §8.2); most tests
// don't care about them, so default to "no profile loaded yet" and let dedicated tests override.
beforeEach(() => {
  vi.mocked(useProfile).mockReturnValue({ data: undefined } as ReturnType<typeof useProfile>);
});

// Full query-state shape (data/isLoading/isFetching/isError/refetch) so each test only needs to
// override what it cares about — matches the return of the real useQuery hook.
function mockQuery(
  overrides: Partial<{
    data: MuscleVolume | undefined;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    refetch: () => void;
  }> = {},
) {
  const base = {
    data: undefined as MuscleVolume | undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  };
  mockedUseMuscleVolume.mockReturnValue(base as any);
  return base;
}

// Finds the row's load bar (the inner fill span of the ".overflow-hidden" track) — distinct from
// the status dot, which also sets an inline background-color but has no width.
function heatBar(label: string) {
  const row = screen.getByText(label).closest("button")!;
  return row.querySelector<HTMLSpanElement>(".overflow-hidden > span");
}

describe("MuscleLoadSection", () => {
  it("shows a computing indicator on first load, no data yet", () => {
    mockQuery({ isLoading: true, isFetching: true });
    render(<MuscleLoadSection />);
    expect(screen.getByText(/Calculating load/)).toBeInTheDocument();
  });

  // F-MUSCLE-1
  it("renders ErrorState with a working retry on a failed query, not a silent empty week (regression: the hook's isError was never destructured/checked, so a real fetch failure rendered the same 'not trained this week' copy as a brand-new user)", async () => {
    const refetch = vi.fn();
    mockQuery({ isError: true, refetch });
    render(<MuscleLoadSection />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/light up here/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the brand-new-user empty state when the week has zero total sets, not a crash", () => {
    mockQuery({ data: { totalSets: 0, maxSets: 0, muscles: [] } });
    render(<MuscleLoadSection />);
    expect(screen.getByText(/light up here/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the body map and legend on screen for a workless window (regression: the panel used to collapse to a bare text line every Monday morning, reading as a broken feature)", () => {
    mockQuery({ data: { totalSets: 0, maxSets: 0, muscles: [] } });
    render(<MuscleLoadSection />);
    // The front/back toggle only renders with the map.
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText(/light up here/)).toBeInTheDocument();
  });

  it("fills the bar to the top of the ramp for a freshly, fully loaded muscle", () => {
    mockQuery({
      data: {
        totalSets: 20,
        maxSets: 20,
        muscles: [{ muscle: "chest", sets: 20, reps: 160, hardSets: 20, load: 1, readyInH: 60 }],
      },
    });
    render(<MuscleLoadSection />);
    const bar = heatBar("Chest");
    expect(bar?.style.width).toBe("100%");
    expect(bar?.style.backgroundColor).toBe(loadColor(1));
  });

  it("shows a partly recovered muscle as a shorter, cooler bar than a fresh one", () => {
    mockQuery({
      data: {
        totalSets: 6,
        maxSets: 6,
        muscles: [{ muscle: "chest", sets: 6, reps: 48, hardSets: 6, load: 0.25, readyInH: 60 }],
      },
    });
    render(<MuscleLoadSection />);
    const heat = loadHeat(0.25);
    const bar = heatBar("Chest");
    expect(heat).toBeLessThan(1);
    expect(bar?.style.width).toBe(`${Math.max(6, heat * 100)}%`);
    expect(bar?.style.backgroundColor).toBe(loadColor(heat));
  });

  it("marks a cleared muscle with a tick instead of showing a weekly set count", () => {
    mockQuery({
      data: {
        totalSets: 10,
        maxSets: 10,
        muscles: [{ muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 0, readyInH: 0 }],
      },
    });
    render(<MuscleLoadSection />);
    expect(screen.getAllByLabelText(/No load left/).length).toBeGreaterThan(0);
    // The weekly volume channel moved to the detail sheet; the row must not carry it any more.
    expect(screen.queryByText(/10 sets/)).not.toBeInTheDocument();
  });

  it("tells a loaded muscle when it will be ready, in hours near-term and days beyond that", () => {
    mockQuery({
      data: {
        totalSets: 8,
        maxSets: 8,
        muscles: [
          { muscle: "chest", sets: 8, reps: 64, hardSets: 8, load: 0.9, readyInH: 69 },
          { muscle: "calves", sets: 4, reps: 40, hardSets: 4, load: 0.2, readyInH: 6 },
        ],
      },
    });
    render(<MuscleLoadSection />);
    expect(screen.getByText(/fades in ~3 d/)).toBeInTheDocument();
    expect(screen.getByText(/fades in ~6 h/)).toBeInTheDocument();
  });

  it("renders a muscle with no known volume landmark without crashing (real-world catalog gap)", () => {
    // "neck" has no entry in SET_LANDMARKS/SET_TARGET — target and status are both null/undefined.
    mockQuery({
      data: {
        totalSets: 5,
        maxSets: 5,
        muscles: [{ muscle: "neck", sets: 5, reps: 40, hardSets: 5, load: 1, readyInH: 60 }],
      },
    });
    expect(() => render(<MuscleLoadSection />)).not.toThrow();
    expect(screen.getByText("Neck")).toBeInTheDocument();
  });

  it("names the least-loaded muscles from its own rows, never a name the list doesn't show (regression: it announced 'Abs, Calves' while neither appeared among the rows, and skipped the one muscle actually marked clear)", () => {
    mockQuery({
      data: {
        totalSets: 14,
        maxSets: 10,
        muscles: [
          { muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 0.9, readyInH: 60 },
          { muscle: "quads", sets: 4, reps: 40, hardSets: 4, load: 0, readyInH: 0 },
        ],
      },
    });
    render(<MuscleLoadSection />);
    const callout = screen.getByText(/Least loaded right now/).closest("p")!;
    expect(callout.textContent).toContain("Quads");
    expect(callout.textContent).not.toContain("Chest");
  });

  it("says nothing when every muscle still carries load, rather than inventing a suggestion", () => {
    mockQuery({
      data: {
        totalSets: 10,
        maxSets: 10,
        muscles: [{ muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 0.9, readyInH: 60 }],
      },
    });
    render(<MuscleLoadSection />);
    expect(screen.queryByText(/Least loaded right now/)).not.toBeInTheDocument();
  });

  describe("focus muscles (COACHING_PLAN.md §8.2)", () => {
    it("badges a focus muscle's row and leaves non-focus rows unbadged", async () => {
      vi.mocked(useProfile).mockReturnValue({
        data: { focus_muscles: ["biceps"] },
      } as ReturnType<typeof useProfile>);
      mockQuery({
        data: {
          totalSets: 20,
          maxSets: 12,
          muscles: [
            { muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 },
            { muscle: "biceps", sets: 12, reps: 96, hardSets: 12, load: 1, readyInH: 60 },
          ],
        },
      });
      const user = userEvent.setup();
      render(<MuscleLoadSection />);
      // Collapsed view shows starred rows only — non-focus chest hides behind the expand button.
      const bicepsRow = screen.getByText("Biceps").closest("button")!;
      expect(bicepsRow.querySelector('[aria-label="Focus"]')).toBeInTheDocument();
      expect(screen.queryByText("Chest")).not.toBeInTheDocument();
      await user.click(screen.getByText(/All muscles/));
      const chestRow = screen.getByText("Chest").closest("button")!;
      expect(chestRow.querySelector('[aria-label="Focus"]')).not.toBeInTheDocument();
    });

    it("sorts focus muscles first in the list, stable otherwise", async () => {
      vi.mocked(useProfile).mockReturnValue({
        data: { focus_muscles: ["triceps"] },
      } as ReturnType<typeof useProfile>);
      mockQuery({
        data: {
          totalSets: 30,
          maxSets: 10,
          muscles: [
            { muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 },
            { muscle: "quads", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 },
            { muscle: "triceps", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 },
          ],
        },
      });
      const user = userEvent.setup();
      render(<MuscleLoadSection />);
      await user.click(screen.getByText(/All muscles/));
      const tricepsRow = screen.getByText("Triceps").closest("button")!;
      const chestRow = screen.getByText("Chest").closest("button")!;
      // Bitmask includes DOCUMENT_POSITION_PRECEDING (2) when chestRow comes after tricepsRow.
      expect(tricepsRow.compareDocumentPosition(chestRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("puts a focus muscle first among the least-loaded callout", () => {
      vi.mocked(useProfile).mockReturnValue({
        data: { focus_muscles: ["hamstrings"] },
      } as ReturnType<typeof useProfile>);
      mockQuery({
        data: {
          totalSets: 8,
          maxSets: 4,
          muscles: [
            { muscle: "chest", sets: 4, reps: 32, hardSets: 4, load: 0, readyInH: 0 },
            { muscle: "hamstrings", sets: 4, reps: 32, hardSets: 4, load: 0, readyInH: 0 },
          ],
        },
      });
      render(<MuscleLoadSection />);
      const text = screen.getByText(/Least loaded right now/).closest("p")!.textContent ?? "";
      expect(text.indexOf("Hamstrings")).toBeLessThan(text.indexOf("Chest"));
    });

    it("renders no badges and default order when the profile has no focus muscles yet", () => {
      vi.mocked(useProfile).mockReturnValue({
        data: { focus_muscles: [] as string[] },
      } as ReturnType<typeof useProfile>);
      mockQuery({
        data: {
          totalSets: 10,
          maxSets: 10,
          muscles: [{ muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 }],
        },
      });
      render(<MuscleLoadSection />);
      expect(screen.queryByLabelText("Focus")).not.toBeInTheDocument();
    });
  });

  it("opens the muscle detail sheet on a row tap", async () => {
    mockQuery({
      data: {
        totalSets: 10,
        maxSets: 10,
        muscles: [{ muscle: "chest", sets: 10, reps: 80, hardSets: 10, load: 1, readyInH: 60 }],
      },
    });
    const user = userEvent.setup();
    render(<MuscleLoadSection />);
    const row = screen.getByText("Chest").closest("button")!;
    await user.click(row);
    // The spelled-out summary line only ever appears in the sheet — the list row shows bare
    // numbers — so this marks "sheet is open". The line names DIRECT sets explicitly, because a
    // muscle can sit at 46% load with zero of them and the old wording read as a contradiction
    // with the work listed immediately below it.
    expect(await screen.findByText(/sets straight at it, last 7 days/)).toBeInTheDocument();
  });
});
