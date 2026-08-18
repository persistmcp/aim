// The client fallback is the second copy of the decay model (it runs in demo mode and against any
// deployment older than the `load` field), so it needs its own tests: a bug here shows a different
// map than the server for the same training, and nothing else would catch it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMuscleVolume } from "./muscleVolume";
import { LOAD_WINDOW_DAYS, ROLLING_WINDOW_DAYS } from "./muscle";
import { daysAgoIso } from "./localDate";
import * as api from "./api";

const EXERCISES = [
  {
    id: "rdl",
    name: "RDL",
    category: "compound",
    movement_pattern: "hinge",
    primary_muscles: ["hamstrings"],
    secondary_muscles: [],
  },
  {
    id: "leg_curl",
    name: "Leg curl",
    category: "isolation",
    movement_pattern: "isolation",
    primary_muscles: ["hamstrings"],
    secondary_muscles: [],
  },
  {
    id: "back_ext",
    name: "Back extension",
    category: "isolation",
    movement_pattern: "hinge",
    primary_muscles: ["lower_back"],
    secondary_muscles: [],
  },
  {
    id: "bench",
    name: "Bench",
    category: "compound",
    movement_pattern: "horizontal_push",
    primary_muscles: ["chest"],
    secondary_muscles: ["triceps"],
    tertiary_muscles: ["upper_back"],
  },
  {
    id: "kickback",
    name: "Cable glute kickback",
    category: "isolation",
    movement_pattern: "hinge",
    primary_muscles: ["glutes"],
    secondary_muscles: [],
    tertiary_muscles: ["lower_back"],
    long_length: false,
  },
  {
    id: "cat_cow",
    name: "Cat-cow",
    category: "mobility",
    movement_pattern: "hinge",
    primary_muscles: ["lower_back"],
    secondary_muscles: [],
    tertiary_muscles: [],
  },
  {
    id: "treadmill",
    name: "Treadmill run",
    category: "cardio",
    movement_pattern: "cardio",
    primary_muscles: ["full_body"],
    secondary_muscles: ["quads"],
    tertiary_muscles: [],
  },
];

type Sess = { id: string; date: string; exercise: string; sets: number; rir?: number };

/** Serves the same shapes the real API does, with `/stats/muscle-volume` 404ing so every test
 * exercises the client-side path. */
function mockApi(sessions: Sess[]) {
  vi.spyOn(api, "apiGet").mockImplementation(async (path: string) => {
    if (path === "/stats/muscle-volume") throw new api.ApiError(404, "/stats/muscle-volume");
    if (path === "/exercises") return EXERCISES as any;
    if (path === "/sessions") return sessions.map((s) => ({ id: s.id, date: s.date })) as any;
    const s = sessions.find((x) => `/sessions/${x.id}` === path)!;
    return {
      date: s.date,
      entries: [
        {
          exercise_id: s.exercise,
          sets: Array.from({ length: s.sets }, () => ({ type: "working", reps: 10, rir: s.rir })),
        },
      ],
    } as any;
  });
}

const load = (r: Awaited<ReturnType<typeof fetchMuscleVolume>>, muscle: string) =>
  r.muscles.find((m) => m.muscle === muscle)?.load ?? 0;
const sets = (r: Awaited<ReturnType<typeof fetchMuscleVolume>>, muscle: string) =>
  r.muscles.find((m) => m.muscle === muscle)?.sets ?? 0;

afterEach(() => vi.restoreAllMocks());

describe("fetchMuscleVolume client fallback", () => {
  it("decays load with age instead of counting every set in the window equally", async () => {
    mockApi([
      { id: "a", date: daysAgoIso(0), exercise: "leg_curl", sets: 4 },
      { id: "b", date: daysAgoIso(3), exercise: "leg_curl", sets: 4 },
    ]);
    const fresh = await fetchMuscleVolume("week");
    mockApi([{ id: "b", date: daysAgoIso(3), exercise: "leg_curl", sets: 4 }]);
    const old = await fetchMuscleVolume("week");
    expect(load(fresh, "hamstrings")).toBeGreaterThan(load(old, "hamstrings"));
  });

  it("lets the exercise decide how long the work lingers, not just the set count", async () => {
    mockApi([{ id: "a", date: daysAgoIso(2), exercise: "rdl", sets: 4 }]);
    const hinge = await fetchMuscleVolume("week");
    mockApi([{ id: "a", date: daysAgoIso(2), exercise: "leg_curl", sets: 4 }]);
    const isolation = await fetchMuscleVolume("week");
    expect(load(hinge, "hamstrings")).toBeGreaterThan(load(isolation, "hamstrings"));
    // Same work either way — only the residual load differs.
    expect(sets(hinge, "hamstrings")).toBe(sets(isolation, "hamstrings"));
  });

  it("counts secondary work at half a set", async () => {
    mockApi([{ id: "a", date: daysAgoIso(0), exercise: "bench", sets: 4 }]);
    const r = await fetchMuscleVolume("week");
    expect(sets(r, "chest")).toBe(4);
    expect(sets(r, "triceps")).toBe(2);
  });

  it("keeps a muscle still carrying load from before the set-count window, with zero sets (regression: it would light up on the figure while the response never mentioned it)", async () => {
    // The one case that actually outlives the 7-day tally: the slowest muscle (erectors), the
    // longest-lingering exercise class (long-length hinge) and sets taken to failure.
    mockApi([
      { id: "a", date: daysAgoIso(ROLLING_WINDOW_DAYS), exercise: "back_ext", sets: 22, rir: 0 },
    ]);
    const r = await fetchMuscleVolume("week");
    expect(sets(r, "lower_back")).toBe(0);
    expect(load(r, "lower_back")).toBeGreaterThan(0);
    expect(r.totalSets).toBe(0);
  });

  it("has nothing left to show by the time work drops out of the decay window", async () => {
    // Same worst-case session, one day past the fetch window: it must already read as recovered,
    // or a lit muscle would snap to gray overnight — the very failure this model removes.
    mockApi([
      { id: "a", date: daysAgoIso(LOAD_WINDOW_DAYS - 1), exercise: "back_ext", sets: 8, rir: 0 },
    ]);
    expect(load(await fetchMuscleVolume("week"), "lower_back")).toBe(0);
  });

  it("counts a session at either edge of the rolling window, in the user's own timezone (regression: a UTC-serialized local date dropped the oldest day for anyone west of UTC and added an eighth day east of it)", async () => {
    mockApi([
      { id: "a", date: daysAgoIso(ROLLING_WINDOW_DAYS - 1), exercise: "leg_curl", sets: 3 },
      { id: "b", date: daysAgoIso(0), exercise: "leg_curl", sets: 3 },
    ]);
    const r = await fetchMuscleVolume("week");
    expect(sets(r, "hamstrings")).toBe(6);
  });

  it("survives a session with a missing date instead of poisoning every muscle it touches with NaN", async () => {
    mockApi([
      { id: "a", date: "", exercise: "leg_curl", sets: 4 },
      { id: "b", date: daysAgoIso(0), exercise: "leg_curl", sets: 4 },
    ]);
    const r = await fetchMuscleVolume("week");
    expect(load(r, "hamstrings")).toBeGreaterThan(0);
    expect(Number.isNaN(load(r, "hamstrings"))).toBe(false);
  });

  it("passes the caller's local date to the server so an evening workout isn't aged a day by a UTC clock", async () => {
    const spy = vi.spyOn(api, "apiGet").mockResolvedValue({ muscles: [], total_sets: 0 } as any);
    await fetchMuscleVolume("week");
    expect(spy).toHaveBeenCalledWith(
      "/stats/muscle-volume",
      expect.objectContaining({ today: daysAgoIso(0) }),
    );
  });
});

describe("fetchMuscleVolume server path", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("falls through to the client computation when the server predates the load field", async () => {
    const sessions: Sess[] = [{ id: "a", date: daysAgoIso(0), exercise: "leg_curl", sets: 4 }];
    vi.spyOn(api, "apiGet").mockImplementation(async (path: string) => {
      if (path === "/stats/muscle-volume") {
        // Old shape: no `load` key at all.
        return {
          total_sets: 4,
          max_sets: 4,
          muscles: [{ muscle: "hamstrings", sets: 4, reps: 40, hard_sets: 4 }],
        } as any;
      }
      if (path === "/exercises") return EXERCISES as any;
      if (path === "/sessions") return sessions.map((s) => ({ id: s.id, date: s.date })) as any;
      return {
        date: sessions[0].date,
        entries: [
          {
            exercise_id: "leg_curl",
            sets: Array.from({ length: 4 }, () => ({ type: "working", reps: 10 })),
          },
        ],
      } as any;
    });
    const r = await fetchMuscleVolume("week");
    expect(load(r, "hamstrings")).toBeGreaterThan(0);
  });
});

describe("time to ready", () => {
  it("counts down using the exercise's own window, not the muscle's base one (regression: a first-ever hinge to failure was reported clear days before the bar actually cleared)", async () => {
    mockApi([{ id: "a", date: daysAgoIso(1), exercise: "back_ext", sets: 8, rir: 0 }]);
    const novel = await fetchMuscleVolume("week");
    const hours = novel.muscles.find((m) => m.muscle === "lower_back")!.readyInH;
    // lower_back's unmodified window is 84h; long-length work to failure runs far past it.
    expect(hours).toBeGreaterThan(84);
  });

  it("reports zero for a recovered muscle and something positive for a loaded one", async () => {
    mockApi([{ id: "a", date: daysAgoIso(0), exercise: "leg_curl", sets: 4 }]);
    const r = await fetchMuscleVolume("week");
    const row = r.muscles.find((m) => m.muscle === "hamstrings")!;
    expect(row.load).toBeGreaterThan(0);
    expect(row.readyInH).toBeGreaterThan(0);
    mockApi([{ id: "a", date: daysAgoIso(9), exercise: "leg_curl", sets: 4 }]);
    const old = await fetchMuscleVolume("week");
    expect(old.muscles.find((m) => m.muscle === "hamstrings")?.readyInH ?? 0).toBe(0);
  });

  it("takes the countdown straight from the server when it is available", async () => {
    vi.spyOn(api, "apiGet").mockResolvedValue({
      total_sets: 4,
      max_sets: 4,
      muscles: [{ muscle: "chest", sets: 4, reps: 40, hard_sets: 4, load: 0.5, ready_in_h: 42.5 }],
    } as any);
    const r = await fetchMuscleVolume("week");
    expect(r.muscles[0].readyInH).toBe(42.5);
  });
});

describe("dates outside the window", () => {
  it("ignores a session dated in the future instead of pinning the muscle forever (an assistant pre-logging 'next Saturday', or a wrong device clock, aged to zero and never expired)", async () => {
    const tomorrow = daysAgoIso(-1);
    mockApi([{ id: "a", date: tomorrow, exercise: "leg_curl", sets: 5 }]);
    const r = await fetchMuscleVolume("week");
    expect(r.muscles.find((m) => m.muscle === "hamstrings")).toBeUndefined();
    expect(r.totalSets).toBe(0);
  });
});

describe("tier credit, mirroring backend stats.py", () => {
  // These three rules are implemented twice — here and in backend/src/workout_storage/stats.py —
  // and the shared fixture in recoveryParity.fixture.json carries the same cases for the Python
  // side. Until a review found it, nothing compared them, and the axial rule was paying a
  // stabiliser listing like a primary mover on both sides at once.
  it("pays a stabiliser a quarter of a set, not half and not a full one", async () => {
    const today = daysAgoIso(0);
    mockApi([{ id: "s1", date: today, exercise: "bench", sets: 4 }]);
    const res = await fetchMuscleVolume("week");
    const by = Object.fromEntries(res.muscles.map((m) => [m.muscle, m.sets]));
    expect(by.chest).toBe(4);
    expect(by.triceps).toBe(2);
    expect(by.upper_back).toBe(1);
  });

  it("does not promote a stabiliser erector listing to a full set on a hinge", async () => {
    const today = daysAgoIso(0);
    mockApi([{ id: "s1", date: today, exercise: "kickback", sets: 4 }]);
    const res = await fetchMuscleVolume("week");
    const by = Object.fromEntries(res.muscles.map((m) => [m.muscle, m.sets]));
    expect(by.glutes).toBe(4);
    expect(by.lower_back).toBe(1);
    const erectors = res.muscles.find((m) => m.muscle === "lower_back");
    expect(erectors!.load).toBeLessThan(0.2);
  });

  it("gives mobility and cardio no load at all", async () => {
    const today = daysAgoIso(0);
    mockApi([
      { id: "s1", date: today, exercise: "cat_cow", sets: 3 },
      { id: "s2", date: today, exercise: "treadmill", sets: 2 },
    ]);
    const res = await fetchMuscleVolume("week");
    expect(res.muscles).toEqual([]);
  });
});
