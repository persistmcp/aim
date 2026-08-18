// Home "consistency" hero card — the rolling-30-day regularity computed server-side against the
// user's OWN baseline (services._streak), never an absolute bar: a 2x/week and a 5x/week trainee
// both reach the top by holding their own rhythm. Replaces the old 3-tile stat grid; the same
// three numbers live in a compact row under the hero, and the bodyweight quick-edit affordance
// moved here with a visible gear icon (the old tappable tile gave no hint it was editable).
//
// The hero is a BARBELL heating up like steel in a forge (owner, 2026-08-01: the generic flame
// felt banal — "что-то со штангой, типа она разгорается"). It renders from continuous `heat`
// (0..1, services._streak's un-banded ratio): the glow starts at the bar's center and spreads
// outward through the plates, the metal's color runs cold steel → dull red → orange → near-white,
// the halo builds and, past mid-scale, breathes. Every session nudges it hotter — no per-band
// jumps. The integer level 0-6 remains the coarse public scale (tooltip, coach context) and the
// fallback when heat is absent. The barbell sits in a 30-tick bezel — one tick per day of the
// rolling window, lit = trained that day.
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
const FLAME_ANCHORS = [
  { size: 26, halo: 0.28, colors: ["#f59e0b", "#fbbf24", "#fde68a"] },
  { size: 29, halo: 0.42, colors: ["#f97316", "#fb923c", "#fed7aa"] },
  { size: 33, halo: 0.58, colors: ["#f97316", "#f59e0b", "#fbbf24"] },
  { size: 37, halo: 0.72, colors: ["#ef4444", "#f97316", "#fbbf24"] },
  { size: 42, halo: 0.87, colors: ["#dc2626", "#f97316", "#fde047"] },
  { size: 47, halo: 1, colors: ["#b91c1c", "#f97316", "#fef08a"] },
] as const;
const OUTLINE_SIZE = 21;
const FLAME_PATH =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 " +
  "6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

function flameSpec(t: number) {
  const f = Math.min(Math.max(t * 6, 1), 6) - 1;
  const lo = FLAME_ANCHORS[Math.floor(f)];
  const hi = FLAME_ANCHORS[Math.min(Math.ceil(f), FLAME_ANCHORS.length - 1)];
  const frac = f - Math.floor(f);
  return {
    size: lerp(lo.size, hi.size, frac),
    halo: lerp(lo.halo, hi.halo, frac),
    colors: lo.colors.map((c, i) => lerpHex(c, hi.colors[i], frac)) as [string, string, string],
  };
}

// Teardrop layers, outer → core: size as a fraction of the flame box, tiny lift off the base,
// and each one's breathing period/phase. Colors 0-2 come from the heat-interpolated anchor
// triple; the core stays near-white at any heat (the hottest point of a real flame).
const FLAME_LAYERS = [
  { frac: 0.78, lift: 0, period: 2.4, delay: 0 },
  { frac: 0.58, lift: 0.03, period: 1.9, delay: -0.6 },
  { frac: 0.41, lift: 0.045, period: 1.6, delay: -1.0 },
  { frac: 0.24, lift: 0.06, period: 1.3, delay: -0.3 },
] as const;
const CORE_COLOR = "#fefce8";

export function StreakFlame({
  level,
  heat = null,
  scale = 1,
  className = "",
}: {
  level: number;
  /** Continuous 0..1 intensity; falls back to level/6 when the backend didn't send one. */
  heat?: number | null;
  /** Shrinks the whole size ramp proportionally (bezel context caps the max size). */
  scale?: number;
  className?: string;
}) {
  const t = Math.min(Math.max(heat ?? level / 6, 0), 1);

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
  const layerColors = [base, mid, tip, CORE_COLOR];
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
        {FLAME_LAYERS.map((layer, i) => (
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
              boxShadow:
                i === 0
                  ? `0 0 ${(6 + 8 * spec.halo).toFixed(0)}px ${(2 + 3 * spec.halo).toFixed(0)}px ${mid}44`
                  : undefined,
            }}
          />
        ))}
      </span>
    </span>
  );
}

const BEZEL_SIZE = 88;
const BEZEL_R = 38;

// The window bezel: one tick per day of the rolling window (oldest first, the ring fills
// clockwise from the top). The window is 4 weeks, not 30 days, because 30 days is 4.286 weeks
// and the level computed over it flickered on calendar phase alone (services._streak).
// Decorative: the count next to it carries the number, the per-day breakdown is texture, not a
// control. Exported for the landing's showcase mockup, which mirrors this widget with static
// data. Tick count follows `days.length`, so it needs no change if the window ever moves again.
export function WindowRing({ days }: { days: boolean[] }) {
  const c = BEZEL_SIZE / 2;
  return (
    <svg width={BEZEL_SIZE} height={BEZEL_SIZE} className="absolute inset-0" aria-hidden>
      {days.map((trained, i) => {
        const a = (i / days.length) * 2 * Math.PI - Math.PI / 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return (
          <line
            key={i}
            x1={c + cos * (BEZEL_R - 3.5)}
            y1={c + sin * (BEZEL_R - 3.5)}
            x2={c + cos * (BEZEL_R + 3.5)}
            y2={c + sin * (BEZEL_R + 3.5)}
            strokeWidth={2.2}
            strokeLinecap="round"
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
  useEffect(() => {
    if (!levelTipOpen) return;
    const id = setTimeout(() => setLevelTipOpen(false), 2500);
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
            {/* Bezel 88 (sized up during the barbell exploration and kept — the hero earned
                the room): the flame's max size (47 × 1.12 ≈ 53) stays clear of the ticks. */}
            <StreakFlame level={level} heat={heat} scale={hasRing ? 1.12 : 1} />
          </button>
          {levelTipOpen && (
            <span
              role="status"
              className="animate-in fade-in-0 zoom-in-95 absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            >
              {t("home.streak.levelTooltip", { level })}
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
