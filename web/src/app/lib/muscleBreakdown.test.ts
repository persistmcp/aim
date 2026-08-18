// The detail sheet is the THIRD implementation of the tier weights (after backend stats.py and
// muscleVolume.ts), and it had no tests at all: a review found the constants hand-copied here with
// nothing to notice if the other two were ever retuned. Its numbers must add up to the panel's, so
// the rules it duplicates are pinned here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMuscleBreakdown } from "./muscleBreakdown";
import { daysAgoIso } from "./localDate";
import * as api from "./api";

const EXERCISES = [
  {
    id: "bench",
    name: "Bench",
    category: "compound",
    primary_muscles: ["chest"],
    secondary_muscles: ["triceps"],
    tertiary_muscles: ["upper_back"],
  },
  {
    id: "deadlift",
    name: "Deadlift",
    category: "compound",
    movement_pattern: "hinge",
    primary_muscles: ["glutes"],
    secondary_muscles: ["lower_back"],
    tertiary_muscles: [],
  },
  {
    id: "cat_cow",
    name: "Cat-cow",
    category: "mobility",
    primary_muscles: ["lower_back"],
    secondary_muscles: [],
    tertiary_muscles: [],
  },
];

function mockApi(entries: { id: string; date: string; exercise: string; sets: number }[]) {
  vi.spyOn(api, "apiGet").mockImplementation(async (path: string) => {
    if (path === "/exercises") return EXERCISES as any;
    if (path === "/sessions") return entries.map((e) => ({ id: e.id, date: e.date })) as any;
    const e = entries.find((x) => `/sessions/${x.id}` === path)!;
    return {
      date: e.date,
      entries: [
        {
          exercise_id: e.exercise,
          sets: Array.from({ length: e.sets }, () => ({ type: "working", reps: 10 })),
        },
      ],
    } as any;
  });
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("fetchMuscleBreakdown", () => {
  it("weights the three tiers 1 / 0.5 / 0.25, matching the panel it explains", async () => {
    mockApi([{ id: "s1", date: daysAgoIso(0), exercise: "bench", sets: 4 }]);
    const out = await fetchMuscleBreakdown();
    expect(out.chest[0].sets).toBe(4);
    expect(out.triceps[0].sets).toBe(2);
    expect(out.upper_back[0].sets).toBe(1);
  });

  it("counts direct reps only, never assistance reps", async () => {
    mockApi([{ id: "s1", date: daysAgoIso(0), exercise: "bench", sets: 2 }]);
    const out = await fetchMuscleBreakdown();
    expect(out.chest[0].reps).toBe(20);
    expect(out.triceps[0].reps).toBe(0);
  });

  it("skips the categories the panel skips, so the two cannot disagree", async () => {
    mockApi([{ id: "s1", date: daysAgoIso(0), exercise: "cat_cow", sets: 3 }]);
    const out = await fetchMuscleBreakdown();
    expect(out).toEqual({});
  });
});

describe("axial promotion parity", () => {
  it("credits the erectors a full set on a hinge, the same as the panel it explains", async () => {
    mockApi([{ id: "s1", date: daysAgoIso(0), exercise: "deadlift", sets: 3 }]);
    const out = await fetchMuscleBreakdown();
    // Not 1.5: without this the sheet said "1.5 sets" under a panel that had counted 3.
    expect(out.lower_back[0].sets).toBe(3);
  });
});
