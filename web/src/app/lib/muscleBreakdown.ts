// Per-muscle work log for the muscle detail sheet: which days still contributing load hit the
// muscle, through which exercises, with how many sets. Computed client-side from
// /exercises + /sessions + per-session details — the exact data path muscleVolume.ts's
// fallback already walks, so it works against any backend version (and in demo mode, whose
// apiGet serves the same shapes). The rolling window matches get_muscle_volume's, so the
// sheet always explains the number the section shows (calendar weeks made the whole panel
// reset to empty every Monday morning).

import {
  LOAD_WINDOW_DAYS,
  RECOVERED_BELOW,
  exerciseRecoveryMult,
  loadFade,
  referenceDose,
  setCreditMult,
} from "./muscle";
import { daysAgoIso, daysBetweenIso, todayIso } from "./localDate";
import { apiGet } from "./api";

export interface MuscleWorkEntry {
  date: string; // ISO day
  exerciseId: string;
  exerciseName: string;
  sets: number; // full sets for primary work, half for secondary, a quarter for tertiary
  /** Sets actually performed. What a person remembers doing — 3, not 0.8. */
  setsPerformed: number;
  reps: number; // direct (primary) reps only, 0 for assistance work
  secondary: boolean; // any indirect contribution — secondary OR tertiary
  /** What this work still contributes to the muscle's current load, after decay. */
  remaining: number;
}

const SECONDARY_WEIGHT = 0.5;
// Parity with stats._TERTIARY_WEIGHT / muscleVolume.TERTIARY_WEIGHT. The sheet must add up to the
// panel's number, so a tier the panel counts has to appear here too.
const TERTIARY_WEIGHT = 0.25;
// Parity: stats._NON_DOSING_CATEGORIES — the sheet must add up to the panel, so it skips the same
// categories the panel skips.
const NON_DOSING_CATEGORIES = new Set(["mobility", "cardio"]);
// The erectors are promoted to a full set on a hinge or squat (backend stats.py, muscleVolume.ts).
// Without the same rule here, the sheet explaining a deadlift's load credited it 1.5 sets while the
// panel above it had counted 3 — the sheet is supposed to add up to the number it explains.
const AXIAL_PATTERNS = new Set(["hinge", "squat"]);
const AXIAL_MUSCLE = "lower_back";

export async function fetchMuscleBreakdown(): Promise<Record<string, MuscleWorkEntry[]>> {
  // Spans the LOAD window, not the set-count week: the sheet's headline is the current load, and
  // load can come from work older than a week. Covering only 7 days produced a sheet that said
  // "62% loaded" above "no sets in the last 7 days".
  // Local, not toISOString(): a UTC-serialized local date drops or adds a day at the window edge.
  const sinceIso = daysAgoIso(LOAD_WINDOW_DAYS - 1);

  const [exercises, sessions] = await Promise.all([
    apiGet<any[]>("/exercises"),
    apiGet<any[]>("/sessions", { limit: 100 }),
  ]);

  const exInfo: Record<
    string,
    {
      name: string;
      primary: string[];
      secondary: string[];
      tertiary: string[];
      category?: string;
      pattern?: string;
      longLength?: boolean;
    }
  > = {};
  for (const e of exercises) {
    exInfo[e.id] = {
      name: e.name ?? e.id,
      category: e.category ?? undefined,
      pattern: e.movement_pattern ?? undefined,
      longLength: e.long_length ?? undefined,
      primary: e.primary_muscles ?? [],
      secondary: e.secondary_muscles ?? [],
      tertiary: e.tertiary_muscles ?? [],
    };
  }

  const today = todayIso();
  const recent = sessions.filter((s) => s.date >= sinceIso && s.date <= today);
  const details = await Promise.all(recent.map((s) => apiGet<any>(`/sessions/${s.id}`)));

  // muscle → "date|exercise|secondary" → accumulated entry
  const acc: Record<string, Record<string, MuscleWorkEntry>> = {};
  const add = (
    muscle: string,
    date: string,
    exerciseId: string,
    sets: number,
    reps: number,
    secondary: boolean,
    remaining: number,
  ) => {
    const byKey = (acc[muscle] ??= {});
    const key = `${date}|${exerciseId}|${secondary}`;
    const cur = (byKey[key] ??= {
      date,
      exerciseId,
      exerciseName: exInfo[exerciseId]?.name ?? exerciseId,
      sets: 0,
      setsPerformed: 0,
      reps: 0,
      secondary,
      remaining: 0,
    });
    cur.sets += sets;
    cur.setsPerformed += 1;
    cur.reps += reps;
    cur.remaining += remaining;
  };

  for (const d of details) {
    const date = String(d.date ?? "").slice(0, 10);
    for (const entry of d.entries ?? []) {
      const info = exInfo[entry.exercise_id] ?? {
        name: entry.exercise_id,
        primary: [],
        secondary: [],
        tertiary: [],
      };
      const axial = info.pattern != null && AXIAL_PATTERNS.has(info.pattern);
      const weightFor = (mu: string, tier: number) =>
        axial && mu === AXIAL_MUSCLE && tier < 2
          ? 1
          : tier === 1
            ? SECONDARY_WEIGHT
            : TERTIARY_WEIGHT;
      if (info.category && NON_DOSING_CATEGORIES.has(info.category)) continue;
      const ageHours = daysBetweenIso(date, today) * 24;
      const exerciseMult = exerciseRecoveryMult(
        info.category,
        info.pattern,
        info.primary.length + info.secondary.length + info.tertiary.length,
        info.longLength,
      );
      for (const st of entry.sets ?? []) {
        if ((st.type ?? "working") === "warmup") continue;
        const reps = Number(st.reps ?? 0);
        const toFailure =
          st.rir != null ? Number(st.rir) <= 0.5 : st.rpe != null && Number(st.rpe) >= 9.5;
        const intensity = setCreditMult(reps, st.rir, st.rpe);
        // What this set still contributes TODAY — the same decay the panel above paints with, so
        // the list can drop work the figure has already forgotten.
        const left = (mu: string, weight: number) =>
          weight * intensity * loadFade(mu, ageHours, { exerciseMult, toFailure });
        for (const mu of info.primary)
          add(mu, date, entry.exercise_id, 1, reps, false, left(mu, 1));
        for (const mu of info.secondary) {
          if (info.primary.includes(mu)) continue;
          const w = weightFor(mu, 1);
          add(mu, date, entry.exercise_id, w, 0, true, left(mu, w));
        }
        for (const mu of info.tertiary) {
          if (info.primary.includes(mu) || info.secondary.includes(mu)) continue;
          const w = weightFor(mu, 2);
          add(mu, date, entry.exercise_id, w, 0, true, left(mu, w));
        }
      }
    }
  }

  const out: Record<string, MuscleWorkEntry[]> = {};
  for (const [muscle, byKey] of Object.entries(acc)) {
    // Only work the figure is still painting. The window this list scans is 13 days, but a set's
    // credit decays inside it: a plank from a fortnight ago contributes nothing to today's abs and
    // listing it under a muscle the panel calls clear reads as a bug. The cut is the panel's own
    // "recovered" line — below it, that work no longer moves the picture.
    const floor = RECOVERED_BELOW * referenceDose(muscle);
    out[muscle] = Object.values(byKey)
      .filter((e) => e.remaining >= floor)
      .map((e) => ({ ...e, sets: Math.round(e.sets * 10) / 10 }))
      // Newest day first; within a day, direct work before indirect, then by volume.
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          Number(a.secondary) - Number(b.secondary) ||
          b.sets - a.sets,
      );
  }
  return out;
}
