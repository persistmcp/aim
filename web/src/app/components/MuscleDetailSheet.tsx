// Bottom sheet behind every muscle tap on the Home load section: the numbers explained — how
// loaded the muscle still is, how long its work takes to fade, and which days over the last 7
// hit it, through which exercises, with how many sets. Direct (primary) work reads plain;
// secondary involvement is marked "indirect" and carries its half-set weight, so the rows always
// sum to the figure on the card. Same Drawer pattern as GoalDetailSheet.
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { useMuscleBreakdown } from "../lib/queries";
import type { MuscleStat } from "../lib/muscleVolume";
import { SET_TARGET, loadHeat, setStatus } from "../lib/muscle";
import { muscleLabel } from "../lib/muscleLabels";
import { parseLocalDay } from "../lib/localDate";
import { loadColor, useLoadTheme } from "./MuscleMap2D";

// Theme tokens, not raw hexes: the dark-theme hexes these used to be sit at ~2:1 against a
// light card, under the 3:1 non-text minimum — the same fix GOAL_STATUS_COLOR already got.
const STATUS_COLOR = {
  low: "var(--status-caution)",
  ok: "var(--status-good)",
  high: "var(--status-over)",
} as const;

export function MuscleDetailSheet({
  muscle,
  stat,
  isFocus,
  open,
  onOpenChange,
}: {
  muscle: string | null;
  stat: MuscleStat | null;
  isFocus: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("muscles");
  const theme = useLoadTheme();
  const breakdown = useMuscleBreakdown(open && muscle != null);
  const entries = (muscle && breakdown.data?.[muscle]) || [];
  // Direct sets, not the assistance-inclusive tally: MEV/MAV are published in direct hard sets,
  // so comparing the padded number made biceps read "on target" off rows and pulldowns with zero
  // curls. Same fix landmarks.annotate_weekly_sets carries for the coach.
  const st = muscle && stat ? setStatus(muscle, stat.hardSets) : null;
  // A muscle can carry real load with zero DIRECT sets — the erectors are a primary mover on
  // almost nothing, so a heavy deadlift week leaves them loaded and their direct count at 0.
  // Showing the volume band there printed "0 direct sets · low (4-12)" immediately above a list of
  // the work still loading them: two true numbers that read as a contradiction. The band is for
  // muscles you actually train directly, so it is suppressed when there are none.
  const showBand = st != null && (stat?.hardSets ?? 0) > 0;
  const target = muscle ? SET_TARGET[muscle] : undefined;

  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      // parseLocalDay: bare calendar day, and `new Date` parses those as UTC midnight — west of
      // UTC every entry was dated a day early.
    }).format(parseLocalDay(iso));

  const days = [...new Set(entries.map((e) => e.date))];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {muscle && (
          <>
            <DrawerHeader className="text-left">
              <DrawerTitle className="flex items-center gap-1.5">
                {isFocus && (
                  <Star
                    className="h-3.5 w-3.5 shrink-0 fill-accent text-accent"
                    aria-label={t("focus")}
                  />
                )}
                {muscleLabel(muscle)}
              </DrawerTitle>
              <DrawerDescription className="sr-only">{t("detail.description")}</DrawerDescription>
              {stat && (
                <>
                  {/* Current load leads: it's what the figure is painting, and it's the number
                      that answers "can I train this today". Volume follows. */}
                  <p className="flex items-center gap-1.5 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          stat.load > 0 ? loadColor(loadHeat(stat.load), theme) : "transparent",
                        border: stat.load > 0 ? undefined : "1px solid var(--border)",
                      }}
                    />
                    <span className="tabular-nums">
                      {stat.load > 0
                        ? t("detail.load", { pct: Math.round(stat.load * 100) })
                        : t("detail.recovered")}
                    </span>
                  </p>
                  {/* The countdown the muscle rows show, repeated here: a coach review called its
                      absence the panel's biggest miss — the note below explains how long load
                      lasts in general, which is not the same as how long THIS load has left. */}
                  {stat.load > 0 && stat.readyInH != null && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {stat.readyInH >= 24
                        ? t("detail.clearIn", { count: Math.round(stat.readyInH / 24) })
                        : t("detail.clearInHours", { count: Math.round(stat.readyInH) })}
                    </p>
                  )}
                  {/* "0 direct sets" printed above a list of squats and deadlifts read as the
                      screen contradicting itself — two reviewers hit it independently. When
                      nothing was aimed at the muscle, say that in words instead of a bare zero. */}
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {stat.hardSets === 0 && entries.length > 0
                      ? t("detail.onlyIndirect")
                      : t("detail.thisWeek", { count: stat.hardSets })}
                    {stat.reps > 0 ? ` · ${stat.reps} ${t("unitReps")}` : ""}
                    {showBand && target && (
                      <>
                        {" · "}
                        <span style={{ color: STATUS_COLOR[st] }}>
                          {t(`status.${st}`)},{" "}
                          {t("detail.weekTarget", { min: target[0], max: target[1] })}
                        </span>
                      </>
                    )}
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                {/* No second number here. The line above already gives THIS muscle's countdown,
                    and a generic "usually clears in about 4 days" sitting next to a specific
                    "clear in about 6 days" only invites the reader to wonder which one is wrong. */}
                {t("detail.recoveryNote")}
              </p>
            </DrawerHeader>

            <div className="px-4 pb-6 space-y-3">
              {/* The sets line above counts a rolling week (MEV/MAV are weekly), while this list
                  spans the longer load window — so it can legitimately show more days than the
                  number above counts. Heading it avoids reading as arithmetic that doesn't add up. */}
              {entries.length > 0 && (
                <p className="text-xs text-muted-foreground">{t("detail.historyHeading")}</p>
              )}
              {breakdown.isLoading ? (
                <div className="py-6 flex justify-center">
                  <span className="h-6 w-6 rounded-full border-2 border-muted border-t-accent animate-spin" />
                </div>
              ) : entries.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("detail.noWork")}
                </p>
              ) : (
                days.map((date) => (
                  <div key={date}>
                    <p className="mb-1 text-xs text-muted-foreground capitalize">
                      {dayLabel(date)}
                    </p>
                    <div className="space-y-1">
                      {entries
                        .filter((e) => e.date === date)
                        .map((e) => (
                          <div
                            key={`${e.exerciseId}-${String(e.secondary)}`}
                            className="flex items-baseline justify-between gap-3 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              {e.exerciseName}
                              {e.secondary && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {t("detail.indirect")}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {/* Sets actually performed, not the weighted credit. "0.8 sets" is
                                  not a thing anyone did: it read as a typo next to a neighbouring
                                  "4 sets", and the same plank showed 3 here and 0.8 there. The
                                  "helped out" tag already says the credit is partial. */}
                              {t("detail.setsShort", { count: e.setsPerformed })}
                              {e.reps > 0 ? ` · ${e.reps} ${t("unitReps")}` : ""}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
