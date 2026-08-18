import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrendingDown, TrendingUp, Trophy } from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PeriodToggle } from "../components/PeriodToggle";
import { parseLocalDay } from "../lib/localDate";
import { ErrorState, Loading } from "../components/States";
import { Card } from "../components/ui/card";
import type { BodyMetric } from "../data/workouts";
import { shortDate } from "../lib/format";
import i18n from "../i18n";
import { useBodyMetrics, useExercises, usePRs, useProgression, useSessions } from "../lib/queries";

const PERIOD_DAYS: Record<string, number> = { "1m": 30, "3m": 90, "6m": 180, year: 365 };
const WEIGHT_PERIOD_KEYS = ["1m", "3m", "6m", "year"] as const;
const COUNT_PERIOD_KEYS = ["week", "month"] as const;

// Mirrors backend stats.epley_1rm, including its guards: a single is already a 1RM, and a set
// with no load has no estimate. The parity cases are pinned in Progress.test.tsx ("matches the
// backend's Epley") against values taken from stats.epley_1rm itself, so a drift fails a test
// rather than quietly showing two different 1RMs for one set.
function epley(weight?: number | null, reps?: number | null): number | null {
  if (!weight || weight <= 0 || !reps || reps < 1) return null;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
} as const;

export function Progress() {
  const { t } = useTranslation("progress");
  const [weightPeriod, setWeightPeriod] = useState("3m");
  const [chartPeriod, setChartPeriod] = useState("3m");
  const [countPeriod, setCountPeriod] = useState<"week" | "month">("week");
  const [exerciseId, setExerciseId] = useState<string>();

  // The toggle renders (and reports) translated labels; keep stable internal keys in state.
  const keyFromLabel = (label: string, keys: readonly string[]) =>
    keys.find((k) => t(`periods.${k}`) === label) ?? keys[0];

  const exercises = useExercises();
  const prs = usePRs();
  const metrics = useBodyMetrics();
  const sessions = useSessions({ limit: 200 });

  // Default to the user's top lift (most meaningful chart), falling back to the first exercise.
  // Wait for both queries so we don't lock onto the first exercise before PRs arrive.
  useEffect(() => {
    if (exerciseId || prs.isLoading || exercises.isLoading) return;
    if (prs.data?.length) setExerciseId(prs.data[0].exerciseId);
    else if (exercises.data?.length) setExerciseId(exercises.data[0].id);
  }, [exercises.data, exercises.isLoading, prs.data, prs.isLoading, exerciseId]);

  const progression = useProgression(exerciseId);
  const exercisePR = prs.data?.find((p) => p.exerciseId === exerciseId);

  const cutoff = Date.now() - PERIOD_DAYS[chartPeriod] * 86_400_000;
  const chart = (progression.data?.chart ?? []).filter(
    (p) => parseLocalDay(p.iso).getTime() >= cutoff,
  );

  // Every stat under the chart is derived from the SAME period-filtered points the line is drawn
  // from. They used to come straight off `progression.data`, which the server computes over all
  // history: the toggle visibly redrew the line while "Топ подход", "Расч. 1RM" and "Тренд" never
  // moved, so the card read "+30.2%" over 1М where the visible window was +5.7%. Trend is
  // first-to-last within the window, matching what the eye reads off the line.
  const periodStats = useMemo(() => {
    if (chart.length === 0) return null;
    const best = Math.max(...chart.map((p) => p.topSet ?? 0));
    const bestE1rm = Math.max(...chart.map((p) => p.estimated1RM ?? 0));
    // Gate on points that actually carry an estimate, not on chart length: bodyweight and
    // assisted work comes back with estimated1RM 0, so a window holding three points of which
    // one has a load would otherwise find first === last and assert a confident "0%" — "no
    // change" derived from a single reading. The server used to return null here and the cell
    // rendered "·"; keep that.
    const withE1rm = chart.filter((p) => (p.estimated1RM ?? 0) > 0);
    const first = withE1rm[0]?.estimated1RM;
    const last = withE1rm[withE1rm.length - 1]?.estimated1RM;
    const trendPct =
      withE1rm.length >= 2 && first && last ? Math.round((last / first - 1) * 1000) / 10 : null;
    return { best, bestE1rm, trendPct };
  }, [chart]);

  const workoutCounts = useMemo(
    () => bucketWorkouts(sessions.data ?? [], countPeriod === "month" ? "month" : "week"),
    [sessions.data, countPeriod],
  );

  // A failed load must not collapse into "no data yet" empty states. One list drives the
  // error gate and retry — add a query once, everything follows.
  //
  // `progression` is deliberately NOT in this list even though it used to be missing by
  // accident. It is per-exercise, so gating the whole screen on it would unmount the exercise
  // picker — the only control that could recover the page — and take the body-weight card and
  // the count chart down with a failure that has nothing to do with them. It gets its own
  // inline error inside the chart card instead, which is the fix for the original complaint
  // (a failed fetch reading as "no data for this period", with no retry).
  const queries = [exercises, prs, sessions, metrics];
  if (queries.some((q) => q.isError)) {
    return (
      <div className="px-4 py-6 space-y-6">
        <h1 className="text-2xl">{t("title")}</h1>
        <ErrorState onRetry={() => queries.forEach((q) => q.refetch())} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <h1 className="text-2xl">{t("title")}</h1>

      <BodyWeightCard
        metrics={metrics.data}
        loading={metrics.isLoading}
        period={weightPeriod}
        setPeriod={setWeightPeriod}
      />

      <div>
        <label htmlFor="exercise-select" className="text-sm text-muted-foreground block mb-2">
          {t("exercise")}
        </label>
        <select
          id="exercise-select"
          value={exerciseId ?? ""}
          onChange={(e) => setExerciseId(e.target.value)}
          className="w-full bg-secondary text-foreground rounded-lg px-3 py-2.5 border border-border min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(exercises.data ?? []).map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-4">
        {/* Four periods next to a heading overflowed a 390px row and wrapped; the toggle owns its
            own full-width row instead, which also survives the longer labels in fr/pt. */}
        <h2 className="text-sm text-muted-foreground mb-2">{t("chart.title")}</h2>
        <div className="mb-4">
          <PeriodToggle
            fill
            options={WEIGHT_PERIOD_KEYS.map((k) => t(`periods.${k}`))}
            value={t(`periods.${chartPeriod}`)}
            onChange={(l) => setChartPeriod(keyFromLabel(l, WEIGHT_PERIOD_KEYS))}
          />
        </div>
        {progression.isError ? (
          <ErrorState onRetry={() => progression.refetch()} />
        ) : progression.isLoading ? (
          <Loading />
        ) : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chart}>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={35}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="topSet"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ fill: "var(--accent)", r: 3 }}
                name={t("chart.topSet")}
              />
              <Line
                type="monotone"
                dataKey="estimated1RM"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: "var(--chart-2)", r: 3 }}
                name={t("chart.est1rm")}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-10 text-center">{t("chart.noData")}</p>
        )}

        {periodStats && periodStats.best > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
            <Stat label={t("stats.bestSet")} value={t("units.kg", { n: periodStats.best })} />
            <Stat
              label={t("stats.est1rm")}
              value={periodStats.bestE1rm > 0 ? t("units.kg", { n: periodStats.bestE1rm }) : "·"}
            />
            <Stat
              label={t("stats.trend")}
              value={
                periodStats.trendPct != null
                  ? `${periodStats.trendPct > 0 ? "+" : ""}${periodStats.trendPct}%`
                  : "·"
              }
              accent
            />
          </div>
        )}

        {/* Personal record for the selected exercise — progress and record together in one place. */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-accent" aria-hidden />
            <h3 className="text-sm text-muted-foreground">{t("pr.title")}</h3>
          </div>
          {exercisePR ? (
            <div className="flex items-baseline justify-between">
              <span className="tabular-nums">
                {t("units.kg", { n: exercisePR.weight })} × {exercisePR.reps}
                {/* Epley over the set actually shown, not the API's `est_1rm`. That field is the
                    user's best-ever estimated 1RM, which detect_prs tracks as a SEPARATE maximum
                    with its own date — so the row read "100 кг × 1 · 1RM ~120 кг", where 120 came
                    from a 90×10 set six weeks later and no arithmetic connects it to the 100×1
                    beside it. The three numbers on this line now describe one set. */}
                {epley(exercisePR.weight, exercisePR.reps) != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · 1RM ~{t("units.kg", { n: epley(exercisePR.weight, exercisePR.reps) })}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{shortDate(exercisePR.date)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("pr.empty")}</p>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm text-muted-foreground">{t("counts.title")}</h2>
          <PeriodToggle
            options={COUNT_PERIOD_KEYS.map((k) => t(`periods.${k}`))}
            value={t(`periods.${countPeriod}`)}
            onChange={(l) => setCountPeriod(keyFromLabel(l, COUNT_PERIOD_KEYS) as "week" | "month")}
          />
        </div>
        {workoutCounts.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={workoutCounts}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={28}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="count"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                name={t("counts.barName")}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("counts.noData")}</p>
        )}
      </Card>
    </div>
  );
}

const BUCKETS_SHOWN = 12;

// Count workouts per week/month bucket, oldest → newest, ZERO-FILLED across the last
// BUCKETS_SHOWN calendar buckets ending at today.
//
// It used to emit a bucket only where a session existed and then take the last 12 of THOSE, so a
// three-week holiday rendered as two adjacent bars and the chart whose entire job is consistency
// could not show inconsistency. A user with one session in June and one in August saw an unbroken
// pair. The backend already had this right for its own weekly history (services._weekly_muscle_
// history: "a missed week renders as a real 0, never silently skipped"); this is the client
// catching up. Zero-filling also fixes duplicate month labels a year apart, since the buckets are
// now consecutive by construction.
function bucketWorkouts(sessions: { date: string }[], bucket: "week" | "month") {
  const startOf = (d: Date) =>
    bucket === "month"
      ? new Date(d.getFullYear(), d.getMonth(), 1)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const labelOf = (d: Date) =>
    bucket === "month"
      ? d.toLocaleDateString(i18n.resolvedLanguage, { month: "short" })
      : d.toLocaleDateString(i18n.resolvedLanguage, { day: "numeric", month: "short" });

  const counts = new Map<number, { label: string; count: number }>();
  const cursor = startOf(new Date());
  for (let i = 0; i < BUCKETS_SHOWN; i++) {
    counts.set(cursor.getTime(), { label: labelOf(cursor), count: 0 });
    if (bucket === "month") cursor.setMonth(cursor.getMonth() - 1);
    else cursor.setDate(cursor.getDate() - 7);
  }
  for (const s of sessions) {
    const d = parseLocalDay(s.date);
    if (Number.isNaN(d.getTime())) continue;
    const cur = counts.get(startOf(d).getTime());
    if (cur) cur.count += 1; // no bucket => outside the 12-bucket window, deliberately ignored
  }
  const out = [...counts.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  // Zero-filling means the buckets always exist, so "nothing logged at all" would otherwise draw
  // twelve empty bars instead of the empty state. A run of zeros between real sessions is
  // information; twelve of them for a brand-new account is not.
  return out.some((b) => b.count > 0) ? out : [];
}

function BodyWeightCard({
  metrics,
  loading,
  period,
  setPeriod,
}: {
  metrics?: BodyMetric[];
  loading: boolean;
  period: string;
  setPeriod: (v: string) => void;
}) {
  const { t } = useTranslation("progress");
  const data = useMemo(() => {
    if (!metrics) return [];
    const cutoff = Date.now() - PERIOD_DAYS[period] * 86_400_000;
    return metrics
      .filter((m) => m.weight != null && parseLocalDay(m.date).getTime() >= cutoff)
      .map((m) => ({ date: shortDate(m.date), value: m.weight }))
      .reverse();
  }, [metrics, period]);

  const withVal = (metrics ?? []).filter((m) => m.weight != null);
  // Current weight is the latest reading, period-independent — "what do I weigh" has one answer.
  // The DELTA is not: it used to be computed over every metric the query happened to return, so
  // the one number the owner actually reads said "-3.0 кг" on the 1М view where the chart under
  // it fell 0.5. `data` is the same period-filtered series the line is drawn from, so the number
  // and the line can no longer disagree.
  const current = withVal[0]?.weight;
  const change = data.length >= 2 ? data[data.length - 1].value! - data[0].value! : 0;
  const down = change < 0;

  return (
    <Card className="p-4">
      <div className="mb-3">
        <div>
          <h2 className="text-sm text-muted-foreground">{t("bodyWeight.title")}</h2>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-2xl tabular-nums whitespace-nowrap">
              {current != null ? t("units.kg", { n: current }) : t("units.kgEmpty")}
            </span>
            {change !== 0 && (
              <span
                className={`text-sm flex items-center gap-1 whitespace-nowrap ${down ? "text-accent" : "text-chart-5"}`}
              >
                {down ? (
                  <TrendingDown className="w-3 h-3" aria-hidden />
                ) : (
                  <TrendingUp className="w-3 h-3" aria-hidden />
                )}
                {t("units.kg", { n: Math.abs(change).toFixed(1) })}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Its own row: inline beside the weight readout this wrapped to a second line at 390px. */}
      <div className="mb-4">
        <PeriodToggle
          fill
          options={WEIGHT_PERIOD_KEYS.map((k) => t(`periods.${k}`))}
          value={t(`periods.${period}`)}
          onChange={(l) =>
            setPeriod(
              WEIGHT_PERIOD_KEYS.find((k) => t(`periods.${k}`) === l) ?? WEIGHT_PERIOD_KEYS[0],
            )
          }
        />
      </div>
      {loading ? (
        <Loading />
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={35}
              domain={["dataMin - 1", "dataMax + 1"]}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: "var(--accent)", r: 3 }}
              name={t("bodyWeight.title")}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground py-10 text-center">{t("bodyWeight.empty")}</p>
      )}
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg tabular-nums ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}
