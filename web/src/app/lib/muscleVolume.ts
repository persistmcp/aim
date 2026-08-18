// Working-sets-per-muscle over a rolling window, plus each muscle's current decayed load — the
// two numbers the Home muscle panel shows (volume in the rows, load in the heat). Prefers the
// server endpoint (/stats/muscle-volume); if that route isn't deployed yet, or predates the
// `load` field, it derives the same numbers on the client from /exercises + recent /sessions, so
// the feature works against any backend version. Mirrors stats.weekly_muscle_load and
// stats.current_muscle_load: primary muscles get a full set + full reps, secondary muscles get
// half of each, warmups excluded.

import { ApiError, apiGet } from "./api";
import { daysAgoIso, daysBetweenIso, todayIso } from "./localDate";
import {
  AXIAL_MUSCLE,
  AXIAL_PATTERNS,
  HALF_LIFE_DIVISOR,
  LOAD_WINDOW_DAYS,
  ROLLING_WINDOW_DAYS,
  exerciseRecoveryMult,
  hoursUntilRecovered,
  loadFade,
  normalizeLoad,
  recoveryHoursFor,
  setCreditMult,
} from "./muscle";
import { reportError } from "./telemetry";

export interface MuscleStat {
  muscle: string;
  sets: number;
  reps: number;
  hardSets: number;
  /** Current decayed load, 0 (recovered) → 1 (one hard session's worth, fresh). */
  load: number;
  /** Hours until this muscle reads as recovered; 0 if it already does. Solved server-side from
   * the same per-set windows that produced `load`, so the row's countdown can never disagree with
   * its own bar — computing it from the muscle's base window understated a first-ever hinge to
   * failure by nearly six days. */
  readyInH: number;
}

export interface MuscleVolume {
  totalSets: number;
  maxSets: number;
  muscles: MuscleStat[];
}

const WINDOW_DAYS: Record<string, number> = {
  week: 7,
  "1m": 30,
  month: 30,
  "3m": 90,
  "6m": 180,
  year: 365,
};

const SECONDARY_WEIGHT = 0.5;
// Stabilisers / minor assistance, spelled out by the curated exercise pool. Quarter credit, so
// worked tissue stops reading as untouched without four such listings adding up to a directly
// trained muscle. Parity: stats._TERTIARY_WEIGHT.
const TERTIARY_WEIGHT = 0.25;
// Parity: stats._NON_DOSING_CATEGORIES. Mobility drills name the muscle they MOBILISE and cardio
// lists `full_body` on top of the legs it also names, so both deposited load that was never a
// resistance dose — a logged warm-up put the erectors at 43% with a three-day countdown.
const NON_DOSING_CATEGORIES = new Set(["mobility", "cardio"]);

export async function fetchMuscleVolume(period: string): Promise<MuscleVolume> {
  try {
    // The server clock is UTC; the decay is in days, so it has to be told which day it is HERE or
    // an evening session in the Americas comes back already a day old.
    const r = await apiGet<any>("/stats/muscle-volume", { period, today: todayIso() });
    // A deployment predating the decay model answers without `load`; the heatmap needs it, so
    // fall through to the client computation rather than painting every muscle as recovered.
    if (r && Array.isArray(r.muscles) && (r.muscles.length === 0 || "load" in r.muscles[0])) {
      return {
        totalSets: Number(r.total_sets ?? 0),
        maxSets: Number(r.max_sets ?? 0),
        muscles: r.muscles.map((m: any) => ({
          muscle: m.muscle,
          sets: Number(m.sets),
          reps: Number(m.reps),
          hardSets: Number(m.hard_sets ?? 0),
          load: Number(m.load ?? 0),
          readyInH: Number(m.ready_in_h ?? 0),
        })),
      };
    }
  } catch (err) {
    // Endpoint missing on this deployment (404) is the expected fallback case — stay silent.
    // Anything else is a real failure that would otherwise look like "slow", never "broken".
    if (!(err instanceof ApiError && err.status === 404)) {
      reportError(err, { source: "muscle-volume-fallback", period });
    }
  }
  return computeClientSide(period);
}

async function computeClientSide(period: string): Promise<MuscleVolume> {
  const today = todayIso();
  // Two windows, mirroring the server: sets are tallied over the rolling week (MEV/MAV are weekly
  // landmarks), while the decay reaches further back because stacked credits outlast a single
  // set's tail. For non-week periods the chart's own window governs both.
  const rolling = period === "week";
  const setsFrom = rolling
    ? daysAgoIso(ROLLING_WINDOW_DAYS - 1)
    : daysAgoIso(WINDOW_DAYS[period] ?? 7);
  const sinceIso = rolling ? daysAgoIso(LOAD_WINDOW_DAYS - 1) : setsFrom;

  const [exercises, sessions] = await Promise.all([
    apiGet<any[]>("/exercises"),
    apiGet<any[]>("/sessions", { limit: 100 }),
  ]);

  const muscleOf: Record<
    string,
    {
      primary: string[];
      secondary: string[];
      tertiary: string[];
      category?: string;
      pattern?: string;
      longLength?: boolean;
    }
  > = {};
  for (const e of exercises) {
    muscleOf[e.id] = {
      primary: e.primary_muscles ?? [],
      secondary: e.secondary_muscles ?? [],
      tertiary: e.tertiary_muscles ?? [],
      longLength: e.long_length ?? undefined,
      category: e.category ?? undefined,
      pattern: e.movement_pattern ?? undefined,
    };
  }

  // Upper bound too: a session dated in the future (an assistant pre-logging "next Saturday", or
  // a wrong device clock) ages to zero and would pin the muscle at full load indefinitely.
  const recent = sessions.filter((s) => s.date >= sinceIso && s.date <= today);
  const details = await Promise.all(recent.map((s) => apiGet<any>(`/sessions/${s.id}`)));

  const setsBy: Record<string, number> = {};
  const repsBy: Record<string, number> = {};
  const hardBy: Record<string, number> = {};
  // Per-set (remaining credit, half-life) so the fallback can solve time-to-ready the same way the
  // server does, rather than collapsing to a sum and guessing one half-life back out of it.
  const contribBy: Record<string, [number, number][]> = {};
  let total = 0;

  for (const d of details) {
    const day = String(d.date ?? "").slice(0, 10);
    if (!day) continue; // a session with no date can't be aged; counting it as fresh would lie
    // Session dates carry no time of day, so ages are whole days — today's work is fully fresh.
    const ageHours = daysBetweenIso(day, today) * 24;
    const inSetWindow = day >= setsFrom;
    for (const entry of d.entries ?? []) {
      const m = muscleOf[entry.exercise_id] ?? { primary: [], secondary: [], tertiary: [] };
      if (m.category && NON_DOSING_CATEGORIES.has(m.category)) continue;
      const exerciseMult = exerciseRecoveryMult(
        m.category,
        m.pattern,
        // Tertiary counts: the fallback asks how many muscles the lift claims to work.
        m.primary.length + m.secondary.length + m.tertiary.length,
        m.longLength,
      );
      for (const st of entry.sets ?? []) {
        if ((st.type ?? "working") === "warmup") continue;
        if (inSetWindow) total += 1;
        const reps = Number(st.reps ?? 0);
        // Effort where logged, RIR first; unlogged reads as sub-failure, since the modifier only
        // ever extends recovery and guessing "hard" would inflate everyone's map.
        const toFailure =
          st.rir != null ? Number(st.rir) <= 0.5 : st.rpe != null && Number(st.rpe) >= 9.5;
        const intensity = setCreditMult(reps, st.rir, st.rpe);
        // A muscle listed as both primary and secondary would otherwise be paid 1.5 sets for one.
        const secondaryOnly = m.secondary.filter((mu) => !m.primary.includes(mu));
        const tertiaryOnly = m.tertiary.filter(
          (mu) => !m.primary.includes(mu) && !m.secondary.includes(mu),
        );
        // Restricted to the two dosed tiers, matching stats._load_contributions: tier-blind, the
        // axial rule billed a cable glute kickback for the erectors as heavily as a 5x3 deadlift.
        const add = (mu: string, weight: number, dosedTier = true) => {
          const axial =
            dosedTier && mu === AXIAL_MUSCLE && m.pattern && AXIAL_PATTERNS.has(m.pattern)
              ? 1
              : weight;
          const halfLife = recoveryHoursFor(mu, { exerciseMult, toFailure }) / HALF_LIFE_DIVISOR;
          (contribBy[mu] ??= []).push([
            axial * intensity * loadFade(mu, ageHours, { exerciseMult, toFailure }),
            halfLife,
          ]);
        };
        for (const mu of m.primary) {
          if (inSetWindow) {
            setsBy[mu] = (setsBy[mu] ?? 0) + 1;
            repsBy[mu] = (repsBy[mu] ?? 0) + reps;
            hardBy[mu] = (hardBy[mu] ?? 0) + 1;
          }
          add(mu, 1);
        }
        for (const mu of secondaryOnly) {
          // Secondary muscles get half a set but no reps — reps count direct (primary) work only.
          if (inSetWindow) setsBy[mu] = (setsBy[mu] ?? 0) + SECONDARY_WEIGHT;
          add(mu, SECONDARY_WEIGHT);
        }
        for (const mu of tertiaryOnly) {
          if (inSetWindow) setsBy[mu] = (setsBy[mu] ?? 0) + TERTIARY_WEIGHT;
          add(mu, TERTIARY_WEIGHT, false);
        }
      }
    }
  }

  // Muscles keyed on either window: one still carrying load from older work belongs on the figure
  // even with zero sets this week, or the map would light a muscle the list never mentions.
  const muscles: MuscleStat[] = [...new Set([...Object.keys(setsBy), ...Object.keys(contribBy)])]
    .map((mu) => {
      const contribs = contribBy[mu] ?? [];
      return {
        muscle: mu,
        sets: Math.round((setsBy[mu] ?? 0) * 10) / 10,
        reps: Math.round(repsBy[mu] ?? 0),
        hardSets: hardBy[mu] ?? 0,
        load: normalizeLoad(
          mu,
          contribs.reduce((a, [c]) => a + c, 0),
        ),
        readyInH: hoursUntilRecovered(mu, contribs),
      };
    })
    .sort((a, b) => b.sets - a.sets || b.reps - a.reps);

  return {
    totalSets: total,
    maxSets: muscles.length ? Math.max(...muscles.map((m) => m.sets)) : 0,
    muscles,
  };
}
