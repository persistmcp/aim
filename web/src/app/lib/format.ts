/** Formatting helpers. Times are read straight off the ISO string to keep the logged local time
 *  (no timezone conversion). Date/number formatting follows the active UI language. */

import i18n from "../i18n";
import { parseLocalDay } from "./localDate";

const locale = () => i18n.resolvedLanguage || "en";

export const timeOf = (iso?: string | null) => (iso ? String(iso).slice(11, 16) : "");

export const minutes = (sec?: number | null) => (sec == null ? null : Math.round(sec / 60));

export const mmss = (sec?: number | null) => {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// parseLocalDay, not `new Date(iso)`: server dates are bare calendar days, and the platform
// parses those as UTC midnight — every date on every card read one day early west of UTC.
const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  parseLocalDay(iso).toLocaleDateString(locale(), opts);

export const shortDate = (iso: string) => fmtDate(iso, { day: "numeric", month: "short" });
export const longDate = (iso: string) => fmtDate(iso, { day: "numeric", month: "long" });

/** Pretty label for a volume bucket key: "2026-W23" → "Нед 23"/"Wk 23"/…, "2026-06" → localized month. */
export const bucketLabel = (bucket: string) => {
  if (bucket.includes("W")) return i18n.t("format.week", { n: Number(bucket.split("W")[1]) });
  const m = Number(bucket.split("-")[1]);
  if (!m || m < 1 || m > 12) return bucket;
  return new Date(2020, m - 1, 1).toLocaleDateString(locale(), { month: "short" });
};

/** Localized label for a cardio type; unknown types fall back to the raw value, missing → "Cardio". */
export const cardioLabel = (type?: string) => {
  if (!type) return i18n.t("cardio.other");
  const key = `cardio.${type}`;
  return i18n.exists(key) ? i18n.t(key) : type;
};
