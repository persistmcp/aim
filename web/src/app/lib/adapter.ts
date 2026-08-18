// Map API JSON (snake_case, nested) → the domain types the screens render. Keeping the mapping here
// means screens/components are untouched by the backend's shapes.

import type {
  BodyMetric,
  ChartPoint,
  Exercise,
  ExerciseInfo,
  PersonalRecord,
  Program,
  VolumePoint,
  WorkoutSession,
} from "../data/workouts";
import { bucketLabel, cardioLabel, mmss, minutes, shortDate, timeOf } from "./format";
import i18n from "../i18n";

const num = (v: any): number | undefined => (v == null ? undefined : Number(v));

export function toSessionSummary(s: any): WorkoutSession {
  return {
    id: s.id,
    dayName: s.day_label ?? i18n.t("defaultWorkout"),
    date: s.date,
    startTime: timeOf(s.start_time),
    endTime: timeOf(s.end_time),
    duration: minutes(s.duration_sec),
    totalVolume: Number(s.total_volume_kg ?? 0),
    rpe: num(s.session_rpe),
    energy: num(s.energy_level),
    bodyWeight: num(s.bodyweight_kg),
    status: s.status ?? "completed",
    tags: s.tags ?? [],
    exercises: [],
  };
}

export function toSession(s: any): WorkoutSession {
  const m = s.metrics ?? undefined;
  return {
    ...toSessionSummary(s),
    strain: num(m?.strain),
    maxHR: num(m?.max_hr),
    cardioLoad: num(m?.cardio_load_pct),
    muscularLoad: num(m?.muscular_load_pct),
    notes: s.notes ?? undefined,
    cardio: (s.cardio ?? []).map((c: any) => ({
      type: cardioLabel(c.type),
      distance: num(c.distance_m),
      duration: mmss(c.duration_sec),
      note: c.timing ?? undefined,
    })),
    exercises: (s.entries ?? []).map((e: any, i: number, all: any[]): Exercise => ({
      id: e.id,
      name: e.exercise_name ?? e.exercise_id,
      supersetGroup: e.superset_group ?? undefined,
      exerciseId: e.exercise_id,
      // 1-based count of same exercise_id entries up to and including this one — matches the
      // backend's own `order by position, id` ordering that update_set's occurrence offsets into.
      occurrence: all.slice(0, i + 1).filter((o) => o.exercise_id === e.exercise_id).length,
      sets: (e.sets ?? []).map((st: any) => ({
        setNumber: st.set_number,
        weight: num(st.weight_kg),
        reps: num(st.reps),
        duration: num(st.duration_sec),
        rir: num(st.rir),
        rpe: num(st.rpe),
        note: st.notes ?? undefined,
      })),
    })),
  };
}

export function toBodyMetric(b: any): BodyMetric {
  const meas = b.measurements ?? {};
  return {
    date: b.date,
    weight: num(b.bodyweight_kg),
    bodyFat: num(b.body_fat_pct),
    chest: num(meas.chest_cm),
    arm: num(meas.arm_cm),
    waist: num(meas.waist_cm),
    thigh: num(meas.thigh_cm),
  };
}

export function toPR(p: any): PersonalRecord {
  return {
    exerciseId: p.exercise_id,
    exerciseName: p.exercise_name,
    weight: Number(p.weight),
    reps: Number(p.reps),
    date: p.date,
    estimated1RM: num(p.est_1rm),
  };
}

export function toExerciseInfo(e: any): ExerciseInfo {
  return {
    id: e.id,
    name: e.name,
    instructions: e.instructions || undefined,
    videoUrl: e.video_url || undefined,
    imageUrls: e.image_urls ?? (e.image_url ? [e.image_url] : []),
    imageAttribution: e.image_attribution || undefined,
    imageStyle: e.image_style || undefined,
    doseUnit: e.dose_unit || undefined,
    primaryMuscles: e.primary_muscles ?? [],
    equipment: e.equipment ?? [],
  };
}

export function toProgram(p: any): Program {
  return {
    id: p.id,
    name: p.name,
    goal: p.goal || undefined,
    splitType: p.split_type || undefined,
    frequencyPerWeek: num(p.frequency_per_week),
    days: (p.days ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
      focus: d.focus || undefined,
      durationMin: num(d.estimated_duration_min),
      blocks: (d.blocks ?? []).map((b: any) => ({
        label: b.label || undefined,
        type: b.type ?? "straight",
        items: (b.items ?? []).map((it: any) => ({
          exerciseId: it.exercise_id,
          exerciseName: it.exercise_name || undefined,
          targetSets: num(it.target_sets),
          repMin: num(it.target_reps?.min),
          repMax: num(it.target_reps?.max),
          targetWeight: num(it.target_weight_kg),
          notes: it.notes || undefined,
        })),
      })),
    })),
  };
}

export function toProgressChart(progression: any[]): ChartPoint[] {
  return (progression ?? []).map((p) => ({
    date: shortDate(p.date),
    iso: p.date,
    topSet: Number(p.top_weight),
    estimated1RM: Number(p.best_est_1rm),
  }));
}

export function toVolumeChart(series: any[]): VolumePoint[] {
  return (series ?? []).map((p) => ({ label: bucketLabel(p.bucket), volume: Number(p.volume_kg) }));
}
