// Calendar-day helpers in the USER'S timezone.
//
// `toISOString().slice(0, 10)` is the trap this file exists to avoid: it serializes in UTC, so a
// Date built with local arithmetic (setDate/getDate) comes back labelled with the wrong calendar
// day for anyone west of UTC in the evening or east of it after midnight. Everything that decides
// "which day is this" — the muscle panel's rolling window, its detail sheet, the load the server
// computes — has to agree on the user's day, not on Greenwich's.

/** A Date as YYYY-MM-DD in local time. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today, YYYY-MM-DD, in the user's timezone. */
export const todayIso = (): string => localIso(new Date());

/**
 * A bare "YYYY-MM-DD" calendar day as a Date at LOCAL midnight.
 *
 * The mirror image of the trap above, and the one that actually shipped: `new Date("2026-08-01")`
 * is parsed as UTC midnight by spec, so every local getter reads it back as 31 July for anyone
 * west of UTC. A session the coach logged on the 1st then appeared under July's header, on a card
 * reading "31 July", in July's bar of the count chart, and one tick early on the home ring.
 * Anything that turns a server date into a Date must come through here. Strings that carry a time
 * (`"...T10:00:00Z"`) are a real instant, not a calendar day, and are left to the platform.
 */
export function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (iso.length > 10 || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(iso);
  }
  return new Date(y, m - 1, d);
}

/** The ISO day `days` before today (0 = today), in the user's timezone. */
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localIso(d);
}

/**
 * Whole days between two ISO days, never negative.
 *
 * Computed on the calendar labels rather than on timestamps, so a DST boundary can't turn a
 * two-day gap into 47 hours and quietly shift a muscle's decay — the server does whole-day
 * arithmetic on `date` columns and the two must match.
 */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const parts = [...fromIso.split("-"), ...toIso.split("-")].map(Number);
  // Every component has to be a real number, not just the year: "20260806" (no separators) parses
  // to a year with an undefined month and day, and the resulting NaN would flow through loadFade
  // into the gradient index and blank the whole panel instead of failing loudly.
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return 0;
  const [fy, fm, fd, ty, tm, td] = parts;
  const days = (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000;
  // Clamped: a session dated ahead of the device clock would otherwise read as more than fully
  // loaded. The server clamps the same way (stats.current_muscle_load).
  return Math.max(0, Math.round(days));
}
