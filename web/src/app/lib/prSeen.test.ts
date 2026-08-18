import { beforeEach, describe, expect, it } from "vitest";
import { findNewPRs, getSeenPRDates, hasSeenAnyPRs, markPRsSeen } from "./prSeen";
import type { PersonalRecord } from "../data/workouts";

function pr(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    exerciseId: "bench",
    exerciseName: "Bench Press",
    weight: 100,
    reps: 1,
    date: "2026-07-15",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("getSeenPRDates", () => {
  it("returns an empty object when nothing is stored", () => {
    expect(getSeenPRDates()).toEqual({});
  });

  it("returns an empty object on corrupt (non-JSON) stored data, not a crash", () => {
    localStorage.setItem("ws_pr_seen", "not json{{{");
    expect(getSeenPRDates()).toEqual({});
  });
});

describe("hasSeenAnyPRs", () => {
  it("is false before anything is ever recorded", () => {
    expect(hasSeenAnyPRs()).toBe(false);
  });

  it("is true once markPRsSeen has run, even for an empty list", () => {
    markPRsSeen([]);
    expect(hasSeenAnyPRs()).toBe(true);
  });
});

describe("findNewPRs", () => {
  it("treats a PR with no entry in the seen map as new", () => {
    const result = findNewPRs([pr()], {});
    expect(result).toEqual([pr()]);
  });

  it("treats a PR dated strictly after the seen entry as new", () => {
    const result = findNewPRs([pr({ date: "2026-07-20" })], { bench: "2026-07-15" });
    expect(result).toHaveLength(1);
  });

  it("excludes a PR dated on or before the seen entry", () => {
    expect(findNewPRs([pr({ date: "2026-07-15" })], { bench: "2026-07-15" })).toEqual([]);
    expect(findNewPRs([pr({ date: "2026-07-10" })], { bench: "2026-07-15" })).toEqual([]);
  });

  it("classifies each exercise independently — one new, one already seen, in the same call", () => {
    const prs = [
      pr({ exerciseId: "bench", date: "2026-07-20" }),
      pr({ exerciseId: "squat", date: "2026-07-01" }),
    ];
    const seen = { bench: "2026-07-15", squat: "2026-07-01" };
    const result = findNewPRs(prs, seen);
    expect(result).toHaveLength(1);
    expect(result[0].exerciseId).toBe("bench");
  });
});

describe("markPRsSeen", () => {
  it("merges without clobbering unrelated existing entries", () => {
    markPRsSeen([pr({ exerciseId: "squat", date: "2026-07-01" })]);
    markPRsSeen([pr({ exerciseId: "bench", date: "2026-07-20" })]);
    expect(getSeenPRDates()).toEqual({ squat: "2026-07-01", bench: "2026-07-20" });
  });

  it("overwrites an exercise's own prior seen date", () => {
    markPRsSeen([pr({ exerciseId: "bench", date: "2026-07-01" })]);
    markPRsSeen([pr({ exerciseId: "bench", date: "2026-07-20" })]);
    expect(getSeenPRDates()).toEqual({ bench: "2026-07-20" });
  });
});

describe("first-run behavior (the orchestration Home.tsx is expected to follow)", () => {
  it("would not report every existing PR as new on a brand-new browser if seeded via hasSeenAnyPRs first", () => {
    // This is the contract Home.tsx's effect relies on: check hasSeenAnyPRs() before ever
    // calling findNewPRs for real, and if false, seed via markPRsSeen with no celebration.
    const prs = [pr({ exerciseId: "bench" }), pr({ exerciseId: "squat" })];
    expect(hasSeenAnyPRs()).toBe(false);
    if (!hasSeenAnyPRs()) {
      markPRsSeen(prs);
    }
    // A second "visit" with the same data now reports nothing as new.
    expect(findNewPRs(prs, getSeenPRDates())).toEqual([]);
  });
});
