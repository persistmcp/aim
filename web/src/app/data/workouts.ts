// Domain types consumed by screens/components. Data now comes from the API via lib/adapter + hooks;
// the previous mock arrays were removed.

export interface WorkoutSet {
  setNumber: number;
  weight?: number;
  reps?: number;
  duration?: number;
  rir?: number;
  rpe?: number;
  note?: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: WorkoutSet[];
  supersetGroup?: string;
  category?: string;
  // Catalog slug + 1-based occurrence (when the same exercise appears twice in one session) —
  // together they're what PATCH /api/sets needs to locate a set server-side.
  exerciseId: string;
  occurrence: number;
}

export interface CardioActivity {
  type: string;
  distance?: number;
  duration: string;
  note?: string;
}

export interface WorkoutSession {
  id: string;
  dayName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number | null;
  totalVolume: number;
  rpe?: number;
  energy?: number;
  bodyWeight?: number;
  strain?: number;
  maxHR?: number;
  cardioLoad?: number;
  muscularLoad?: number;
  cardio?: CardioActivity[];
  exercises: Exercise[];
  notes?: string;
  tags?: string[];
  status: "completed" | "partial" | "skipped";
}

export interface BodyMetric {
  date: string;
  weight?: number;
  bodyFat?: number;
  chest?: number;
  arm?: number;
  waist?: number;
  thigh?: number;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  date: string;
  estimated1RM?: number;
}

export interface Me {
  id?: string;
  name?: string;
  goals?: string[];
  program?: string;
  current_weight?: number;
  current_body_fat?: number;
}

export interface Summary {
  workouts_this_week: number;
  volume_this_week: number;
  volume_change_pct: number | null;
  bodyweight?: number;
}

export interface AdherenceDay {
  date: string;
  state: "done" | "today" | "future" | "rest";
}

export interface Adherence {
  sessions_this_week: number;
  target_per_week: number | null;
  week_start: string;
  days: AdherenceDay[];
  // "tense" = behind target with ≤2 days left in the week — a warm urgency cue, never scolding.
  tone: "tense" | null;
}

export interface Connection {
  connected: boolean;
  last_tool: string | null;
  last_call_at: string | null;
}

// goal_type is an open string (not a closed union) for the same forward-compat reason as
// tiles/modules below — the backend can add a type without a frontend change breaking the build;
// FeaturedGoalCard falls back to a title-only render for anything it doesn't recognize.
export interface Goal {
  id: string;
  kind: "outcome" | "process" | "performance";
  title: string;
  target: Record<string, unknown> | null;
  status: string;
  review_date: string | null;
  current: number | null;
  progress_pct: number | null;
  goal_type: string;
  featured?: boolean;
  supersedes_goal_id?: string | null;
  // Last write timestamp — for a terminal goal that's the closing write, so GoalHistory shows
  // it as the "closed on" date.
  updated_at?: string | null;
}

// The discriminated shape of a goal's computed progress (services._goal_progress /
// _featured_goal_progress) — one union instead of a per-type prop drilling exercise.
export type GoalProgress =
  | { type: "bar"; pct: number }
  | {
      type: "weekly_bands";
      muscle: string;
      band: string;
      current_status: string | null;
      current_sets: number;
      landmark: { mev: number; mav: number } | null;
      history: { week: string; sets: number; status: string | null }[];
    }
  | {
      type: "trend";
      metric: string;
      exercise_id: string;
      direction: "up" | "down" | "flat" | null;
      trend_pct: number | null;
      series: { date: string; value: number }[];
    }
  | {
      type: "tolerance";
      baseline: number;
      current: number;
      tolerance_pct: number;
      drop_pct: number;
      status: "ok" | "warn";
      series: { date: string; value: number }[];
    };

export type FeaturedGoal = Goal & { progress: GoalProgress | null };

// Tile/module keys are open strings, not a closed union: the backend can add a new one (e.g. a
// future cardio tile) without a frontend type change breaking the build — unknown keys are
// filtered out at render time instead (graceful degradation, COACHING_PLAN.md §8.4).
export interface Profile {
  intake_status: string;
  primary_goal: string | null;
  locations: string[];
  training_days_per_week: number | null;
  focus_muscles: string[];
  tiles: string[];
  modules: string[];
  metrics: {
    top_e1rm: number | null;
    bodyweight_delta_30d: number | null;
  };
  goals: Goal[];
  featured_goal: FeaturedGoal | null;
  // Consistency level 0-6 from the fuel gauge (services._streak, docs/CONSISTENCY_FLAME.md):
  // each training day feeds the fire, the fire decays against the user's OWN cadence. `heat` is
  // the same score kept continuous over seven bands, 0..1 — render from it, never re-derive the
  // level from it. level 0 = the fire is out; level null = we do not know their rhythm yet
  // ("insufficient_data"), and Home falls back to the tile grid.
  streak: { level: number | null; basis: string; heat?: number | null } | null;
}

export interface ChartPoint {
  date: string; // formatted label
  iso: string; // raw ISO date, for period filtering
  topSet: number;
  estimated1RM: number;
}

export interface VolumePoint {
  label: string;
  volume: number;
}

export interface ExerciseOption {
  id: string;
  name: string;
}

// Full catalog entry, including the "how to do it" fields.
export interface ExerciseInfo {
  id: string;
  name: string;
  instructions?: string;
  videoUrl?: string;
  /** Start/end frames of the movement, served from the exercise pool. May be empty. */
  imageUrls: string[];
  imageAttribution?: string;
  /** "ink" (recolour per theme) or "photo" (show as-is, it has its own colours). */
  imageStyle?: string;
  /** What the rep range counts: "reps" | "seconds" | "minutes". Absent for custom exercises. */
  doseUnit?: string;
  primaryMuscles: string[];
  equipment: string[];
}

export interface ProgramItem {
  exerciseId: string;
  exerciseName?: string;
  targetSets?: number;
  repMin?: number;
  repMax?: number;
  targetWeight?: number;
  notes?: string;
}

export interface ProgramBlock {
  label?: string;
  type: string; // "superset" | "straight" | ...
  items: ProgramItem[];
}

export interface ProgramDay {
  id: string;
  name: string;
  focus?: string;
  durationMin?: number;
  blocks: ProgramBlock[];
}

export interface Program {
  id: string;
  name: string;
  goal?: string;
  splitType?: string;
  frequencyPerWeek?: number;
  days: ProgramDay[];
}
