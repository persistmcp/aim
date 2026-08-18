// Muscle silhouette (front + back, side-by-side) via `react-muscle-highlighter` — a clean, shaded
// anatomical figure whose whole body is visible, with worked muscle groups tinted by weekly load.
// Selection is controlled from the parent so the map and the breakdown list stay in sync (tap a
// muscle → its list row highlights, and vice-versa).

import { useEffect, useMemo, useState } from "react";
import Body from "react-muscle-highlighter";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { PeriodToggle } from "./PeriodToggle";
import type { MuscleStat } from "../lib/muscleVolume";
import { loadHeat } from "../lib/muscle";

// Flame ramps for the load heat, one per theme. Both end RED — the conventional "this is maxed
// out" colour — and both climb in monotone lightness away from their surface, which is what the
// old ramp lacked: its stone→amber→red stops all sat at roughly the same lightness, so every
// mid-range load collapsed into the same two or three shades.
//
// Ending red is what constrains the dark ramp: a red can't also be light, so the reachable
// contrast range is narrower than an amber→yellow ramp would give (OKLab spread 32 vs 44 on the
// light theme). The stops below are the widest spread found by sweeping OKLCH lightness/hue/chroma
// under the constraints "top is unambiguously red" and "contrast rises at every step" — don't
// hand-edit one stop, re-run the sweep, or the middle of the ramp silently flattens again.
export const LOAD_GRADIENT_DARK = [
  "#4f463c",
  "#694a2c",
  "#844b17",
  "#9f4900",
  "#b84600",
  "#d04302",
  "#e54225",
  "#f94140",
];
// Light theme darkens with load instead of brightening — same red destination, opposite direction,
// because on a pale card the hottest muscle has to be the darkest thing to stay the loudest.
export const LOAD_GRADIENT_LIGHT = [
  "#d5d1c3",
  "#d2bc8f",
  "#d3a35b",
  "#d48728",
  "#d16900",
  "#c84c00",
  "#b92e00",
  "#a70511",
];
// Resting (recovered) muscle fill per theme. The library's `defaultFill` prop cannot do this: its
// figure assets bake `color: "#3f3f3f"` into every body part, and a part's own color wins over
// defaultFill — so on a light card every untrained muscle rendered near-black. The fix is to pass
// an explicit color for EVERY slug, which means listing them.
const RESTING_FILL = { dark: "#3f3f3f", light: "#dcd8d2" } as const;
// Every body-part slug the front and back figures draw, minus head/hair (not data, and their own
// asset colors read fine in both themes).
const ALL_SLUGS = [
  "chest",
  "obliques",
  "abs",
  "biceps",
  "triceps",
  "neck",
  "trapezius",
  "deltoids",
  "adductors",
  "quadriceps",
  "knees",
  "tibialis",
  "calves",
  "forearm",
  "hands",
  "ankles",
  "feet",
  "upper-back",
  "lower-back",
  "gluteal",
  "hamstring",
];
// Selection highlight. NOT the app's lime accent: the load ramp runs pale -> amber -> deep red,
// so a lime muscle was the only green thing on the figure and read as "this one is fine" —
// precisely backwards for a muscle sitting at 85%. Blue is outside the ramp entirely, so it can
// only mean "this is the one you tapped".
const SELECTED = { light: "#2563eb", dark: "#60a5fa" } as const;

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** App theme for the load colors; dark-first, matching ThemeProvider's default. */
export function useLoadTheme(): "dark" | "light" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? "light" : "dark";
}

/** Colour stops for the panel legend. Starts at the resting fill — the colour an untrained muscle
 * actually wears on the figure, which is not part of the ramp — then runs the ramp end to end.
 * `loadHeat` already rescales so its whole span is reachable, so the legend and the figure show
 * the same colours for the same states. */
export function legendRamp(theme: "dark" | "light"): string[] {
  const ramp = theme === "light" ? LOAD_GRADIENT_LIGHT : LOAD_GRADIENT_DARK;
  return [RESTING_FILL[theme], ...ramp];
}

export function loadColor(t: number, theme: "dark" | "light" = "dark"): string {
  const ramp = theme === "light" ? LOAD_GRADIENT_LIGHT : LOAD_GRADIENT_DARK;
  const c = t > 0 ? Math.min(1, t) : 0; // also catches NaN, which would index the ramp out of range
  const seg = c * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * f);
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
}

// Our 27-group taxonomy → the library's coarse slugs. Primaries first so the reverse map (slug →
// our muscle) resolves a shared slug to its main muscle.
const OUR_TO_SLUG: Record<string, string> = {
  chest: "chest",
  lats: "upper-back",
  upper_back: "upper-back",
  traps: "trapezius",
  front_delts: "deltoids",
  side_delts: "deltoids",
  rear_delts: "deltoids",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearm",
  abs: "abs",
  obliques: "obliques",
  lower_back: "lower-back",
  glutes: "gluteal",
  quads: "quadriceps",
  adductors: "adductors",
  hamstrings: "hamstring",
  calves: "calves",
  neck: "neck",
  // overlapping / secondary groups — after primaries so they don't claim a shared slug
  upper_chest: "chest",
  lower_chest: "chest",
  rhomboids: "upper-back",
  lower_traps: "trapezius",
  rotator_cuff: "deltoids",
  abductors: "gluteal",
};

const SLUG_TO_OUR: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [our, slug] of Object.entries(OUR_TO_SLUG)) if (!(slug in out)) out[slug] = our;
  return out;
})();

// Which side a muscle is shown on, so selecting it (here or from the list) flips the figure.
const BACK_OUR = new Set([
  "lats",
  "upper_back",
  "traps",
  "lower_traps",
  "rhomboids",
  "rear_delts",
  "rotator_cuff",
  "triceps",
  "lower_back",
  "glutes",
  "hamstrings",
  "abductors",
  "calves",
]);

type Part = { slug: string; color: string };

export function MuscleMap2D({
  muscles,
  selectedMuscle,
  onSelectMuscle,
}: {
  muscles: MuscleStat[];
  selectedMuscle?: string;
  onSelectMuscle: (m?: string) => void;
}) {
  const { t } = useTranslation("muscles");
  const theme = useLoadTheme();
  // Aggregate our taxonomy onto the coarse slugs, taking the strongest heat per region. Heat is
  // each muscle's CURRENT decayed load (how far through its own recovery window the work sits),
  // not the window's raw set count — so the figure cools off day by day instead of resetting at a
  // week boundary.
  const data: Part[] = useMemo(() => {
    const tBySlug = new Map<string, number>();
    for (const m of muscles) {
      const slug = OUR_TO_SLUG[m.muscle];
      if (!slug) continue;
      tBySlug.set(slug, Math.max(tBySlug.get(slug) ?? 0, loadHeat(m.load)));
    }
    const parts: Part[] = ALL_SLUGS.map((slug) => {
      const t = tBySlug.get(slug) ?? 0;
      return { slug, color: t > 0 ? loadColor(t, theme) : RESTING_FILL[theme] };
    });
    // Selected muscle's slug overrides to the accent (even if it's fully recovered).
    const selSlug = selectedMuscle ? OUR_TO_SLUG[selectedMuscle] : undefined;
    if (selSlug) {
      const existing = parts.find((p) => p.slug === selSlug);
      if (existing) existing.color = SELECTED[theme];
      else parts.push({ slug: selSlug, color: SELECTED[theme] });
    }
    return parts;
  }, [muscles, selectedMuscle, theme]);

  const onPress = (bp: { slug?: string }) => {
    const our = bp.slug ? SLUG_TO_OUR[bp.slug] : undefined;
    if (our) onSelectMuscle(our);
  };

  // One large figure (bigger tap targets on phones), front/back toggled rather than side-by-side.
  const [view, setView] = useState<"front" | "back">("front");

  // Selecting a muscle flips the figure to the side it's on.
  useEffect(() => {
    if (!selectedMuscle) return;
    setView(BACK_OUR.has(selectedMuscle) ? "back" : "front");
  }, [selectedMuscle]);

  return (
    <div>
      <div className="flex justify-center mb-2">
        <PeriodToggle
          options={[
            { value: "front", label: t("view.front") },
            { value: "back", label: t("view.back") },
          ]}
          value={view}
          onChange={(v) => setView(v as "front" | "back")}
        />
      </div>
      <div
        className="max-w-[230px] mx-auto [&_svg]:w-full [&_svg]:h-auto"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Body data={data as any} side={view} gender="male" onBodyPartPress={onPress} />
      </div>
    </div>
  );
}
