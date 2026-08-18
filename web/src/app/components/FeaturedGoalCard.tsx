// Home "featured goal" card — the ONE goal the user worked out with the coach in chat, shown
// prominently (COACHING_PLAN.md §8.2's "flagship personalization", now singular: a goal card
// list didn't scale to "the thing in the user's head right now"). Rendering branches on
// goal.progress.type (services._featured_goal_progress's discriminated union) — a shape per type
// instead of forcing a percent-to-100 finish line onto something that was never meant to have one
// (trend/maintenance are open-ended by design; only a milestone has a real bounded target).
// Visual choices here follow a deep-research pass on goal-progress framing, not aesthetic
// copying: the goal-gradient effect and endowed/illusory progress (Kivetz/Urminsky/Zheng) inform
// the milestone ring's presentation floor; the small-area/stage-dependent framing hypothesis
// drives the accumulated→remaining headline flip; SDT's informational-vs-controlling feedback
// distinction is why the "positive state" glow below is static and state-conditional, never a
// forced celebratory animation. Any content change to the goal itself happens in chat with the
// coach, never here — this card only displays and links back to that conversation (the FAB).
import { useEffect, useId, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { FeaturedGoal, GoalProgress } from "../data/workouts";
import { isDemo } from "../lib/demo";
import { hasCelebratedGoal, markGoalCelebrated } from "../lib/goalSeen";
import { GOAL_STATUS_COLOR } from "../lib/muscle";
import { muscleLabel } from "../lib/muscleLabels";
import { Card } from "./ui/card";
import { GoalCoachFab } from "./GoalCoachFab";
import { GoalDetailSheet } from "./GoalDetailSheet";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
// Rounds to 1 decimal before fmt() sees it — values derived by multiplying/dividing a percentage
// (below, MilestoneRing's accumulated/remaining) pick up float noise (100 * (1 - 0.9) !== 10 in
// JS), which would otherwise make Number.isInteger false-negative and print "10.0" instead of "10".
const round1 = (n: number) => Math.round(n * 10) / 10;

const DIRECTION_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

type BarProgress = Extract<GoalProgress, { type: "bar" }>;
type WeeklyBandsProgress = Extract<GoalProgress, { type: "weekly_bands" }>;
type TrendProgress = Extract<GoalProgress, { type: "trend" }>;
type ToleranceProgress = Extract<GoalProgress, { type: "tolerance" }>;

// Ring geometry for the milestone visual.
const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Endowed/illusory progress effect: a rendered arc never reads as a literal empty circle at
// pct=0 — presentation-only floor, the numeric label below still shows the real pct.
const RING_MIN_SWEEP_PCT = 5;

function goalTargetValue(goal: FeaturedGoal): number | null {
  const value = goal.target?.value;
  return typeof value === "number" ? value : null;
}

// Only bodyweight milestones carry a baseline — and only they can run in either direction (a
// cut's current value falls toward the target instead of climbing toward it, unlike every other
// milestone metric). Its presence is what tells the framing math below which way "progress" runs.
function goalBaselineValue(goal: FeaturedGoal): number | null {
  const value = goal.target?.baseline_value;
  return typeof value === "number" ? value : null;
}

function goalTargetUnit(goal: FeaturedGoal): string | null {
  const unit = goal.target?.unit;
  return typeof unit === "string" && unit ? unit : null;
}

function goalTargetMetric(goal: FeaturedGoal): string | null {
  const metric = goal.target?.metric;
  return typeof metric === "string" && metric ? metric : null;
}

// Plain-language stage phrase for goals whose tracked numbers live on a different scale than the
// title. An e1RM goal titled "Жим 70 кг × 10" is internally 87→93 kg of estimated max: every
// numeric framing tried on the card ("0.1", "0.1 кг до 93 кг") read as nonsense against the "70"
// in the title (owner, twice: "что за хрень?"). The ring already shows the exact pct — the words
// only need to say where on the road the user is, in their own language, with zero numbers.
const STAGE_THRESHOLDS: [number, string][] = [
  [100, "beaten"],
  [85, "almost"],
  [50, "half"],
  [0, "early"],
];
const stageKey = (pct: number) =>
  (STAGE_THRESHOLDS.find(([floor]) => pct >= floor) as [number, string])[1];

export function MilestoneRing({
  goal,
  progress,
  titleId,
}: {
  goal: FeaturedGoal;
  progress: BarProgress;
  titleId: string;
}) {
  const { t } = useTranslation();
  const pct = progress.pct;
  const sweep = Math.max(pct, RING_MIN_SWEEP_PCT);
  const offset = RING_CIRCUMFERENCE * (1 - sweep / 100);

  const target = goalTargetValue(goal);
  const current = goal.current;
  const baseline = goalBaselineValue(goal);
  const hasFraming = target != null && current != null;
  // e1RM goals get the stage phrase (see STAGE_THRESHOLDS) — their raw numbers contradict the
  // title. Metrics whose numbers match the title's own scale (bodyweight kg, arm cm) keep the
  // numeric framing, now with a unit and the target in the caption: the original bug was a bare
  // "0.1" with neither (bugs/photo_2026-08-01_15-01-45.jpg).
  const useStagePhrase = goalTargetMetric(goal) === "e1rm";
  const unit = goalTargetUnit(goal);
  const unitLabel = unit ? t(`home.featuredGoal.unitLabel.${unit}`, { defaultValue: unit }) : null;
  const withUnit = (n: number) => (unitLabel ? `${fmt(n)} ${unitLabel}` : fmt(n));
  const targetLabel = target != null ? withUnit(target) : null;
  // Small-area/stage-dependent framing: show whichever number is smaller — accumulated so far
  // early on, remaining-to-go once past the midpoint — instead of one fixed framing throughout.
  // Driven off `pct` (already direction-aware and clamped to [0,100] by the backend — it alone
  // knows whether this metric climbs toward its target or, for a bodyweight cut, falls toward
  // it) rather than re-deriving direction from raw target/current: a naive target-minus-current
  // (or an unclamped Math.abs distance) breaks for a bodyweight goal specifically, since that's
  // the one metric that can run backwards — overshooting past the target, or moving the wrong
  // way entirely, both need to stay consistent with what the ring itself is showing.
  const totalDistance = hasFraming
    ? baseline != null
      ? Math.abs((target as number) - baseline)
      : (target as number)
    : null;
  const accumulated = totalDistance != null ? round1(totalDistance * (pct / 100)) : null;
  const remaining = totalDistance != null ? round1(totalDistance * (1 - pct / 100)) : null;
  const showRemaining = pct >= 50;
  // Beating the goal is the sweetest moment in a goal's life — "0 to go" undersells it. The pct
  // is clamped to 100 server-side, so overshoot is only visible through current vs target; a
  // baseline (bodyweight cut) flips the direction, and moving PAST a falling target means
  // current < target there.
  const overshoot =
    hasFraming && pct >= 100
      ? round1(
          baseline != null && baseline > (target as number)
            ? (target as number) - (current as number)
            : (current as number) - (target as number),
        )
      : 0;

  return (
    <div className="flex items-center gap-4">
      <div
        role="progressbar"
        aria-labelledby={titleId}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative shrink-0"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-all"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums text-foreground dark:text-accent">
          {pct}%
        </span>
      </div>
      {useStagePhrase ? (
        <div className="text-base font-medium text-foreground dark:text-accent">
          {t(`home.featuredGoal.milestone.stage.${stageKey(pct)}`)}
        </div>
      ) : (
        hasFraming && (
          <div>
            <div className="text-2xl font-medium tabular-nums text-foreground dark:text-accent">
              {overshoot > 0
                ? `+${withUnit(overshoot)}`
                : withUnit(showRemaining ? (remaining as number) : (accumulated as number))}
            </div>
            <div className="text-xs text-muted-foreground">
              {overshoot > 0
                ? t("home.featuredGoal.milestone.overGoal")
                : showRemaining
                  ? t("home.featuredGoal.milestone.toGo", { target: targetLabel })
                  : t("home.featuredGoal.milestone.towardCaption", { target: targetLabel })}
            </div>
          </div>
        )
      )}
    </div>
  );
}

export function WeeklyBands({ progress }: { progress: WeeklyBandsProgress }) {
  const { t } = useTranslation();
  const color = (status: string | null) =>
    status ? (GOAL_STATUS_COLOR[status] ?? "var(--border)") : "var(--border)";
  const statusWord = (status: string | null) =>
    status ? t(`home.featuredGoal.weeklyStatus.${status}`) : null;
  const pillLabel = (week: { week: string; sets: number; status: string | null }) =>
    week.status
      ? t("home.featuredGoal.weeklyHistoryPill", {
          week: week.week,
          n: fmt(week.sets),
          status: statusWord(week.status),
        })
      : t("home.featuredGoal.weeklyHistoryPillNoData", { week: week.week, n: fmt(week.sets) });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color(progress.current_status) }}
        />
        <span className="text-muted-foreground">
          {statusWord(progress.current_status) && `${statusWord(progress.current_status)} · `}
          {muscleLabel(progress.muscle)} ·{" "}
          {t("home.featuredGoal.setsThisWeek", { n: fmt(progress.current_sets) })}
          {/* A muscle outside the landmarks table gets a plain explanation instead of a grey
              status dot with no words — the dot alone reads as a bug, not a data gap. */}
          {progress.landmark
            ? ` (${t("home.featuredGoal.targetRange", { min: progress.landmark.mev, max: progress.landmark.mav })})`
            : ` · ${t("home.featuredGoal.noLandmark")}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {progress.history.map((week, i) => (
          <span
            key={week.week}
            role="img"
            aria-label={pillLabel(week)}
            className={`h-2 flex-1 rounded-full ${
              i === progress.history.length - 1 ? "ring-2 ring-foreground/40" : ""
            }`}
            style={{ backgroundColor: color(week.status) }}
            title={pillLabel(week)}
          />
        ))}
      </div>
      {/* Disambiguates this pill row from the adherence widget's visually identical one on the
          same screen: there a pill is a DAY of the current week, here it's a whole week. */}
      <p className="text-right text-[10px] leading-none text-muted-foreground">
        {t("home.featuredGoal.weeksAxis", { count: progress.history.length })}
      </p>
    </div>
  );
}

export function TrendChart({ progress }: { progress: TrendProgress }) {
  const { t } = useTranslation();
  // Safari fails to resolve a fragment `url(#...)` reference when the id contains a colon —
  // useId()'s default output (e.g. ":r3:") breaks the fill silently (invisible, no error) on
  // iOS/macOS Safari specifically, while working fine on Chrome/Firefox.
  const gradientId = useId().replace(/:/g, "");
  const Icon = progress.direction ? DIRECTION_ICON[progress.direction] : Minus;
  const label = progress.direction
    ? t(`home.featuredGoal.trending.${progress.direction}`)
    : t("home.featuredGoal.trending.flat");
  const pct = progress.trend_pct;
  const sign = pct != null && pct > 0 ? "+" : "";
  // With no computable direction or fewer than 3 points the chart is a flat filled band that
  // carries zero information and reads as broken — say "not enough data yet" instead.
  const hasChart = pct != null && progress.series.length >= 3;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* A rate-of-change headline, never a percent-to-100 completion metaphor — a trend goal
            has no fixed endpoint by design, so the copy must read as "change over time". */}
        {pct != null && (
          <span className="text-2xl font-medium tabular-nums text-foreground dark:text-accent">
            {sign}
            {fmt(pct)}%
          </span>
        )}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>{label}</span>
        </div>
      </div>
      {pct != null && (
        <p className="text-xs text-muted-foreground">{t("home.featuredGoal.trendChangeCaption")}</p>
      )}
      {!hasChart && (
        <p className="text-xs text-muted-foreground">{t("home.featuredGoal.trendNoData")}</p>
      )}
      {hasChart && (
        <ResponsiveContainer width="100%" height={60}>
          <AreaChart data={progress.series}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Hidden axis only to fix the domain to the data's own range — without it recharts
                anchors toward 0, squashing a real trend flat when values sit far from zero. */}
            <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function MaintenanceZone({ progress }: { progress: ToleranceProgress }) {
  const { t } = useTranslation();
  const { baseline, current, tolerance_pct, status, drop_pct } = progress;
  const toleranceFloor = baseline * (1 - tolerance_pct / 100);
  const span = Math.max(baseline - toleranceFloor, 1);
  const trackMin = toleranceFloor - span * 0.15;
  const trackMax = baseline + span * 0.5;
  const pos = (v: number) =>
    Math.min(100, Math.max(0, ((v - trackMin) / (trackMax - trackMin)) * 100));
  const zoneStart = pos(toleranceFloor);
  const zoneEnd = pos(baseline);
  const currentPos = pos(current);

  return (
    <div className="space-y-2">
      <div className="relative h-2 rounded-full bg-border" aria-hidden>
        {/* "OK zone" — a band, not a finish line: this goal is about staying within range, not
            reaching a target. */}
        <div
          className="absolute inset-y-0 rounded-full opacity-25"
          style={{
            left: `${zoneStart}%`,
            width: `${Math.max(zoneEnd - zoneStart, 1)}%`,
            backgroundColor: "var(--chart-2)",
          }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground/40"
          style={{ left: `${zoneEnd}%` }}
        />
        <div
          data-testid="maintenance-current-marker"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
          style={{ left: `${currentPos}%`, backgroundColor: GOAL_STATUS_COLOR[status] }}
        />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: GOAL_STATUS_COLOR[status] }}
        />
        <span className="text-muted-foreground">
          {status === "ok"
            ? t("home.featuredGoal.maintenanceOk")
            : t("home.featuredGoal.maintenanceWarn", { pct: fmt(drop_pct) })}
        </span>
      </div>
    </div>
  );
}

// Opacity of the subtle state-tied glow — only on genuinely positive states, never on
// under/warn/down (SDT: informational feedback, not decoration that would celebrate a bad week).
// A milestone's pct is the one continuous signal here, so it ramps smoothly from 80% (where it
// used to snap on instantly) to 100% instead of a hard binary switch — the other three types have
// no percentage to ramp against (direction/status/ok-warn are categorical), so they stay binary.
const GLOW_MAX_OPACITY = 0.1;
const GLOW_RAMP_START_PCT = 80;

// The wash must visibly cover the WHOLE card. Three attempts that faded toward zero (to
// `transparent 60%`, eased stops to transparent, then a 15%-accent floor) all got the same owner
// report — "градиент обрезается / не на всю карточку": on a dark card anything under roughly a
// third of the peak strength reads as plain black, so a low floor is a cutoff perceptually even
// when it's nonzero mathematically. The floor therefore stays at ~half the peak's mix — the far
// corner is unmistakably tinted, and the ring corner is just a brighter pole of the same wash.
export const GOAL_GLOW_GRADIENT =
  "radial-gradient(120% 120% at 15% 85%, " +
  "var(--accent) 0%, " +
  "color-mix(in srgb, var(--accent) 65%, transparent) 45%, " +
  "color-mix(in srgb, var(--accent) 45%, transparent) 100%)";

function glowOpacity(progress: GoalProgress | null): number {
  switch (progress?.type) {
    case "bar": {
      const pct = progress.pct;
      if (pct < GLOW_RAMP_START_PCT) return 0;
      const rampFraction = (Math.min(pct, 100) - GLOW_RAMP_START_PCT) / (100 - GLOW_RAMP_START_PCT);
      // Never literally 0 once past the threshold — a glow that's present but ramping still
      // reads as "on", just building; jumping from invisible to a sliver would look like a flicker.
      return GLOW_MAX_OPACITY * (0.3 + 0.7 * rampFraction);
    }
    case "trend":
      return progress.direction === "up" ? GLOW_MAX_OPACITY : 0;
    case "weekly_bands":
      return progress.current_status === "in_range" ? GLOW_MAX_OPACITY : 0;
    case "tolerance":
      return progress.status === "ok" ? GLOW_MAX_OPACITY : 0;
    default:
      return 0;
  }
}

export function FeaturedGoalCard({ goal }: { goal: FeaturedGoal | null }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [detailOpen, setDetailOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const goalId = goal?.id ?? null;
  const achieved =
    goal?.goal_type === "milestone" && goal.progress?.type === "bar" && goal.progress.pct >= 100;

  // One-time "goal achieved" celebration, mirroring the PR-reveal pattern (prSeen.ts): goals
  // close out via MCP in a separate chat, so the achievement is only ever DISCOVERED here on a
  // later open. localStorage-gated per goal id — a superseding goal has its own id, so each
  // milestone blooms at most once, ever. Demo never celebrates (and never touches storage).
  useEffect(() => {
    if (!goalId || !achieved || isDemo() || hasCelebratedGoal(goalId)) {
      // A refetch can swap in a different featured goal on the same mount (the coach closed goal
      // A and featured goal B mid-session) — the bloom must not carry over onto the new goal.
      setCelebrating(false);
      return;
    }
    markGoalCelebrated(goalId);
    setCelebrating(true);
    navigator.vibrate?.([200, 100, 200]);
  }, [goalId, achieved]);

  if (!goal) return null;
  const progress = goal.progress;
  // A "bar" progress envelope can also come from a frequency goal wrongly marked featured
  // (tools.py's upsert_goal docstring says never to — coach-prompt guidance only, not enforced
  // server-side): services._featured_goal_progress has no frequency branch, so it falls back to
  // the same cheap sessions_per_week/value calculation _goal_progress uses for every goal's plain
  // list entry. That's a fine degradation for a small header badge, but the ring's "toward X"/
  // "N to go" framing implies a one-time finish line — actively misleading for a goal that resets
  // every week. Gate the rich milestone visual on goal_type itself, not just progress.type, so
  // that misuse degrades to title-only instead of a convincing but wrong ring.
  const isMilestone = goal.goal_type === "milestone";

  // Same gate as the ring itself: a bar envelope from a wrongly-featured frequency goal renders
  // title-only, and a glow with no visual under it to explain would just look like a rendering bug.
  const glowOp = progress?.type === "bar" && !isMilestone ? 0 : glowOpacity(progress);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={t("home.featuredGoal.openDetails")}
      // NO space-y here: Tailwind v4's space-y puts margin-bottom on every non-last child —
      // including the absolutely positioned glow/bloom layers, which then resolve inset-0 twelve
      // pixels short of the card's bottom edge. That was the REAL "gradient is cut off at the
      // bottom" bug (three gradient re-tunings fought the symptom). The in-flow content div
      // carries its own space-y-3 for the actual spacing.
      className="relative cursor-pointer overflow-hidden p-4"
      onClick={(e) => {
        // Interactive children (the coach FAB, tooltip triggers) keep their own behavior — only
        // a tap on the card body itself opens the detail sheet.
        if ((e.target as HTMLElement).closest("button, a")) return;
        setDetailOpen(true);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDetailOpen(true);
        }
      }}
    >
      {celebrating && (
        <>
          <div
            aria-hidden
            className="animate-goal-bloom-flash pointer-events-none absolute inset-0"
            style={{ background: GOAL_GLOW_GRADIENT }}
          />
          <span className="sr-only" role="status">
            {t("home.featuredGoal.achievedAnnounce")}
          </span>
        </>
      )}
      {glowOp > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: glowOp,
            // Off the FAB's top-right corner on purpose — the glow should draw the eye toward
            // the data visual it's responding to, not toward an unrelated piece of UI chrome.
            background: GOAL_GLOW_GRADIENT,
          }}
        />
      )}
      <div className="relative animate-in fade-in-0 duration-300 space-y-3">
        {/* No flame echo here (removed on owner feedback 2026-08-01): the consistency flame
            lives on the streak card alone — repeating it next to the goal title read as clutter,
            and the two cards sit one viewport apart anyway. */}
        <div className="flex items-start gap-2 pr-10">
          <h3 id={titleId} className="min-w-0 text-sm font-medium">
            {goal.title}
          </h3>
        </div>

        {progress?.type === "bar" && isMilestone && (
          <div className={celebrating ? "animate-goal-bloom" : undefined}>
            <MilestoneRing goal={goal} progress={progress} titleId={titleId} />
          </div>
        )}
        {progress?.type === "weekly_bands" && <WeeklyBands progress={progress} />}
        {progress?.type === "trend" && <TrendChart progress={progress} />}
        {progress?.type === "tolerance" && <MaintenanceZone progress={progress} />}
        {progress?.type === "bar" && isMilestone && progress.pct >= 100 && (
          // The one moment the card nudges toward the coach in text: a finished milestone is a
          // decision point (new target, or switch to maintaining) the app never makes itself.
          <p className="text-xs text-muted-foreground">{t("home.featuredGoal.achievedNext")}</p>
        )}
      </div>

      <GoalCoachFab prompt={goal.title} />
      <GoalDetailSheet goal={goal} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  );
}
