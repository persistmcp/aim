// Home "weekly consistency" panel. Deliberately a weekly-target comparison against the user's
// own training_days_per_week (set during coach intake), not a daily streak — see
// docs/COACHING_PLAN.md §8.2 / §2.2 ("weekly adherence % / grace framing, not daily streaks", the
// broken-streak abstinence-violation effect). A day off doesn't reset anything, and there is no
// judgy copy for a week that falls short — the widget simply doesn't editorialize below target.
//
// Visual language borrowed from the owner-approved Figma Make direction ("Redesign workout
// cards.zip", directions A/C — the Consistency card was the piece that survived review): weekday
// letters live INSIDE circular day tokens instead of a pill row with a separate letter line, the
// count is the card's colored hero with its caption underneath, "target met" is a proper chip,
// a met week tints the whole card with a diagonal wash, and the tense state gets an amber edge
// bar + amber count. Urgency stays a cue, never punishment.
import { CalendarCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "./ui/card";
import { parseLocalDay } from "../lib/localDate";
import { useAdherence } from "../lib/queries";
import type { AdherenceDay } from "../data/workouts";

const ACCENT_MIX = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
const AMBER_MIX = (pct: number) => `color-mix(in srgb, var(--status-caution) ${pct}%, transparent)`;
const GOOD_MIX = (pct: number) => `color-mix(in srgb, var(--status-good) ${pct}%, transparent)`;

// Diagonal wash for a met week — the export's linear tint reads calmer than the goal card's
// radial glow, and (learned the hard way, see FeaturedGoalCard) it must never fade to a value
// the eye reads as black; 55%-of-nothing at the far corner is fine here because the tint's
// bright pole covers most of the small card.
const MET_WASH = `linear-gradient(135deg, ${ACCENT_MIX(10)} 0%, transparent 55%)`;
const TENSE_WASH = `linear-gradient(90deg, ${AMBER_MIX(7)} 0%, transparent 35%)`;

function DayToken({ day, letter, accent }: { day: AdherenceDay; letter: string; accent: string }) {
  const { t } = useTranslation();
  const label = t(`home.adherence.day.${day.state}`, { date: day.date });
  const base =
    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] leading-none select-none";
  const byState: Record<AdherenceDay["state"], { cls: string; style?: React.CSSProperties }> = {
    done: {
      cls: `${base} font-medium text-accent-foreground`,
      style: { background: accent, boxShadow: `0 0 6px ${ACCENT_MIX(35)}` },
    },
    today: {
      cls: `${base} text-foreground ring-2`,
      style: { background: "var(--muted)", ["--tw-ring-color" as string]: ACCENT_MIX(60) },
    },
    future: { cls: `${base} border border-dashed border-border text-muted-foreground` },
    rest: { cls: `${base} bg-border/50 text-muted-foreground opacity-60` },
  };
  const s = byState[day.state];
  return (
    <span role="img" aria-label={label} title={label} className={s.cls} style={s.style}>
      {letter}
    </span>
  );
}

export function AdherenceWidget() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useAdherence();

  // No target yet (pre-intake, or the user never told the coach a weekly frequency) — nothing to
  // compare against, so stay silent rather than show a number with no meaning. The plain workout
  // count already lives on the existing Home stat tile. Falsy (not just null) on purpose: a
  // target of 0 would render "0 / 0" with an always-true "target met" badge.
  if (isLoading || isError || !data || !data.target_per_week) return null;

  const { sessions_this_week: done, target_per_week: target, days, tone } = data;
  const met = done >= target;
  const tense = tone === "tense";
  const accent = tense ? "var(--status-caution)" : "var(--accent)";
  // parseLocalDay: these are bare calendar days, and `new Date` reads them as UTC midnight, so
  // west of UTC every pill in the week row was labelled with the previous weekday — the "today"
  // pill showed yesterday's letter.
  const dayLetter = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" }).format(parseLocalDay(iso));

  return (
    <Card
      className="relative overflow-hidden p-4"
      style={{
        borderColor: met ? ACCENT_MIX(22) : tense ? AMBER_MIX(25) : undefined,
      }}
    >
      {(met || tense) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: met ? MET_WASH : TENSE_WASH }}
        />
      )}
      {tense && (
        <div
          aria-hidden
          className="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ background: `linear-gradient(180deg, ${AMBER_MIX(93)}, ${AMBER_MIX(33)})` }}
        />
      )}
      <div className="relative">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarCheck
            className="h-4 w-4 shrink-0"
            style={{ color: tense ? "var(--status-caution)" : "var(--accent)" }}
            aria-hidden
          />
          <h2 className="text-sm text-muted-foreground">{t("home.adherence.title")}</h2>
          {met && (
            <span
              className="ml-auto rounded-md border px-2 py-0.5 text-[11px] leading-tight"
              style={{
                color: "var(--status-good)",
                borderColor: GOOD_MIX(25),
                background: GOOD_MIX(12),
              }}
            >
              {t("home.adherence.met")}
            </span>
          )}
        </div>
        <div className="mb-2.5">
          <div
            className="whitespace-nowrap text-[2rem] font-medium leading-none tabular-nums"
            style={{
              color: met ? "var(--accent)" : tense ? "var(--status-caution)" : "var(--foreground)",
              // A text glow, not an elevation shadow (those stay banned) — soft enough that on
              // the light theme it disappears into the page instead of smearing the numeral.
              filter: met ? `drop-shadow(0 0 10px ${ACCENT_MIX(35)})` : undefined,
            }}
          >
            {t("home.adherence.count", { done, target })}
          </div>
          <div
            className="mt-1 text-[11px]"
            style={{ color: tense ? AMBER_MIX(85) : "var(--muted-foreground)" }}
          >
            {tense ? t("home.adherence.tense") : t("home.adherence.weekCaption")}
          </div>
        </div>
        {(days?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            {days.map((day) => (
              <DayToken key={day.date} day={day} letter={dayLetter(day.date)} accent={accent} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
