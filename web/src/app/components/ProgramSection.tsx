// Home "current program" panel: Day A / Day B tabs, exercises grouped by superset, each row taps
// open to reveal how-to instructions from the exercise catalog. Source of truth is the planned
// program (day_templates), so the numbers shown are targets, not last-session facts.

import { useState } from "react";
import { ChevronDown, Dumbbell } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card } from "./ui/card";
import { ErrorState, Loading } from "./States";
import { muscleLabel } from "../lib/muscleLabels";
import { useExerciseCatalog, useProgram } from "../lib/queries";
import type { ExerciseInfo, ProgramBlock, ProgramItem } from "../data/workouts";

// Last-resort readable fallback for raw catalog slugs (goblet_squat → "goblet squat") — the API
// resolves names into the program payload, so this only fires for orphaned exercise_ids.
const humanize = (slug: string) => slug.replace(/^ex[_-]/, "").replace(/[_-]+/g, " ");

// Day focus arrives as a free-form slug from the coach (full_body, upper, …). Known values get a
// proper translation; anything else is at least de-slugged.
const FOCUS_VALUES = new Set([
  "full_body",
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "arms",
  "core",
  "cardio",
  "mobility",
]);
const focusLabel = (focus: string, t: TFunction<"program">) =>
  FOCUS_VALUES.has(focus) ? t(`focus.${focus}`) : humanize(focus);

const repsLabel = (it: ProgramItem) => {
  if (it.repMin == null && it.repMax == null) return null;
  if (it.repMin != null && it.repMax != null && it.repMin !== it.repMax)
    return `${it.repMin}–${it.repMax}`;
  return String(it.repMax ?? it.repMin);
};

// A plank's target is 30-60 SECONDS and a run's is 15-45 MINUTES, in the same field a bench
// press uses for reps. Rendered bare, "3×30–60" reads as thirty repetitions of a plank.
const doseSuffix = (info: ExerciseInfo | undefined, t: TFunction<"program">) =>
  info?.doseUnit && info.doseUnit !== "reps" ? ` ${t(`doseUnit.${info.doseUnit}`)}` : "";

const targetLabel = (it: ProgramItem, t: TFunction<"program">, info?: ExerciseInfo) => {
  const reps = repsLabel(it);
  if (it.targetSets && reps) return `${it.targetSets}×${reps}${doseSuffix(info, t)}`;
  if (it.targetSets) return t("setsShort", { n: it.targetSets });
  return reps ? `${reps}${doseSuffix(info, t)}` : "";
};

function ExerciseRow({ item, info }: { item: ProgramItem; info?: ExerciseInfo }) {
  const { t } = useTranslation("program");
  const [open, setOpen] = useState(false);
  const name = item.exerciseName ?? info?.name ?? humanize(item.exerciseId);
  const target = targetLabel(item, t, info);

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded"
      >
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        <span className="flex-1 text-sm">{name}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{target}</span>
        {item.targetWeight != null && (
          <span className="text-sm tabular-nums w-14 text-right">
            {t("kg", { n: item.targetWeight })}
          </span>
        )}
      </button>

      {open && (
        <div className="pb-3 pl-7 pr-1 space-y-2 text-sm text-muted-foreground">
          {info?.primaryMuscles?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {info.primaryMuscles.map((m) => (
                <span key={m} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/80">
                  {muscleLabel(m)}
                </span>
              ))}
            </div>
          ) : null}
          {info?.imageUrls?.length ? (
            /* Start and end position of the movement. Line art ("ink") is a black alpha mask, so
               dark theme inverts it rather than painting a white slab across the card. A colour
               illustration ("photo") carries its own light ground and must be left alone —
               inverting it turns a red highlighted muscle cyan. */
            <figure className="m-0 space-y-1">
              <div className="flex gap-2">
                {info.imageUrls.slice(0, 2).map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={t("frame", { n: i + 1, name: item.exerciseName ?? info.name })}
                    loading="lazy"
                    className={`h-28 w-1/2 rounded object-contain ${
                      info.imageStyle === "photo" ? "bg-white" : "bg-transparent dark:invert"
                    }`}
                  />
                ))}
              </div>
              {info.imageAttribution && (
                /* CC BY-SA: the credit has to be visible wherever the image is. */
                <figcaption className="text-[10px] text-muted-foreground/70">
                  {info.imageAttribution}
                </figcaption>
              )}
            </figure>
          ) : null}
          {info?.instructions ? (
            <p className="whitespace-pre-line leading-relaxed">{info.instructions}</p>
          ) : (
            <p className="italic">{t("noInstructions")}</p>
          )}
          {item.notes && <p className="text-foreground/70">{t("note", { text: item.notes })}</p>}
          {info?.videoUrl && (
            <a
              href={info.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-accent underline"
            >
              {t("video")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Block({
  block,
  index,
  catalog,
}: {
  block: ProgramBlock;
  index: number;
  catalog?: Map<string, ExerciseInfo>;
}) {
  const { t } = useTranslation("program");
  const isSuperset = block.type === "superset" && block.items.length > 1;
  const heading = block.label ?? (isSuperset ? t("superset", { n: index + 1 }) : null);
  return (
    <div>
      {heading && (
        <div className="text-xs uppercase tracking-wide text-muted-foreground mt-3 mb-0.5">
          {heading}
        </div>
      )}
      {block.items.map((it, i) => (
        <ExerciseRow key={`${it.exerciseId}-${i}`} item={it} info={catalog?.get(it.exerciseId)} />
      ))}
    </div>
  );
}

export function ProgramSection() {
  const { t } = useTranslation("program");
  const program = useProgram();
  const catalog = useExerciseCatalog();
  const [dayIdx, setDayIdx] = useState(0);

  // A failed load must not masquerade as "no program yet" (same convention as Home/Progress/
  // MuscleLoadSection's query gates) — and "no program yet" itself needs a visible CTA rather
  // than silently rendering nothing, or a new user has no way to know this panel exists at all.
  if (program.isLoading) {
    return (
      <Card className="p-4">
        <Loading />
      </Card>
    );
  }
  if (program.isError) {
    return (
      <Card className="p-4">
        <ErrorState onRetry={program.refetch} />
      </Card>
    );
  }
  if (!program.data || program.data.days.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-2 mb-1">
          <Dumbbell className="w-4 h-4 mt-0.5 text-accent shrink-0" aria-hidden />
          <h2 className="text-sm">{t("title")}</h2>
        </div>
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      </Card>
    );
  }

  const p = program.data;
  // Clamp once and use everywhere: a program refetch can shrink `days` below a previously
  // selected index — the content already clamped, but the tabs compared against the raw index,
  // leaving no tab marked selected while day N-1's content rendered.
  const activeIdx = Math.min(dayIdx, p.days.length - 1);
  const day = p.days[activeIdx];

  return (
    <Card className="p-4">
      <div className="flex items-start gap-2 mb-3">
        <Dumbbell className="w-4 h-4 mt-0.5 text-accent shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm">{t("title")}</h2>
          <p className="text-xs text-muted-foreground truncate">{p.name}</p>
        </div>
      </div>

      {p.days.length > 1 && (
        <div className="flex gap-1.5 mb-1" role="tablist" aria-label={t("daysAria")}>
          {p.days.map((d, i) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={i === activeIdx}
              onClick={() => setDayIdx(i)}
              className={`flex-1 rounded-md py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                i === activeIdx
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {(day.focus || day.durationMin) && (
        <p className="text-xs text-muted-foreground mt-2">
          {[
            day.focus ? focusLabel(day.focus, t) : null,
            day.durationMin ? t("duration", { n: day.durationMin }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className="mt-1">
        {day.blocks.map((b, i) => (
          <Block key={i} block={b} index={i} catalog={catalog.data} />
        ))}
      </div>
    </Card>
  );
}
