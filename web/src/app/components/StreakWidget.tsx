// Home "consistency" hero card — the flame, the day bezel and the three numbers under it.
//
// The level and the continuous `heat` both come from services._streak, which since 2026-08-29 is
// a FUEL GAUGE: every training day adds a fixed fraction of a full fire, the fire decays with a
// half-life of three of the user's own expected intervals, and the score is that store clipped
// at 1. There is no window and no ratio any more (docs/CONSISTENCY_FLAME.md). Two consequences
// live in this file: `heat` runs on SEVEN bands rather than saturating at six, and the bezel is a
// calendar that fades with age plus a cold arc, never a scale — see WindowRing.
//
// The flame itself is the owner-picked direction (C of five researched prototypes: turbulence
// displacement, gooey particles, layered candle, sprite flipbook, path morphing): four teardrop
// layers, outer body through to a near-white core, each breathing its own border-radius on a
// separate phase while the whole flame leans and stretches from its base. Pure CSS (no SMIL, no
// SVG filters): cheap on mobile, and prefers-reduced-motion is handled by the stylesheet media
// block for free. Size, layer colors, glow and every animation period interpolate from `heat`,
// so the fire grows with every session instead of jumping once per band.
import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "./ui/card";

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpHex = (a: string, b: string, f: number) => {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(lerp(ch(a, i), ch(b, i), f));
  return `#${[c(0), c(1), c(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// ── Living flame hero — layered candle ─────────────────────────────────────────────────────
// The owner-picked direction (C of five researched prototypes: turbulence displacement, gooey
// particles, layered candle, sprite flipbook, path morphing): four teardrop layers — outer body
// through to a near-white core — each breathing its own border-radius on a separate phase while
// the whole flame leans and stretches from its base. Pure CSS (no SMIL, no SVG filters): cheap
// on mobile, and prefers-reduced-motion is handled by the stylesheet media block for free.
// Size, layer colors, glow and every animation period interpolate from continuous `heat`
// (services._streak) — the flame grows fuller, hotter-colored and livelier with every session.
// SEVEN anchors, not six: the backend gave the top band its own segment on 2026-08-29, so `heat`
// now runs 1/7..1 instead of saturating at 1.0 for every score above 0.86. Without a seventh
// anchor the whole top band would still render at one size — which was half of the complaint that
// caused the rework (a full 10-day layoff used to move the flame by under a pixel). Keep this list
// in step with services._STREAK_BANDS: one anchor per band boundary, plus one for the top.
// Seven anchors, one per band boundary plus the top (services._STREAK_BANDS + the 2026-08-29
// seventh segment). Reworked 2026-08-30 after the owner reported that his level-4 flame "looks
// like a full 6", which measurement confirmed: the old ramp moved SIZE and almost nothing else.
// Its mid colour was frozen at #f97316 across five of the seven anchors, the layer proportions
// were constants, and the near-white core was present at every level including the first — so the
// whole upper half of the scale was one drawing at slightly different sizes, 4-6px apart.
//
// What changes now, in order of how much work each channel does:
//   * `layers` — how many teardrops are drawn at all. A low fire is a shapeless glow (2), a full
//     one has a distinct envelope, body, inner cone and white-hot core (4). This is a STRUCTURAL
//     difference, the only kind that survives being 30px wide on a phone.
//   * `core` — no longer a constant. Near the bottom it equals the mid colour, so there is no
//     bright centre at all; only the top two anchors are near-white.
//   * mid/tip ramp dull red → orange → yellow → cream, monotonically brighter.
//   * halo runs 0.05 → 1 instead of 0.28 → 1, and its alpha now scales too (see StreakFlame).
//   * size runs 22 → 57 instead of 26 → 53. At scale 1.12 that is 24.6 → 63.8px, and the bezel's
//     inner tick radius leaves 69px clear, so the top still fits with room for the ring to
//     stay readable behind it.
// The outer envelope stays red at every level on purpose: real flames have red edges, and it is
// the INTERIOR that must brighten. Making the envelope brighter at the bottom is what made a dying
// fire read as a cheerful amber one.
const FLAME_ANCHORS = [
  { size: 22, halo: 0.05, layers: 2, colors: ["#6b2020", "#7f2323", "#8a2b1e"], core: "#8a2b1e" },
  { size: 27, halo: 0.13, layers: 2, colors: ["#8a1f1f", "#a32a20", "#c2410c"], core: "#c2410c" },
  { size: 33, halo: 0.26, layers: 3, colors: ["#a51f1f", "#c2410c", "#ea580c"], core: "#f59e0b" },
  { size: 40, halo: 0.43, layers: 3, colors: ["#b91c1c", "#dc2626", "#f59e0b"], core: "#fbbf24" }, // level 4
  { size: 47, halo: 0.63, layers: 4, colors: ["#b91c1c", "#ea580c", "#fbbf24"], core: "#fde047" }, // level 5
  { size: 54, halo: 0.84, layers: 4, colors: ["#a41616", "#f97316", "#fde047"], core: "#fef3c7" },
  { size: 57, halo: 1, layers: 4, colors: ["#991b1b", "#fb923c", "#fef08a"], core: "#fefce8" },
] as const;
const OUTLINE_SIZE = 21;
const FLAME_PATH =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 " +
  "6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

function flameSpec(t: number) {
  const f = Math.min(Math.max(t * 7, 1), 7) - 1;
  const lo = FLAME_ANCHORS[Math.floor(f)];
  const hi = FLAME_ANCHORS[Math.min(Math.ceil(f), FLAME_ANCHORS.length - 1)];
  const frac = f - Math.floor(f);
  return {
    size: lerp(lo.size, hi.size, frac),
    halo: lerp(lo.halo, hi.halo, frac),
    // Layer COUNT cannot be interpolated — it is the structural channel, so it steps, and it
    // steps exactly ON the band boundary (take the low anchor, never round toward the high one).
    // Rounding at the midpoint was the first attempt and it was wrong in the one place that
    // matters: the top of level 4 already drew four layers, so it looked identical to 5 and 6 —
    // which is the exact complaint this rework exists to answer. Constant within a level, changed
    // when the number changes.
    layers: lo.layers,
    colors: lo.colors.map((c, i) => lerpHex(c, hi.colors[i], frac)) as [string, string, string],
    core: lerpHex(lo.core, hi.core, frac),
  };
}

// Teardrop layers, outer → core: size as a fraction of the flame box, tiny lift off the base, and
// each one's breathing period/phase. How MANY of them are drawn comes from the heat-interpolated
// anchor (2 at the bottom, 4 at the top) — that count is the strongest signal on the card, because
// a shapeless glow and a four-layer flame with a white-hot centre do not read as the same object
// at any size. Colors 0-2 and the core all come from the anchor too; the core is deliberately NOT
// a constant, or a dying fire keeps a bright centre and looks healthy.
const FLAME_LAYERS = [
  { frac: 0.78, lift: 0, period: 2.4, delay: 0 },
  { frac: 0.58, lift: 0.03, period: 1.9, delay: -0.6 },
  { frac: 0.41, lift: 0.045, period: 1.6, delay: -1.0 },
  { frac: 0.24, lift: 0.06, period: 1.3, delay: -0.3 },
] as const;

export function StreakFlame({
  level,
  heat = null,
  scale = 1,
  className = "",
}: {
  level: number;
  /** Continuous 0..1 intensity; falls back to level/7 when the backend didn't send one. */
  heat?: number | null;
  /** Shrinks the whole size ramp proportionally (bezel context caps the max size). */
  scale?: number;
  className?: string;
}) {
  const t = Math.min(Math.max(heat ?? level / 7, 0), 1);

  if (t <= 0) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={{ width: OUTLINE_SIZE * scale, height: OUTLINE_SIZE * scale }}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.6}
        aria-hidden
      >
        <path d={FLAME_PATH} />
      </svg>
    );
  }

  const spec = flameSpec(t);
  const [base, mid, tip] = spec.colors;
  const layerColors = [base, mid, tip, spec.core];
  const layers = FLAME_LAYERS.slice(0, spec.layers);
  const size = spec.size * scale;
  const width = size * 0.82;
  // Livelier with heat: all periods shorten together as t grows.
  const speed = 1 - 0.35 * t;

  return (
    <span
      className={`relative inline-flex items-end justify-center ${className}`}
      style={{ width, height: size }}
      aria-hidden
    >
      <span
        className="absolute rounded-full"
        style={{
          inset: "-15%",
          background: `radial-gradient(circle at 50% 62%, ${base} 0%, transparent 68%)`,
          opacity: spec.halo * 0.3,
        }}
      />
      <span
        className="animate-flame-body absolute inset-0"
        style={{
          transformOrigin: "50% 100%",
          animationDuration: `${(3.4 - 1.6 * t).toFixed(2)}s`,
        }}
      >
        {layers.map((layer, i) => (
          <span
            key={i}
            data-flame-layer={i}
            className="animate-flame-drop absolute"
            style={{
              width: width * layer.frac,
              height: width * layer.frac,
              left: "50%",
              bottom: size * layer.lift,
              background: layerColors[i],
              borderRadius: "50% 2% 50% 50%",
              transform: "translateX(-50%) rotate(-45deg)",
              animationDuration: `${(layer.period * speed).toFixed(2)}s`,
              animationDelay: `${layer.delay}s`,
              // Only the body layer casts the outer glow — stacking four shadows just muddies.
              // Alpha scales with heat as well as the blur radius. It used to be a hardcoded
              // `44` (0.27) at every level, so the glow — the one channel that reads at a glance
              // on a dark card — was identical for a dying fire and a roaring one.
              boxShadow:
                i === 0
                  ? `0 0 ${(4 + 14 * spec.halo).toFixed(0)}px ${(1 + 5 * spec.halo).toFixed(0)}px ${mid}${Math.round(
                      20 + 200 * spec.halo,
                    )
                      .toString(16)
                      .padStart(2, "0")}`
                  : undefined,
            }}
          />
        ))}
      </span>
    </span>
  );
}

// The bezel: one tick per day of the last four weeks, oldest first, filling clockwise from the
// top. It is a CALENDAR, not the flame's scale — and after 2026-08-29 it had to stop pretending
// otherwise. The flame is now a fuel gauge with no window at all, so a plain count of lit ticks
// actively contradicts it: four ticks (1x/week, on rhythm) render a full fire, while eighteen
// ticks (6x/week, day seven of a rest week) render a nearly dead one. Sitting inside the flame's
// own tap target, that reads as an explanation, and it was the wrong one.
//
// Two changes make it agree with the fire instead. Lit ticks FADE WITH AGE, because that is
// exactly what the fuel model does to them — an old session warms you less than a recent one, and
// the ring now shows it without a word of copy. And the stretch from the last session to today is
// drawn as a COLD ARC: continuous, thicker, in the muted colour. That arc is the single quantity
// the level actually responds to, so the picture and the number finally answer the same question.
const BEZEL_SIZE = 88;
const BEZEL_R = 38;
// Age → opacity for a lit tick. Mirrors the fuel model's shape, not its arithmetic: a session
// inside the last week still counts for nearly all of its warmth, and by four weeks it is nearly
// spent. Deliberately coarse — this is texture, not a readout.
const TICK_FADE = [
  { withinDays: 7, opacity: 1 },
  { withinDays: 14, opacity: 0.7 },
  { withinDays: 21, opacity: 0.45 },
  { withinDays: Infinity, opacity: 0.25 },
] as const;

export function WindowRing({ days }: { days: boolean[] }) {
  const c = BEZEL_SIZE / 2;
  const lastTrained = days.lastIndexOf(true);
  // Days since the last session — the cold arc's length. -1 (never trained in the window) makes
  // the whole ring cold, which is the honest picture for someone whose fire is out.
  const coldFrom = lastTrained === -1 ? 0 : lastTrained + 1;
  const angle = (i: number) => (i / days.length) * 2 * Math.PI - Math.PI / 2;
  const point = (i: number, r: number) => [c + Math.cos(angle(i)) * r, c + Math.sin(angle(i)) * r];

  let coldPath = "";
  if (coldFrom < days.length) {
    // A single arc from the day after the last session through today. Drawn on the tick radius so
    // it reads as the same ring, not a second one.
    const [x1, y1] = point(coldFrom - 0.5, BEZEL_R);
    const [x2, y2] = point(days.length - 0.5, BEZEL_R);
    const sweep = (days.length - coldFrom) / days.length;
    coldPath = `M ${x1} ${y1} A ${BEZEL_R} ${BEZEL_R} 0 ${sweep > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  }

  return (
    <svg width={BEZEL_SIZE} height={BEZEL_SIZE} className="absolute inset-0" aria-hidden>
      {coldPath && (
        <path
          d={coldPath}
          fill="none"
          strokeWidth={3.5}
          strokeLinecap="round"
          stroke="color-mix(in srgb, var(--foreground) 18%, transparent)"
        />
      )}
      {days.map((trained, i) => {
        const cos = Math.cos(angle(i));
        const sin = Math.sin(angle(i));
        const age = days.length - 1 - i;
        const opacity = TICK_FADE.find((f) => age < f.withinDays)?.opacity ?? 0.25;
        return (
          <line
            key={i}
            x1={c + cos * (BEZEL_R - 3.5)}
            y1={c + sin * (BEZEL_R - 3.5)}
            x2={c + cos * (BEZEL_R + 3.5)}
            y2={c + sin * (BEZEL_R + 3.5)}
            strokeWidth={2.2}
            strokeLinecap="round"
            opacity={trained ? opacity : 1}
            stroke={
              trained ? "var(--accent)" : "color-mix(in srgb, var(--foreground) 10%, transparent)"
            }
          />
        );
      })}
    </svg>
  );
}

export function StreakWidget({
  level,
  heat = null,
  countWindow,
  daysWindow = null,
  lastWorkoutLabel = null,
  bodyweight,
  workoutsWeek,
  volumeWeekKg,
  onEditWeight,
}: {
  level: number;
  heat?: number | null;
  countWindow: number;
  /** Last 4 weeks, oldest→newest, true = trained that day. Absent → plain flame, no bezel. */
  daysWindow?: boolean[] | null;
  /** Pre-localized "last workout: N days ago" line (moved here from the Home header). */
  lastWorkoutLabel?: string | null;
  bodyweight: number | null;
  workoutsWeek: number;
  volumeWeekKg: number;
  onEditWeight?: () => void;
}) {
  const { t } = useTranslation();
  const [levelTipOpen, setLevelTipOpen] = useState(false);
  const hasRing = (daysWindow?.length ?? 0) > 0;

  // Self-dismiss: a tooltip that needs a second, aimed tap to get rid of is a chore on touch.
  // 4.5s, not 2.5: it carries two lines since 2026-08-29, and the second one is the only place
  // the app explains what the number means.
  useEffect(() => {
    if (!levelTipOpen) return;
    const id = setTimeout(() => setLevelTipOpen(false), 4500);
    return () => clearTimeout(id);
  }, [levelTipOpen]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        {/* The 0-6 scale is otherwise invisible — the barbell's glow alone doesn't tell the user
            a ladder exists or where they are on it. Hand-rolled tap-toggled tooltip rather than
            Radix's (which opens on hover/focus only and closes itself on trigger click — the
            exact gesture a phone user has). Auto-hides; tapping again dismisses early. */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setLevelTipOpen((o) => !o)}
            aria-label={t("home.streak.levelTooltip", { level })}
            className="relative flex cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              width: hasRing ? BEZEL_SIZE : 64,
              height: hasRing ? BEZEL_SIZE : 64,
            }}
          >
            {hasRing && <WindowRing days={daysWindow as boolean[]} />}
            {/* Bezel 88: the flame's max size (53 × 1.12 ≈ 59) stays clear of the ticks, whose
                inner radius is 34.5 → 69px of clear diameter. */}
            <StreakFlame level={level} heat={heat} scale={hasRing ? 1.12 : 1} />
          </button>
          {levelTipOpen && (
            <span
              role="status"
              className="animate-in fade-in-0 zoom-in-95 absolute left-0 top-full z-10 mt-1 block w-56 whitespace-normal rounded-md bg-primary px-3 py-1.5 text-left text-xs leading-snug text-primary-foreground"
            >
              {t("home.streak.levelTooltip", { level })}
              <span className="mt-0.5 block opacity-80">{t("home.streak.levelHint")}</span>
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-medium tabular-nums leading-tight">{countWindow}</div>
          <div className="block whitespace-nowrap text-sm text-muted-foreground">
            {t("home.streak.countWindow")}
          </div>
          {lastWorkoutLabel && (
            <div className="mt-0.5 text-xs text-muted-foreground">{lastWorkoutLabel}</div>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex border-t border-border pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
            {t("home.streak.weight")}
          </span>
          {onEditWeight ? (
            <button
              type="button"
              onClick={onEditWeight}
              className="flex w-fit cursor-pointer items-center gap-1 rounded text-[15px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {bodyweight != null ? t("units.kg", { value: bodyweight }) : "·"}
              <Settings2 className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
          ) : (
            <span className="text-[15px] tabular-nums">
              {bodyweight != null ? t("units.kg", { value: bodyweight }) : "·"}
            </span>
          )}
        </div>
        <div className="ml-2.5 flex min-w-0 flex-1 flex-col gap-0.5 border-l border-border pl-2.5">
          <span className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
            {t("home.streak.workoutsWeek")}
          </span>
          <span className="text-[15px] tabular-nums">{workoutsWeek}</span>
        </div>
        <div className="ml-2.5 flex min-w-0 flex-1 flex-col gap-0.5 border-l border-border pl-2.5">
          <span className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
            {t("home.streak.volumeWeek")}
          </span>
          <span className="text-[15px] tabular-nums">
            {t("units.tons", { value: (volumeWeekKg / 1000).toFixed(1) })}
          </span>
        </div>
      </div>
    </Card>
  );
}
