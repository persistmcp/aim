import { ChevronRight, ListChecks, Target } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AdherenceWidget } from "../components/AdherenceWidget";
import { EditBodyweightSheet } from "../components/EditBodyweightSheet";
import { FeaturedGoalCard } from "../components/FeaturedGoalCard";
import { InstallBanner } from "../components/InstallBanner";
import { MuscleLoadSection } from "../components/MuscleLoadSection";
import { PRBadge } from "../components/PRBadge";
import { ProgramSection } from "../components/ProgramSection";
import { SettingsMenu } from "../components/SettingsMenu";
import { StatTile } from "../components/StatTile";
import { StreakWidget } from "../components/StreakWidget";
import { ErrorState, Loading } from "../components/States";
import { Button } from "../components/ui/button";
import { isDemo } from "../lib/demo";
import { pastGoals } from "../lib/goals";
import { findNewPRs, getSeenPRDates, hasSeenAnyPRs, markPRsSeen } from "../lib/prSeen";
import { useGoals, useMe, usePRs, useProfile, useSessions, useSummary } from "../lib/queries";
import { daysBetweenIso, localIso, parseLocalDay, todayIso } from "../lib/localDate";
import type { PersonalRecord, Summary } from "../data/workouts";

// The bezel's calendar and the count beside it. NOT the flame's scale — since 2026-08-29 the
// level is a fuel gauge with no window at all (docs/CONSISTENCY_FLAME.md), so this number governs
// the picture and the count only. Changing it does not change anyone's level.
const STREAK_WINDOW_DAYS = 28;

// Home stat tiles keyed by what /api/profile can ask for (COACHING_PLAN.md §8.2's per-goal tile
// table). Unknown keys are dropped rather than shown broken — forward-compatible with a future
// tile the backend starts returning before this map knows about it.
function tileFor(
  key: string,
  t: (k: string, o?: Record<string, unknown>) => string,
  summary: Summary | undefined,
  metrics: { top_e1rm: number | null; bodyweight_delta_30d: number | null } | undefined,
): { label: string; value: string } | null {
  switch (key) {
    case "workouts_week":
      return {
        label: t("home.stats.workoutsWeek"),
        value: String(summary?.workouts_this_week ?? 0),
      };
    case "volume_week":
      return {
        label: t("home.stats.volumeWeek"),
        value: t("units.tons", { value: ((summary?.volume_this_week ?? 0) / 1000).toFixed(1) }),
      };
    case "bodyweight":
      return {
        label: t("home.stats.bodyweight"),
        value: summary?.bodyweight ? t("units.kg", { value: summary.bodyweight }) : "·",
      };
    case "top_e1rm":
      return {
        label: t("home.stats.topE1rm"),
        value: metrics?.top_e1rm != null ? t("units.kg", { value: metrics.top_e1rm }) : "·",
      };
    case "bodyweight_delta_30d": {
      const v = metrics?.bodyweight_delta_30d;
      return {
        label: t("home.stats.bodyweightDelta"),
        value: v != null ? t("units.kg", { value: v > 0 ? `+${v}` : v }) : "·",
      };
    }
    default:
      return null;
  }
}

const DEFAULT_TILES = ["workouts_week", "volume_week", "bodyweight"];
// "adherence" isn't in the backend's own pre-intake default (nothing to compare against yet),
// but stays first here as a harmless placeholder — AdherenceWidget self-gates to null without a
// training_days_per_week target, so it costs nothing while /api/profile is still loading.
const DEFAULT_MODULES = ["adherence", "program", "muscle_load"];

const MODULE_LABELS = ["goal_progress", "adherence", "program", "muscle_load"] as const;

export function Home() {
  const { t } = useTranslation();
  const agoLabel = (days: number) =>
    days <= 0
      ? t("home.ago.today")
      : days === 1
        ? t("home.ago.yesterday")
        : t("home.ago.days", { count: days });

  const me = useMe();
  const summary = useSummary();
  const sessions = useSessions({ limit: 50 });
  const profile = useProfile();
  // Fetched unconditionally, before any early return below (Rules of Hooks) — not gated on the
  // user opening anything, since the history nav row further down needs the count up front to
  // decide whether to render at all. Same query key as the GoalHistory screen, so this also
  // primes its cache for an instant load on navigation.
  const goalHistory = useGoals("all");
  const prs = usePRs();
  const [editWeightOpen, setEditWeightOpen] = useState(false);
  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const recent = sessions.data ?? [];
  const last = recent[0];

  // Sessions are only ever logged via the coach's MCP tool calls in a separate chat client — this
  // app has no logging path of its own, so a PR can only ever be *discovered* on the next time
  // it's opened, never celebrated at the literal moment it happens. `celebratedRef` caps this to
  // once per mount regardless of how many times `prs.data`'s reference changes from an unrelated
  // re-render or a within-staleTime refetch. Demo is excluded entirely: its PR dates are static
  // fixture data, so there's no real "first time seeing this" moment behind them worth a buzz.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (isDemo() || !prs.data || celebratedRef.current) return;
    celebratedRef.current = true;
    const fresh = hasSeenAnyPRs() ? findNewPRs(prs.data, getSeenPRDates()) : [];
    markPRsSeen(prs.data);
    if (fresh.length) {
      setNewPRs(fresh);
      navigator.vibrate?.([200, 100, 200, 100, 200]);
    }
  }, [prs.data]);

  // One list drives loading, the error gate and retry — add a query once, everything follows.
  // profile is deliberately excluded: it's a personalization layer that gracefully degrades to
  // the default layout (COACHING_PLAN.md §8.4), not core data Home can't render without.
  const queries = [summary, me, sessions];
  if (summary.isLoading || me.isLoading) return <Loading />;
  // A failed load must not masquerade as an empty account ("0 workouts" via the ?? fallbacks).
  if (queries.some((q) => q.isError)) {
    return <ErrorState onRetry={() => queries.forEach((q) => q.refetch())} />;
  }

  // Whole CALENDAR days, on the user's calendar. Subtracting timestamps and flooring got this
  // wrong twice over: `new Date("2026-08-09")` is UTC midnight, so west of UTC a session logged
  // today read as "yesterday" from 17:00 onward, and a 24h-block count would flip an
  // early-morning session to "yesterday" the moment 24 hours passed. localIso(parseLocalDay(...))
  // normalises both a bare "YYYY-MM-DD" and a full timestamp to the local day; daysBetweenIso
  // then does whole-day arithmetic that a DST boundary cannot skew.
  const daysSinceLast = last
    ? daysBetweenIso(localIso(parseLocalDay(last.date)), todayIso())
    : null;
  // Per-day ticks for the streak bezel, oldest→newest, over the same four whole weeks
  // services._streak scores — and the count beside it is distinct training DAYS, the same
  // numerator the level uses. Previously the card counted session ROWS over 30 days, the ring
  // counted days over 30, and the backend scored sessions over 30: three numbers on one card
  // that disagreed for anyone who logged a morning and an evening session, on a window whose
  // 4.286 weeks made the level flicker on calendar phase alone.
  //
  // Local calendar days on purpose: a 23:30 workout belongs to the day the user trained, not to
  // UTC's opinion of it. `session.date` is already a bare "YYYY-MM-DD", so it is compared as a
  // string; it used to go through `new Date(s.date)` first, which parses a date-only string as
  // UTC midnight — read back through the local getters below, every session west of UTC landed
  // on the previous day, rotating the whole ring by one tick and leaving "today" permanently
  // unlit for the Americas. Only the `Date` built from the local clock needs the local getters.
  const localDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const trainedDays = new Set(recent.map((s) => s.date.slice(0, 10)));
  const daysWindow = Array.from({ length: STREAK_WINDOW_DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (STREAK_WINDOW_DAYS - 1 - i));
    return trainedDays.has(localDay(d));
  });
  const trainedInWindow = daysWindow.filter(Boolean).length;

  const tileKeys = profile.data?.tiles ?? DEFAULT_TILES;
  const tiles = tileKeys
    .map((key) => {
      const tile = tileFor(key, t, summary.data, profile.data?.metrics);
      return tile ? { key, ...tile } : null;
    })
    .filter((tile): tile is { key: string; label: string; value: string } => tile !== null);

  const moduleOrder = profile.data?.modules ?? DEFAULT_MODULES;
  const streakLevel = profile.data?.streak?.level ?? null;
  const featuredGoal = profile.data?.featured_goal ?? null;
  const showGoalProgress = moduleOrder.includes("goal_progress");
  // The featured-goal card supersedes the flat goal line once the personalization layer is
  // active — showing both would just repeat the same titles twice on one screen.
  const showFlatGoalLine = !showGoalProgress && (me.data?.goals?.length ?? 0) > 0;
  const pastGoalCount = pastGoals(goalHistory.data ?? []).length;

  const modules: Record<(typeof MODULE_LABELS)[number], ReactNode> = {
    // FeaturedGoalCard renders nothing when there's no featured goal (title-only or no data is
    // still handled inside it). "Past goals" is a separate nav destination, not inline — see the
    // nav row rendered right after the module list below.
    goal_progress: showGoalProgress ? <FeaturedGoalCard goal={featuredGoal} /> : null,
    adherence: <AdherenceWidget />,
    program: <ProgramSection />,
    muscle_load: <MuscleLoadSection />,
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">
            {me.data?.name ? t("home.greetingName", { name: me.data.name }) : t("home.greeting")}
          </h1>
          {/* No date line — this is a journal, not a calendar (owner, 2026-08-02). The
              last-workout note lives on the streak card next to the 4-week count; the header
              keeps it only in the pre-streak fallback, where that card doesn't render. */}
          {daysSinceLast != null && streakLevel == null && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("home.lastWorkout", { when: agoLabel(daysSinceLast), n: trainedInWindow })}
            </p>
          )}
        </div>
        <SettingsMenu />
      </div>

      {newPRs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-accent">{t("home.newPr.title")}</h2>
            {/* After a long gap the strip can hold a whole backlog of records — one tap clears
                them all instead of forcing a swipe per badge. */}
            {newPRs.length > 1 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setNewPRs([])}
              >
                {t("home.newPr.dismissAll")}
              </button>
            )}
          </div>
          {newPRs.map((pr) => (
            <PRBadge
              key={pr.exerciseId}
              exerciseName={pr.exerciseName}
              weight={pr.weight}
              reps={pr.reps}
              celebratory
              onDismiss={() =>
                setNewPRs((prev) => prev.filter((p) => p.exerciseId !== pr.exerciseId))
              }
            />
          ))}
        </div>
      )}

      {streakLevel != null ? (
        // The consistency flame consolidates the old 3-tile grid: same three numbers in its
        // compact stat row, plus the rolling 4-week level driving the flame itself. The
        // bodyweight quick-write moved here with a visible gear icon (the bare tappable tile
        // gave no hint it was editable). Demo has no backend to save to.
        <StreakWidget
          level={streakLevel}
          heat={profile.data?.streak?.heat ?? null}
          daysWindow={daysWindow}
          countWindow={trainedInWindow}
          lastWorkoutLabel={
            daysSinceLast != null
              ? t("home.lastWorkoutShort", { when: agoLabel(daysSinceLast) })
              : null
          }
          bodyweight={summary.data?.bodyweight ?? null}
          workoutsWeek={summary.data?.workouts_this_week ?? 0}
          volumeWeekKg={summary.data?.volume_this_week ?? 0}
          onEditWeight={!isDemo() ? () => setEditWeightOpen(true) : undefined}
        />
      ) : (
        // No streak yet (insufficient history / profile still loading) — the original tile
        // grid, so a brand-new account isn't greeted by an empty hero card.
        <div className="grid grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <StatTile
              key={tile.key}
              label={tile.label}
              value={tile.value}
              // Quick-write affordance (FUNCTIONAL_IMPROVEMENTS_PLAN.md #5): the most frequent
              // "one number" write, without a chat round-trip. Demo has no backend to save to.
              onClick={
                tile.key === "bodyweight" && !isDemo() ? () => setEditWeightOpen(true) : undefined
              }
            />
          ))}
        </div>
      )}
      <EditBodyweightSheet
        open={editWeightOpen}
        onOpenChange={setEditWeightOpen}
        currentValue={summary.data?.bodyweight ?? undefined}
      />

      <InstallBanner />

      {showFlatGoalLine && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="w-4 h-4 shrink-0 text-accent" aria-hidden />
          <span>{t("home.goal", { goal: me.data!.goals!.join(" · ") })}</span>
        </p>
      )}

      {moduleOrder
        .filter((key): key is (typeof MODULE_LABELS)[number] =>
          (MODULE_LABELS as readonly string[]).includes(key),
        )
        .map((key) => (
          <div key={key}>{modules[key]}</div>
        ))}

      {pastGoalCount > 0 && (
        <Button asChild variant="ghost" size="sm" className="w-full justify-between px-3">
          <Link to="/goal-history">
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" aria-hidden /> {t("home.goalHistory.title")}
            </span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}
