import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SessionCard } from "../components/SessionCard";
import { Query } from "../components/States";
import type { WorkoutSession } from "../data/workouts";
import { useSessions } from "../lib/queries";
import i18n from "../i18n";
import { parseLocalDay } from "../lib/localDate";

// parseLocalDay, not `new Date(iso)`: a bare "YYYY-MM-DD" parses as UTC midnight, so west of UTC
// every session dated the 1st of a month was filed under the PREVIOUS month's header — and the
// filter dropdown is built from these same keys, so the month you picked was missing a session
// and the month before it had a stray one.
const monthKey = (iso: string) =>
  parseLocalDay(iso).toLocaleDateString(i18n.resolvedLanguage, { month: "long", year: "numeric" });

export function History() {
  const { t } = useTranslation("history");
  const [month, setMonth] = useState("all");
  const sessions = useSessions({ limit: 200 });

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl">{t("title")}</h1>
        {sessions.data && sessions.data.length > 0 && (
          <label className="sr-only" htmlFor="month-filter">
            {t("monthFilterLabel")}
          </label>
        )}
        <select
          id="month-filter"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 border border-border min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize"
        >
          <option value="all">{t("allMonths")}</option>
          {[...new Set((sessions.data ?? []).map((s) => monthKey(s.date)))].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <Query
        q={sessions}
        empty={{
          title: t("emptyTitle"),
          hint: t("emptyHint"),
          when: (d: WorkoutSession[]) => d.length === 0,
        }}
      >
        {(list: WorkoutSession[]) => {
          const grouped = list.reduce<Record<string, WorkoutSession[]>>((acc, s) => {
            (acc[monthKey(s.date)] ??= []).push(s);
            return acc;
          }, {});
          const entries = Object.entries(grouped).filter(([m]) => month === "all" || m === month);
          if (entries.length === 0) {
            return (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("noSessionsForMonth")}
              </p>
            );
          }
          return (
            <div className="space-y-6">
              {entries.map(([m, items]) => (
                <div key={m}>
                  <h2 className="text-sm text-muted-foreground mb-3 capitalize">{m}</h2>
                  <div className="space-y-3">
                    {items.map((s) => (
                      <SessionCard key={s.id} session={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        }}
      </Query>
    </div>
  );
}
