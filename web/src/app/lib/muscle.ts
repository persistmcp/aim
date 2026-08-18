// Muscle taxonomy + weekly set-target helpers for the muscle-load panel.
// Backend reports the fine 27-group taxonomy (chest, upper_chest, lower_traps, …).
// Localized muscle names live in `muscleLabels.ts` (kept out of this file so it stays pure —
// no i18n/DOM imports — and testable in a plain node env).

// Per-muscle weekly hard-set volume landmarks, in working sets/week. Grounded in the Renaissance
// Periodization hypertrophy guides and Schoenfeld et al.'s dose-response meta-analyses (growth
// climbs steeply to ~10 sets, then diminishing returns toward ~20+):
//   mev — Minimum Effective Volume: below this a muscle barely grows (maintenance at best).
//   mav — top of the Maximum Adaptive Volume range: the ceiling of the productive/optimal zone;
//         past it you're into "recoverable but junk" territory (heading toward MRV).
// These differ a lot by muscle — big movers (chest, back, quads) tolerate/need more than small
// accessories (triceps, calves) — which is exactly why a flat 10–20 for everything was wrong.
// Sub-regions (upper_chest, rhomboids, …) fold into their parent group via LANDMARK_ALIAS below.
export const SET_LANDMARKS: Record<string, { mev: number; mav: number }> = {
  chest: { mev: 8, mav: 20 },
  lats: { mev: 8, mav: 20 },
  upper_back: { mev: 8, mav: 20 },
  traps: { mev: 6, mav: 20 },
  side_delts: { mev: 8, mav: 20 },
  front_delts: { mev: 6, mav: 12 }, // gets heavy indirect work from pressing → low direct need
  rear_delts: { mev: 6, mav: 18 },
  biceps: { mev: 6, mav: 16 },
  triceps: { mev: 6, mav: 14 },
  forearms: { mev: 4, mav: 14 },
  abs: { mev: 6, mav: 20 },
  obliques: { mev: 4, mav: 14 },
  quads: { mev: 8, mav: 18 },
  hamstrings: { mev: 6, mav: 16 },
  glutes: { mev: 4, mav: 16 },
  calves: { mev: 8, mav: 16 },
  lower_back: { mev: 4, mav: 12 }, // trained heavily as a synergist on most compounds
  adductors: { mev: 4, mav: 12 },
};

// Sub-region → parent group, so a muscle without its own landmark inherits its group's numbers.
const LANDMARK_ALIAS: Record<string, string> = {
  upper_chest: "chest",
  lower_chest: "chest",
  rhomboids: "upper_back",
  lower_traps: "traps",
  rotator_cuff: "rear_delts",
  abductors: "glutes",
};

const landmarksFor = (muscle: string) =>
  SET_LANDMARKS[muscle] ?? SET_LANDMARKS[LANDMARK_ALIAS[muscle]];

// Target range = [MEV, MAV] — the productive band. Kept in the old [low, high] shape so the status
// dot and "skipped" callout carry the same physiological anchors as the heat map.
export const SET_TARGET: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(SET_LANDMARKS).map(([m, l]) => [m, [l.mev, l.mav]]),
) as Record<string, [number, number]>;

// What the panel's SET COUNTS cover: a rolling "last 7 days, today inclusive" — NOT a calendar
// Mon–Sun week, which made every number (and the whole heatmap) reset to zero on Monday morning.
// Stays 7 because MEV/MAV landmarks are stated per week.
export const ROLLING_WINDOW_DAYS = 7;
// What the DECAY needs to see, which is strictly more: credits stack, so a big session sits above
// RECOVERED_BELOW far longer than any single set's tail. The server DERIVES this from its own
// constants (stats._load_window_days) precisely because a hardcoded guess went stale the moment a
// new multiplier landed; this mirror is parity-tested against it, so change it there first.
export const LOAD_WINDOW_DAYS = 13;

// ── Recovery kinetics ───────────────────────────────────────────────────────
// How long a hard session's work keeps loading each muscle — hours until the residual is
// effectively gone. Mirrors the server's source of truth (backend landmarks.py RECOVERY_HOURS,
// parity-guarded like SET_LANDMARKS); read that file for the full honesty note.
//
// Short version: this is a PRACTITIONER HEURISTIC, not a literature-derived table. No study
// measures time-to-recovery muscle by muscle, and the table does NOT follow the damage-magnitude
// ranking it once did — arms now sit below quads, on the argument that 48h between direct arm
// work is routine. The full account, including two withdrawn citations, is the honesty note in
// backend/src/workout_storage/landmarks.py; don't restate it here, it went stale once already.
export const RECOVERY_HOURS: Record<string, number> = {
  calves: 48,
  abs: 36,
  obliques: 36,
  forearms: 36,
  neck: 36,
  traps: 40,
  side_delts: 40,
  rear_delts: 40,
  quads: 48,
  front_delts: 60,
  glutes: 54,
  lats: 60,
  upper_back: 60,
  biceps: 42,
  triceps: 42,
  chest: 66,
  adductors: 66,
  hamstrings: 60,
  lower_back: 84,
};
const DEFAULT_RECOVERY_HOURS = 60;

// Exponential decay (the standard shape for training-load models, and how first-order biological
// clearance actually behaves); half-life = window / 4 leaves ~6% at the window's end.
export const HALF_LIFE_DIVISOR = 4;
// Per-set duration modifiers, mirroring backend landmarks.py — see there for the sourcing.
// Exercise type comes from the catalog's own `category` / `movement_pattern`, not from counting
// how many muscles a lift lists: the count disagrees with the stated category on hip thrusts and
// face pulls, and it survives only as the fallback for an uncatalogued exercise.
const STRETCHER_PATTERNS = new Set(["hinge", "lunge"]);
export const STRETCHER_RECOVERY_MULT = 1.2;
export const COMPOUND_RECOVERY_MULT = 1.05;
export const ISOLATION_RECOVERY_MULT = 0.85;
export const FAILURE_RECOVERY_MULT = 1.1;
// 2.5, matching the server: novelty (server-side, up to ×1.5) has to be able to stack with a
// long-length lift, and a 2.0 cap clipped exactly the case that most deserves a long window — a
// first-ever Romanian deadlift.
const MAX_RECOVERY_MULT = 2.5;
const SHORT_WINDOW_HOURS = 48;

/**
 * How much longer (or shorter) than the muscle's base window this exercise's work lingers.
 *
 * Must stay behaviourally identical to backend `landmarks.exercise_recovery_mult` — both run in
 * production (server endpoint, and this copy in demo mode and against older deployments), so a
 * missing branch here paints a different figure for the same training. `recoveryParity.fixture.json`
 * is asserted by both suites for exactly that reason.
 *
 * `longLength` — does the exercise load the muscle in a stretched position — is stated by the
 * catalogue per exercise and decides first. Inferring it from the movement pattern was wrong for a
 * third of the hinges: hip thrusts, glute bridges, kettlebell swings and rack pulls are all
 * `hinge`, and every one is defined by the absence of a loaded stretch. `undefined` means unstated
 * (a user-authored exercise), and only then does the old pattern inference apply.
 */
export function exerciseRecoveryMult(
  category: string | null | undefined,
  movementPattern: string | null | undefined,
  musclesInvolved: number,
  longLength?: boolean | null,
): number {
  if (longLength === true) return STRETCHER_RECOVERY_MULT;
  if (
    (longLength === undefined || longLength === null) &&
    movementPattern &&
    STRETCHER_PATTERNS.has(movementPattern)
  )
    return STRETCHER_RECOVERY_MULT;
  if (category === "compound") return COMPOUND_RECOVERY_MULT;
  // core is short-ROM, high-endurance work: it recovers like isolation even though a hanging leg
  // raise lists three muscles and would fool the muscle-count fallback.
  if (category === "isolation" || category === "core") return ISOLATION_RECOVERY_MULT;
  // Not resistance work; no damage premium either way.
  if (category === "cardio" || category === "mobility") return 1;
  // Uncatalogued: fall back to counting the muscles the lift claims to work.
  return musclesInvolved >= 3 ? COMPOUND_RECOVERY_MULT : 1;
}
// Below this a muscle reads as recovered — an exponential never reaches 0, and a permanent faint
// glow would say "never recovers".
export const RECOVERED_BELOW = 0.05;

// How much a single set deposits, before the muscle's credit weighting. Driven by reps because
// reps are always logged and effort almost never is (~0.3% of real sets carry RIR/RPE); effort
// overrides the rep guess where it exists. Mirrors backend landmarks.set_credit_mult.
export const HEAVY_REPS = 5;
export const HIGH_REPS = 15;
export const VERY_HIGH_REPS = 20;
export const HEAVY_SET_CREDIT = 1.15;
export const HIGH_REP_CREDIT = 0.9;
export const VERY_HIGH_REP_CREDIT = 0.8;
const EFFORT_CREDIT: [number, number][] = [
  [9.5, 1.3],
  [8.5, 1.15],
  [7.5, 1.0],
  [6.5, 0.85],
  [0, 0.7],
];

/** How heavily one set counts, from how it was actually performed. */
export function setCreditMult(
  reps: number | null | undefined,
  rir?: number | null,
  rpe?: number | null,
): number {
  const effort = rir != null ? 10 - rir : rpe;
  if (effort != null) {
    for (const [threshold, credit] of EFFORT_CREDIT) if (effort >= threshold) return credit;
  }
  if (!reps) return 1;
  if (reps <= HEAVY_REPS) return HEAVY_SET_CREDIT;
  if (reps > VERY_HIGH_REPS) return VERY_HIGH_REP_CREDIT;
  if (reps >= HIGH_REPS) return HIGH_REP_CREDIT;
  return 1;
}

// The erectors carry the bar on every hinge and back-loaded squat — a shared axial budget, not a
// synergist. Full credit there, with a dose raised to match. Mirrors backend AXIAL_* constants.
export const AXIAL_PATTERNS = new Set(["hinge", "squat"]);
export const AXIAL_MUSCLE = "lower_back";
export const AXIAL_REFERENCE_DOSE = 7;

/** Hours a set keeps loading `muscle`, resolving sub-regions to their parent group.
 *
 * No novelty (repeated-bout) term here, unlike the server: it needs six months of training history
 * per muscle and movement, which this path — the fallback for demo mode and pre-decay deployments
 * — would have to pull one session at a time. Those callers therefore see every muscle as fully
 * accustomed, i.e. slightly shorter windows for genuinely novel work. Documented rather than
 * silently divergent; the real endpoint carries the term. */
export function recoveryHoursFor(
  muscle: string,
  { exerciseMult = 1, toFailure = false } = {},
): number {
  const base =
    RECOVERY_HOURS[muscle] ?? RECOVERY_HOURS[LANDMARK_ALIAS[muscle]] ?? DEFAULT_RECOVERY_HOURS;
  const mult = exerciseMult * (toFailure ? FAILURE_RECOVERY_MULT : 1);
  const hours = base * Math.min(mult, MAX_RECOVERY_MULT);
  // A discount may shorten a long window, not an already-short one: applied to arms at 42h the
  // isolation multiplier left 35.7h, one intermediate reading before the bar went dark.
  return base <= SHORT_WINDOW_HOURS ? Math.max(hours, base) : hours;
}

/** A set's remaining load credit after `ageHours` — 1 fresh, fading toward 0 as it recovers. */
export function loadFade(muscle: string, ageHours: number, opts = {}): number {
  const halfLife = recoveryHoursFor(muscle, opts) / HALF_LIFE_DIVISOR;
  return 0.5 ** (Math.max(0, ageHours) / halfLife);
}

// Reference "fully loaded" dose: one hard session's worth of sets for this muscle — a third of its
// weekly MAV (spread over 2–3 sessions plus indirect work), floored at 5, which lands on the 5–6
// hard sets the recovery literature uses as its reference session.
const MIN_REFERENCE_DOSE = 5;
const DEFAULT_REFERENCE_DOSE = 6;

export function referenceDose(muscle: string): number {
  if (muscle === AXIAL_MUSCLE) return AXIAL_REFERENCE_DOSE;
  const lm = landmarksFor(muscle);
  return lm ? Math.max(MIN_REFERENCE_DOSE, lm.mav / 3) : DEFAULT_REFERENCE_DOSE;
}

/**
 * Hours until a muscle's summed load falls under RECOVERED_BELOW, from the per-set
 * (remaining credit, half-life) pairs that produced that load.
 *
 * Solved numerically: the total is a sum of exponentials with DIFFERENT half-lives (a squat set
 * and a curl set on the same muscle decay at different rates), which has no closed form. Monotone
 * decreasing, so bisection is exact. Mirrors backend stats.hours_until_recovered — deriving this
 * from the muscle's *base* window instead, as an earlier version did, told users a first-ever
 * hinge to failure was clear in ~4 days while the bar stayed lit for ~9.
 */
export function hoursUntilRecovered(muscle: string, contributions: [number, number][]): number {
  if (!contributions.length) return 0;
  const at = (t: number) =>
    normalizeLoad(
      muscle,
      contributions.reduce((sum, [credit, halfLife]) => sum + credit * 0.5 ** (t / halfLife), 0),
    );
  if (at(0) < RECOVERED_BELOW) return 0;
  let lo = 0;
  let hi = LOAD_WINDOW_DAYS * 24;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= RECOVERED_BELOW) lo = mid;
    else hi = mid;
  }
  return Math.round(hi * 10) / 10;
}

/** Summed remaining set credit → the 0..1 load the heatmap paints; below RECOVERED_BELOW the
 * muscle is fully recovered and reads as 0. Server parity: stats.current_muscle_load. */
export function normalizeLoad(muscle: string, remainingCredit: number): number {
  const load = Math.round(Math.min(1, remainingCredit / referenceDose(muscle)) * 1000) / 1000;
  return load >= RECOVERED_BELOW ? load : 0;
}

/**
 * Display transform from load (0..1) to a position on the color ramp. Exponential decay puts most
 * real values in the bottom third — painted raw, a whole training week would render in two or
 * three near-identical dim shades. The square root spreads those low values across the ramp
 * without reordering anything, so a day-old session and a three-day-old one are visibly different
 * colors. Display only: every number shown to the user stays the untransformed load.
 */
export function loadHeat(load: number): number {
  // Guards NaN/undefined too (a cached response from before the decay model carries no `load`) —
  // NaN would propagate into the gradient index and blank the whole panel.
  if (!(load > 0)) return 0;
  // Rescale so the LOWEST paintable load sits at the ramp's first stop. Without this the bottom
  // ~22% of the gradient is unreachable — nothing under RECOVERED_BELOW is ever drawn — and a
  // fifth of the colours we carefully picked would never appear on screen.
  const floor = Math.sqrt(RECOVERED_BELOW);
  return Math.max(0, (Math.sqrt(Math.min(1, load)) - floor) / (1 - floor));
}

// Shared status color language for goal cards (FeaturedGoalCard's weekly_volume/maintenance
// types) — same amber/green/orange vocabulary as the muscle load panel's own STATUS_COLOR, keyed
// by the server's status strings (services._weekly_muscle_history / _featured_goal_progress)
// instead of duplicating a second palette. References theme.css's --status-* tokens (not raw
// hex) so light theme gets its own WCAG-passing shades — the dark-theme hexes these used to be
// hardcoded to sit at ~2:1 contrast against a light card, under the 3:1 non-text minimum.
export const GOAL_STATUS_COLOR: Record<string, string> = {
  under: "var(--status-caution)",
  in_range: "var(--status-good)",
  over: "var(--status-over)",
  ok: "var(--status-good)",
  warn: "var(--status-caution)",
};

export type LoadStatus = "low" | "ok" | "high";

/** Where a muscle's weekly sets fall vs its target — or null if the muscle isn't a tracked group. */
export function setStatus(muscle: string, sets: number): LoadStatus | null {
  const t = SET_TARGET[muscle];
  if (!t) return null;
  if (sets < t[0]) return "low";
  if (sets > t[1]) return "high";
  return "ok";
}

// Big trainable groups for the "skipped this week" callout. A group counts as trained if ANY of its
// member muscles got work — so hitting lower_traps still credits "back", avoiding false alarms.
// `key` is a stable i18n key (translated in muscles:group.<key>), not a display label.
const SKIP_GROUPS: { key: string; members: string[] }[] = [
  { key: "chest", members: ["chest", "upper_chest", "lower_chest"] },
  { key: "back", members: ["lats", "upper_back", "rhomboids", "lower_traps", "traps"] },
  { key: "shoulders", members: ["front_delts", "side_delts", "rear_delts"] },
  { key: "biceps", members: ["biceps"] },
  { key: "triceps", members: ["triceps"] },
  { key: "abs", members: ["abs", "obliques"] },
  { key: "quads", members: ["quads"] },
  { key: "hamstrings", members: ["hamstrings"] },
  { key: "glutes", members: ["glutes"] },
  { key: "calves", members: ["calves"] },
];

const skipGroupKeyFor = (muscle: string) =>
  SKIP_GROUPS.find((g) => g.members.includes(muscle))?.key;

/** i18n keys of big muscle groups with zero sets this period — "you skipped these". A skipped
 * group containing one of the user's `focus_muscles` (COACHING_PLAN.md §8.2) sorts first: missing
 * a muscle you specifically said you care about is more actionable than a generic gap. */
export function skippedGroups(workedKeys: Set<string>, focusMuscles: string[] = []): string[] {
  const priority = new Set(
    focusMuscles.map(skipGroupKeyFor).filter((k): k is string => k !== undefined),
  );
  const skipped = SKIP_GROUPS.filter((g) => !g.members.some((m) => workedKeys.has(m))).map(
    (g) => g.key,
  );
  return [...skipped.filter((k) => priority.has(k)), ...skipped.filter((k) => !priority.has(k))];
}

/** Rows for a focus muscle sort first (stable otherwise) — so the user's stated priorities are
 * visible on the list without scrolling, matching the map's focus badge. */
export function prioritizeFocus<T extends { muscle: string }>(
  rows: T[],
  focusMuscles: string[],
): T[] {
  if (focusMuscles.length === 0) return rows;
  const focus = new Set(focusMuscles);
  return [...rows].sort((a, b) => Number(focus.has(b.muscle)) - Number(focus.has(a.muscle)));
}
