// Dev/demo dataset. When the URL token starts with "demo", apiGet serves this generated data instead
// of hitting the backend — so the silhouette muscle map and every screen can be explored with rich,
// varied numbers and no login. Token picks a profile so you can see different load patterns:
//   /demo         — balanced full-body week
//   /demo-push    — push focus (chest / delts / triceps lit, back & legs cold)
//   /demo-pull    — pull focus (lats / upper-back / biceps lit)
//   /demo-legs    — leg day (quads / hams / glutes / calves maxed)
//   /demo-light   — deload week (everything low, mostly gray)
//   /demo-empty   — no training logged this week (empty state)

import { getToken } from "./token";
import { loadFade, normalizeLoad } from "./muscle";

// Demo figures are painted as if the last session was yesterday — recent enough that fast and slow
// muscles sit at visibly different points of their recovery, which is the whole point of the map.
const DEMO_LAST_SESSION_AGE_H = 24;

export const isDemo = () => getToken().startsWith("demo");
const profile = () => {
  const t = getToken();
  return t === "demo" ? "balanced" : t.replace(/^demo-?/, "") || "balanced";
};
// The one profile whose story is "nothing trained yet": every training-derived fixture must
// agree (history, pills, summary counts, PRs, progression, goals) — a lone empty muscle map
// next to "4 workouts this week" reads as a broken app, not an empty state.
const isEmptyProfile = () => profile() === "empty";

// Small deterministic PRNG so a given exercise/date always yields the same numbers.
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Weekly working sets per muscle group, per profile. 0 / missing → "skipped this week".
type Dist = Record<string, number>;
const PROFILES: Record<string, Dist> = {
  balanced: {
    chest: 17,
    lats: 15,
    upper_back: 12,
    traps: 9,
    front_delts: 8,
    side_delts: 13,
    rear_delts: 5,
    biceps: 11,
    triceps: 13,
    forearms: 4,
    abs: 9,
    obliques: 3,
    lower_back: 6,
    glutes: 12,
    quads: 20,
    adductors: 4,
    hamstrings: 10,
    calves: 7,
  },
  push: {
    chest: 22,
    upper_back: 2,
    front_delts: 16,
    side_delts: 18,
    rear_delts: 6,
    triceps: 20,
    abs: 8,
    quads: 3,
  },
  pull: {
    lats: 21,
    upper_back: 18,
    traps: 14,
    rear_delts: 12,
    biceps: 19,
    forearms: 9,
    lower_back: 7,
    abs: 6,
  },
  legs: {
    quads: 24,
    hamstrings: 18,
    glutes: 20,
    calves: 14,
    adductors: 9,
    abductors: 6,
    lower_back: 8,
    abs: 5,
  },
  light: {
    chest: 4,
    lats: 3,
    quads: 5,
    hamstrings: 2,
    side_delts: 3,
    biceps: 2,
    triceps: 3,
    abs: 4,
    calves: 2,
    glutes: 3,
  },
  empty: {},
};

function muscleVolume(period: string) {
  const dist = PROFILES[profile()] ?? PROFILES.balanced;
  const scale = period === "month" ? 3.6 : 1;
  const muscles = Object.entries(dist).map(([muscle, weekly]) => {
    const sets = Math.round(weekly * scale * 10) / 10;
    // Demo load: pretend a third of the week's sets landed in the most recent session and let
    // them decay by this muscle's own window, so the demo figure shows the same spread of heat a
    // real account does instead of one flat block of color.
    const load = normalizeLoad(muscle, (sets / 3) * loadFade(muscle, DEMO_LAST_SESSION_AGE_H));
    return {
      muscle,
      sets,
      reps: Math.round(sets * 9),
      hard_sets: Math.round(sets * 0.8),
      load,
    };
  });
  muscles.sort((a, b) => b.sets - a.sets);
  return {
    total_sets: muscles.reduce((s, m) => s + m.sets, 0),
    max_sets: muscles.length ? Math.max(...muscles.map((m) => m.sets)) : 0,
    muscles,
  };
}

// ── Exercise catalog (our taxonomy keys as primary/secondary muscles) ──────────────────────────
const EXERCISES = [
  {
    id: "squat",
    name: "Приседания со штангой",
    primary: ["quads"],
    secondary: ["glutes", "adductors"],
    top: 140,
  },
  {
    id: "bench",
    name: "Жим лёжа",
    primary: ["chest"],
    secondary: ["triceps", "front_delts"],
    top: 110,
  },
  {
    id: "deadlift",
    name: "Становая тяга",
    primary: ["hamstrings"],
    secondary: ["glutes", "lower_back", "lats"],
    top: 180,
  },
  {
    id: "pullup",
    name: "Подтягивания",
    primary: ["lats"],
    secondary: ["biceps", "upper_back"],
    top: 30,
  },
  {
    id: "ohp",
    name: "Жим стоя",
    primary: ["front_delts"],
    secondary: ["side_delts", "triceps"],
    top: 65,
  },
  {
    id: "row",
    name: "Тяга штанги в наклоне",
    primary: ["upper_back"],
    secondary: ["lats", "rear_delts"],
    top: 95,
  },
  { id: "curl", name: "Подъём на бицепс", primary: ["biceps"], secondary: ["forearms"], top: 22 },
  { id: "skull", name: "Французский жим", primary: ["triceps"], secondary: [], top: 45 },
  { id: "legext", name: "Разгибание ног", primary: ["quads"], secondary: [], top: 80 },
  { id: "legcurl", name: "Сгибание ног", primary: ["hamstrings"], secondary: [], top: 70 },
  { id: "calf", name: "Подъём на носки", primary: ["calves"], secondary: [], top: 120 },
  { id: "lateral", name: "Махи гантелями", primary: ["side_delts"], secondary: [], top: 16 },
];

const exercisesPayload = () =>
  EXERCISES.map((e) => ({
    id: e.id,
    name: e.name,
    primary_muscles: e.primary,
    secondary_muscles: e.secondary,
    equipment: ["штанга"],
    instructions: "Демо-описание техники упражнения.",
  }));

function progression(exerciseId?: string) {
  if (isEmptyProfile()) return { progression: [], prs: {}, trend_pct: null };
  const ex = EXERCISES.find((e) => e.id === exerciseId) ?? EXERCISES[0];
  const rnd = seeded(ex.id);
  const points = 16;
  const start = ex.top * 0.78;
  const series = Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const w =
      Math.round((start + (ex.top - start) * t + (rnd() - 0.5) * ex.top * 0.04) / 2.5) * 2.5;
    const d = new Date(Date.now() - (points - 1 - i) * 7 * 86_400_000);
    return {
      date: d.toISOString().slice(0, 10),
      top_weight: w,
      best_est_1rm: Math.round(w * 1.18),
    };
  });
  const best = Math.max(...series.map((p) => p.top_weight));
  return {
    progression: series,
    prs: { best_weight: { value: best }, best_est_1rm: { value: Math.round(best * 1.18) } },
    trend_pct:
      Math.round((series[points - 1].top_weight / series[0].top_weight - 1) * 100 * 10) / 10,
  };
}

const prsPayload = () =>
  isEmptyProfile()
    ? []
    : EXERCISES.map((e, i) => {
        const rnd = seeded(e.id + "pr");
        const reps = 1 + Math.floor(rnd() * 5);
        return {
          exercise_id: e.id,
          exercise_name: e.name,
          weight: e.top,
          reps,
          est_1rm: Math.round(e.top * (1 + reps / 30)),
          date: new Date(Date.now() - (i * 9 + 3) * 86_400_000).toISOString().slice(0, 10),
        };
      });

// ── Sessions over ~6 months (PPL rotation) ─────────────────────────────────────────────────────
const DAY_LABELS = ["Push", "Pull", "Legs"];
function sessions() {
  if (isEmptyProfile()) return [];
  const out: any[] = [];
  const rnd = seeded("sessions" + profile());
  let cursor = Date.now();
  for (let i = 0; i < 56; i++) {
    // ~4 sessions/week with jitter.
    cursor -= (1 + Math.floor(rnd() * 2)) * 86_400_000 + (i % 7 === 0 ? 86_400_000 : 0);
    const date = new Date(cursor).toISOString().slice(0, 10);
    out.push({
      id: `s${i}`,
      date,
      day_label: DAY_LABELS[i % 3],
      start_time: "18:30",
      end_time: "19:45",
      duration_sec: 3600 + Math.floor(rnd() * 1800),
      total_volume_kg: 6000 + Math.floor(rnd() * 7000),
      session_rpe: 6 + Math.floor(rnd() * 4),
      bodyweight_kg: 80,
      status: "completed",
      tags: [],
    });
  }
  return out;
}

function sessionDetail(id: string) {
  const base = sessions().find((s) => s.id === id) ?? sessions()[0];
  const rnd = seeded(id);
  const picks = EXERCISES.filter(() => rnd() > 0.45).slice(0, 5);
  return {
    ...base,
    metrics: { strain: 12 + Math.floor(rnd() * 6), muscular_load_pct: 60 + Math.floor(rnd() * 30) },
    notes: "Демо-тренировка.",
    cardio: [],
    entries: picks.map((e, idx) => ({
      id: `${id}-${e.id}`,
      exercise_id: e.id,
      exercise_name: e.name,
      sets: Array.from({ length: 3 + Math.floor(rnd() * 2) }, (_, s) => ({
        set_number: s + 1,
        weight_kg: Math.round((e.top * (0.7 + s * 0.05)) / 2.5) * 2.5,
        reps: 8 - s,
        rir: 2,
      })),
      superset_group: idx > 2 ? "A" : undefined,
    })),
  };
}

function bodyMetrics() {
  const rnd = seeded("body" + profile());
  return Array.from({ length: 24 }, (_, i) => {
    const date = new Date(Date.now() - i * 7 * 86_400_000).toISOString().slice(0, 10);
    const w = Math.round((82 - (24 - i) * 0.12 + (rnd() - 0.5)) * 10) / 10;
    return {
      date,
      bodyweight_kg: w,
      body_fat_pct: Math.round((18 - (24 - i) * 0.06) * 10) / 10,
      measurements: { chest_cm: 104, arm_cm: 39, waist_cm: 84, thigh_cm: 60 },
    };
  });
}

function program() {
  return {
    id: "demo-prog",
    name: "PPL · Демо",
    goal: "Гипертрофия",
    split_type: "push/pull/legs",
    frequency_per_week: 4,
    days: DAY_LABELS.map((name, i) => ({
      id: `d${i}`,
      name,
      focus: name,
      estimated_duration_min: 75,
      blocks: [
        {
          type: "straight",
          items: EXERCISES.slice(i * 3, i * 3 + 3).map((e) => ({
            exercise_id: e.id,
            target_sets: 4,
            target_reps: { min: 6, max: 10 },
            target_weight_kg: Math.round(e.top * 0.8),
          })),
        },
      ],
    })),
  };
}

function summary() {
  const mv = muscleVolume("week");
  return {
    workouts_this_week: adherenceDays().filter((d) => d.state === "done").length,
    volume_this_week: Math.round(mv.total_sets * 850),
    volume_change_pct: 8,
    bodyweight: 80,
  };
}

// Connected from the start — a demo visitor never actually pastes an MCP URL into an assistant,
// so there's no "waiting" state to demonstrate, and leaving this unhandled makes useConnection's
// refetchInterval poll forever (its stop condition, data?.connected, never becomes true against
// the unhandled `null` fallback below).
function connection() {
  return { connected: true, last_tool: "get_sessions", last_call_at: new Date().toISOString() };
}

// Format a Date as YYYY-MM-DD in LOCAL time. toISOString() serializes in UTC, which around
// midnight in any non-UTC timezone labels the wrong calendar day — for the pill row that shifts
// which pill reads "today" (and can serialize Monday's week start as Sunday).
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of the current week
  return d;
}

function weekStartIso() {
  return localIso(weekStartDate());
}

// The 7-day pill row, relative to the real current date so /demo always looks mid-story: past
// days trained up to the 4/week target (first ones done, extras rest), today outlined, the rest
// of the week dashed-future. Day count is derived, not hardcoded, so the header, the pills and
// the streak card's workouts number can never disagree on a given weekday.
function adherenceDays() {
  const start = weekStartDate();
  const todayIso = localIso(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = localIso(d);
    const state =
      iso === todayIso
        ? "today"
        : iso > todayIso
          ? "future"
          : i < 4 && !isEmptyProfile()
            ? "done"
            : "rest";
    return { date: iso, state } as const;
  });
}

function adherence() {
  // sessions_this_week is derived from the same pill row summary() reads, so the "N из 4"
  // header, the pills and the streak card always agree. Never "tense" in demo — the urgency cue
  // is not the mood a first-look showcase should open with.
  return {
    sessions_this_week: adherenceDays().filter((d) => d.state === "done").length,
    target_per_week: 4,
    week_start: weekStartIso(),
    days: adherenceDays(),
    tone: null,
  };
}

// The full goal set: one achieved milestone the featured goal grew out of (supersedes_goal_id),
// the featured weekly_volume goal itself, and the existing process/frequency goal — same three
// goal_type shapes (milestone/weekly_volume/frequency) a real hypertrophy user would have after a
// few months, so the featured-goal card, its history chain and GoalHistorySection are all
// explorable in /demo without a live backend.
function goalsPayload(): any[] {
  if (isEmptyProfile()) return [];
  return [
    {
      id: "demo-goal-old",
      kind: "performance",
      title: "Жим лёжа 100кг",
      target: { goal_type: "milestone", metric: "weight", exercise_id: "bench", value: 100 },
      status: "achieved",
      review_date: null,
      current: 100,
      progress_pct: 100,
      goal_type: "milestone",
      featured: false,
      supersedes_goal_id: null,
      // Closing-write timestamp — GoalHistory shows it as the "closed on" date.
      updated_at: "2026-06-28T10:00:00Z",
    },
    {
      id: "demo-goal-featured",
      kind: "outcome",
      title: "Держать грудь минимум на MEV каждую неделю",
      target: { goal_type: "weekly_volume", muscle: "chest", band: "mev" },
      status: "active",
      review_date: null,
      current: null,
      progress_pct: null,
      goal_type: "weekly_volume",
      featured: true,
      supersedes_goal_id: "demo-goal-old",
    },
    {
      id: "demo-goal-1",
      kind: "process",
      title: "4 тренировки в неделю",
      target: { metric: "sessions_per_week", value: 4 },
      status: "active",
      review_date: null,
      current: 4,
      progress_pct: 100,
      goal_type: "frequency",
      featured: false,
      supersedes_goal_id: null,
    },
  ];
}

// The featured goal, with the same rich weekly_bands envelope services._featured_goal_progress
// computes for a real weekly_volume goal — six weeks, zero-filled, no fabricated streak.
function featuredGoalPayload() {
  return {
    ...goalsPayload().find((g) => g.featured)!,
    progress: {
      type: "weekly_bands",
      muscle: "chest",
      band: "mev",
      current_status: "in_range",
      current_sets: 17,
      landmark: { mev: 8, mav: 20 },
      history: [
        { week: "2026-W20", sets: 12, status: "in_range" },
        { week: "2026-W21", sets: 6, status: "under" },
        { week: "2026-W22", sets: 15, status: "in_range" },
        { week: "2026-W23", sets: 0, status: "under" },
        { week: "2026-W24", sets: 18, status: "in_range" },
        { week: "2026-W25", sets: 17, status: "in_range" },
      ],
    },
  };
}

// Mirrors what GET /api/profile actually returns for a hypertrophy goal (services.py
// _GOAL_TILES/_GOAL_MODULES) — same tile/module keys, so Home renders identically to a real
// hypertrophy user instead of silently falling back to the pre-intake default in demo mode.
function profileConfig() {
  return {
    intake_status: "core_complete",
    primary_goal: "hypertrophy",
    locations: ["gym"],
    training_days_per_week: 4,
    focus_muscles: ["chest", "lats"],
    tiles: ["workouts_week", "volume_week", "bodyweight"],
    // Same order services._GOAL_MODULES["hypertrophy"] serves — adherence right after the goal
    // card, not buried under the program (demo had drifted from the backend here).
    modules: ["goal_progress", "adherence", "muscle_load", "program", "volume_trend"],
    metrics: { top_e1rm: null, bodyweight_delta_30d: null },
    goals: goalsPayload().filter((g) => g.status === "active"),
    featured_goal: isEmptyProfile() ? null : featuredGoalPayload(),
    // Level 6 of 6, and it has to be: replaying the seeded generator puts 14-17 distinct training
    // days in the 4-week window depending on the profile and on which day it is read, against the
    // `training_days_per_week: 4` stated above — ratio 0.875 (strength) to 1.06 (balanced), all of
    // which services._streak scores as the top band. Note how little room `strength` has: 0.015
    // above the 0.86 band edge, so anyone re-tuning _STREAK_BANDS upward moves the demo too.
    // The previous hardcoded 4 was picked to
    // look like "a good stretch, not a perfect-record trophy case", but it contradicted the very
    // data on the same card (16 lit ticks under a two-thirds flame). Holding your plan reading as
    // a full flame IS the message the scale now makes, so the demo should show it. Without this
    // key Home falls back to the pre-streak tile grid and never shows the hero widget at all; the
    // empty profile deliberately omits it, since a lit flame over zero logged training is exactly
    // the contradiction that profile exists to fix.
    streak: isEmptyProfile() ? null : { level: 6, basis: "behavioral", heat: 1.0 },
  };
}

// Route a demo request to the right generated payload.
export async function demoGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const p = path.replace(/^\//, "");
  let data: unknown;
  if (p === "me") data = { name: "Демо", program: "PPL · Демо" };
  else if (p === "summary") data = summary();
  else if (p === "profile") data = profileConfig();
  else if (p === "goals") data = goalsPayload();
  else if (p === "adherence") data = adherence();
  else if (p === "connection") data = connection();
  else if (p === "exercises") data = exercisesPayload();
  else if (p === "program") data = program();
  else if (p === "prs") data = prsPayload();
  else if (p === "body-metrics") data = bodyMetrics();
  else if (p === "sessions") data = sessions();
  else if (p.startsWith("sessions/")) data = sessionDetail(p.slice("sessions/".length));
  else if (p === "stats/muscle-volume") data = muscleVolume(String(params?.period ?? "week"));
  else if (p === "stats/progression") data = progression(params?.exercise_id);
  else if (p === "stats/volume") data = { series: [], trend_pct: null };
  else data = null;
  return data as T;
}
