// Home "weekly muscle load" panel: an anatomical muscle map (front + back, heat-shaded) plus a
// per-muscle sets breakdown. Weekly only — the week/month toggle was cut on owner review
// (2026-08-02) along with most vertical air: the row list shows just the user's focus (starred)
// muscles by default (top rows as a fallback pre-intake), the rest unfold behind one button.
// Tapping a muscle — on the map or in the list — opens MuscleDetailSheet with the full story
// behind the number: which days, which exercises, how many sets.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronUp, Star } from "lucide-react";
import { Card } from "./ui/card";
import { MuscleMap2D, legendRamp, loadColor, useLoadTheme } from "./MuscleMap2D";
import { MuscleDetailSheet } from "./MuscleDetailSheet";
import { ErrorState } from "./States";
import { useMuscleVolume, useProfile } from "../lib/queries";
import { loadHeat, prioritizeFocus } from "../lib/muscle";
import { muscleLabel } from "../lib/muscleLabels";

// Pre-intake fallback: with no focus muscles stated yet, the collapsed list still shows the
// heaviest-worked rows instead of nothing.
const COLLAPSED_FALLBACK_ROWS = 4;
// Enough to pick from, few enough to read as a suggestion rather than a list of everything.
const CALLOUT_MUSCLES = 3;

export function MuscleLoadSection() {
  const { t } = useTranslation("muscles");
  const [selected, setSelected] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } = useMuscleVolume("week");
  const theme = useLoadTheme();
  // A supplementary personalization signal (COACHING_PLAN.md §8.2) — degrades to the unordered,
  // unbadged list below rather than blocking on it, same as elsewhere on Home.
  const focusMuscles = useProfile().data?.focus_muscles ?? [];

  // Ordered by CURRENT LOAD, not by the window's set count: the collapsed list shows only the
  // first few rows, and sorting by volume put the already-recovered muscles there — four empty
  // bars while the figure glowed for muscles hidden behind "show all".
  const byLoad = [...(data?.muscles ?? [])].sort((a, b) => b.load - a.load || b.sets - a.sets);
  const muscles = prioritizeFocus(byLoad, focusMuscles);
  const hasData = (data?.totalSets ?? 0) > 0 || muscles.some((m) => m.load > 0);
  const loadingFirst = !data && (isLoading || isFetching);
  // Named from the SAME rows the list shows, not from the coarse big-group taxonomy: that one
  // announced "Abs, Calves" while neither appeared among the eleven rows, and skipped Quads, the
  // one row actually marked clear. A card must not recommend something it doesn't also show.
  // Focus muscles first, then whichever carry the least residual work.
  const clear = muscles.filter((m) => m.load <= 0);
  const focusFirst = prioritizeFocus(clear, focusMuscles);
  const leastLoaded = focusFirst.slice(0, CALLOUT_MUSCLES);

  const focusSet = new Set(focusMuscles);
  const starredRows = muscles.filter((m) => focusSet.has(m.muscle));
  const collapsedRows = starredRows.length
    ? starredRows
    : muscles.slice(0, COLLAPSED_FALLBACK_ROWS);
  const rows = expanded ? muscles : collapsedRows;
  const hiddenCount = muscles.length - collapsedRows.length;

  const openMuscle = (m?: string) => {
    if (!m) return;
    setSelected(m);
    setSheetOpen(true);
  };
  const selectedStat = muscles.find((m) => m.muscle === selected) ?? null;

  return (
    <Card className="p-4">
      <h2 className="text-sm text-muted-foreground flex items-center gap-2">
        {t("title")}
        {isFetching && !loadingFirst && (
          <span className="h-3 w-3 rounded-full border-2 border-muted border-t-accent animate-spin" />
        )}
      </h2>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{t("subtitle")}</p>

      {loadingFirst ? (
        <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-muted border-t-accent animate-spin" />
          {t("computing")}
        </div>
      ) : isError ? (
        // A failed load must not masquerade as an empty week (the ?? fallbacks below would
        // otherwise silently read as "nothing trained yet") — same convention as Home's query gate.
        <ErrorState onRetry={refetch} />
      ) : (
        // The map renders even on a workless window — an unlit figure with the legend reads as
        // "everything rested", where hiding the whole panel used to read as a broken feature
        // every Monday morning.
        <>
          <MuscleMap2D muscles={muscles} selectedMuscle={selected} onSelectMuscle={openMuscle} />

          <Legend t={t} theme={theme} />

          {!hasData && (
            <p className="py-3 text-center text-sm text-muted-foreground">{t("empty")}</p>
          )}

          {hasData && leastLoaded.length > 0 && (
            <p className="mt-2 text-xs">
              <span className="text-muted-foreground">{t("readyNext")} </span>
              <span className="text-accent">
                {leastLoaded.map((m) => muscleLabel(m.muscle)).join(", ")}
              </span>
            </p>
          )}

          <div className={hasData ? "mt-2.5 space-y-0.5" : "hidden"}>
            {rows.map((m) => {
              // One question per row: how loaded is this muscle right now, and when is it ready
              // again. The weekly set count and its MEV/MAV status used to sit here too, in a
              // second colour language, and the two channels contradicted each other constantly
              // (a hot bar next to an amber "not enough" dot is the *normal* state after a first
              // session of the week). Volume now lives in the detail sheet, one tap away, where
              // its target range is actually visible instead of hidden in a hover tooltip.
              const heat = loadHeat(m.load);
              const hours = m.readyInH;
              return (
                <button
                  key={m.muscle}
                  type="button"
                  onClick={() => openMuscle(m.muscle)}
                  className="w-full flex items-center gap-2.5 text-left rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-32 shrink-0 text-sm truncate flex items-center gap-1">
                    {focusSet.has(m.muscle) && (
                      <Star
                        className="h-3 w-3 shrink-0 fill-accent text-accent"
                        aria-label={t("focus")}
                      />
                    )}
                    <span className="truncate">{muscleLabel(m.muscle)}</span>
                  </span>
                  <span
                    className="flex-1 h-2 rounded-full bg-secondary overflow-hidden"
                    title={
                      m.load > 0
                        ? t("loadTooltip", { pct: Math.round(m.load * 100) })
                        : t("recoveredTooltip")
                    }
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        // A recovered muscle leaves the track empty; anything still loaded keeps a
                        // visible sliver so the color is readable.
                        width: m.load > 0 ? `${Math.max(6, heat * 100)}%` : "0%",
                        backgroundColor: loadColor(heat, theme),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {hours > 0 ? (
                      readyIn(t, hours)
                    ) : (
                      // A tick, not a word: "ready" is an adjective and would have to agree with
                      // muscle names that differ in gender and number across four of the five
                      // languages. The label carries the meaning for screen readers.
                      <Check
                        className="inline h-3.5 w-3.5 text-muted-foreground"
                        aria-label={t("readyAria")}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <>
                  {t("collapse")} <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </>
              ) : (
                <>
                  {t("showAll", { n: muscles.length })}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </>
              )}
            </button>
          )}
        </>
      )}

      <MuscleDetailSheet
        muscle={selected ?? null}
        stat={selectedStat}
        isFocus={selected ? focusSet.has(selected) : false}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setSelected(undefined);
        }}
      />
    </Card>
  );
}

// Hours below a day stay in hours (the actionable resolution when you're deciding about today);
// past that, days — "in ~53 h" is precision the model does not have.
function readyIn(t: (k: string, o?: Record<string, unknown>) => string, hours: number) {
  const h = Math.max(1, Math.round(hours));
  return h < 24
    ? t("readyIn.hours", { n: h })
    : t("readyIn.days", { n: Math.max(1, Math.round(h / 24)) });
}

// The ramp is anchored to recovery, not to a set count: its left end is the colour a rested muscle
// actually wears on the figure, its right end a muscle carrying a full hard session. Labels name
// those states instead of numbers.
function Legend({ t, theme }: { t: (k: string) => string; theme: "dark" | "light" }) {
  // Starts at the resting fill (what an untrained muscle is painted) and skips the stretch of ramp
  // below RECOVERED_BELOW, which no muscle can ever be painted — otherwise the swatch under
  // "rested" is a colour the figure never shows.
  const ramp = legendRamp(theme);
  return (
    <div className="mt-2">
      <span
        className="block h-1.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${ramp.join(", ")})` }}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{t("legend.low")}</span>
        <span>{t("legend.mid")}</span>
        <span>{t("legend.high")}</span>
      </div>
    </div>
  );
}
