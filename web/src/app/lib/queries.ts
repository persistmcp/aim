// React Query hooks. Each fetches an API endpoint and adapts it to a domain type.

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  Adherence,
  Connection,
  ExerciseInfo,
  ExerciseOption,
  Goal,
  Me,
  PersonalRecord,
  Profile,
  Summary,
} from "../data/workouts";
import * as A from "./adapter";
import { ApiError, apiGet } from "./api";
import { fetchMuscleVolume } from "./muscleVolume";
import { fetchMuscleBreakdown } from "./muscleBreakdown";

const STALE = 60_000; // 1 min

export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me"), staleTime: STALE });

export const useSummary = () =>
  useQuery({ queryKey: ["summary"], queryFn: () => apiGet<Summary>("/summary"), staleTime: STALE });

export const useAdherence = () =>
  useQuery({
    queryKey: ["adherence"],
    queryFn: () => apiGet<Adherence>("/adherence"),
    staleTime: STALE,
  });

export const useProfile = () =>
  useQuery({
    queryKey: ["profile"],
    queryFn: () => apiGet<Profile>("/profile"),
    staleTime: STALE,
  });

// Goals incl. history. Home fetches this unconditionally on purpose (it needs the past-goal
// count up front to decide whether the history nav row renders at all, and the shared query key
// primes GoalHistory's cache); `enabled` stays for callers that do want to defer.
export const useGoals = (status: "all" | "active" = "all", enabled = true) =>
  useQuery({
    queryKey: ["goals", status],
    queryFn: () => apiGet<Goal[]>("/goals", { status }),
    enabled,
    staleTime: STALE,
  });

// Polls every 5s while not yet connected (confirming the just-pasted MCP URL works is the point
// of this screen) and stops once a tool call has been seen — no point polling forever after.
export const useConnection = () =>
  useQuery({
    queryKey: ["connection"],
    queryFn: () => apiGet<Connection>("/connection"),
    refetchInterval: (query) => (query.state.data?.connected ? false : 5000),
  });

export const useSessions = (params?: { from?: string; to?: string; limit?: number }) =>
  useQuery({
    queryKey: ["sessions", params],
    queryFn: async () => (await apiGet<any[]>("/sessions", params)).map(A.toSessionSummary),
    staleTime: STALE,
  });

export const useSession = (id?: string) =>
  useQuery({
    queryKey: ["session", id],
    queryFn: async () => A.toSession(await apiGet<any>(`/sessions/${id}`)),
    enabled: !!id,
    staleTime: STALE,
  });

export const useExercises = () =>
  useQuery({
    queryKey: ["exercises"],
    queryFn: async () =>
      (await apiGet<any[]>("/exercises")).map((e): ExerciseOption => ({ id: e.id, name: e.name })),
    staleTime: STALE,
  });

// Full catalog keyed by exercise id — powers the "how to do it" expansion in the program view.
export const useExerciseCatalog = () => {
  // Pool technique text and names exist in five languages; the server picks by Accept-Language
  // unless asked. The browser header is not the user's choice — the language switcher is — so the
  // app states it explicitly, or a Russian-speaking user on an English browser reads English cues.
  const { i18n } = useTranslation();
  const locale = i18n.language.split("-")[0];
  return useQuery({
    queryKey: ["exercise-catalog", locale],
    queryFn: async () => {
      const list = (await apiGet<any[]>("/exercises", { locale })).map(A.toExerciseInfo);
      return new Map<string, ExerciseInfo>(list.map((e) => [e.id, e]));
    },
    staleTime: STALE,
  });
};

export const useProgram = () =>
  useQuery({
    queryKey: ["program"],
    // 404 means "no active program" — a normal state, not an error to retry or report.
    queryFn: async () => {
      try {
        return A.toProgram(await apiGet<any>("/program"));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    staleTime: STALE,
    retry: false,
  });

export const useProgression = (exerciseId?: string) =>
  useQuery({
    queryKey: ["progression", exerciseId],
    queryFn: async () => {
      const r = await apiGet<any>("/stats/progression", { exercise_id: exerciseId });
      return {
        chart: A.toProgressChart(r.progression),
        bestWeight: r.prs?.best_weight?.value as number | undefined,
        est1rm: r.prs?.best_est_1rm?.value as number | undefined,
        trendPct: (r.trend_pct ?? r.top_weight_trend_pct) as number | null,
      };
    },
    enabled: !!exerciseId,
    staleTime: STALE,
  });

export const useVolume = (bucket: "week" | "month", period?: string) =>
  useQuery({
    queryKey: ["volume", bucket, period],
    queryFn: async () => {
      const r = await apiGet<any>("/stats/volume", { bucket, period });
      return { chart: A.toVolumeChart(r.series), trendPct: r.trend_pct as number | null };
    },
    staleTime: STALE,
  });

export const usePRs = () =>
  useQuery({
    queryKey: ["prs"],
    queryFn: async () => (await apiGet<any[]>("/prs")).map(A.toPR) as PersonalRecord[],
    staleTime: STALE,
  });

// Lazily fetched only when the muscle detail sheet first opens (several round-trips behind it).
export const useMuscleBreakdown = (enabled: boolean) =>
  useQuery({
    queryKey: ["muscle-breakdown"],
    queryFn: fetchMuscleBreakdown,
    staleTime: STALE,
    enabled,
  });

export const useMuscleVolume = (period = "week") =>
  useQuery({
    queryKey: ["muscle-volume", period],
    queryFn: () => fetchMuscleVolume(period),
    staleTime: STALE,
    // Keep the previous period's figure on screen while the next loads (the client-side fallback
    // makes several round-trips, so a switch can take a few seconds).
    placeholderData: keepPreviousData,
  });

export const useBodyMetrics = (limit = 100) =>
  useQuery({
    queryKey: ["body-metrics", limit],
    queryFn: async () => (await apiGet<any[]>("/body-metrics", { limit })).map(A.toBodyMetric),
    staleTime: STALE,
  });
