import { Bot, ChevronRight, Download, Hourglass, Timer as TimerIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { track } from "../../lib/analytics";
import { isDemo } from "../../lib/demo";
import { getToken } from "../../lib/token";

const TOOLS = [
  { path: "/connect", key: "connect", icon: Bot },
  { path: "/tools/stopwatch", key: "stopwatch", icon: TimerIcon },
  { path: "/tools/timer", key: "timer", icon: Hourglass },
] as const;

// Same-origin in prod; VITE_API_ORIGIN in dev — matches lib/api.ts's apiGet, but this is a plain
// navigation (Content-Disposition: attachment drives the download), not a fetch.
const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN ?? "";

const EXPORT_PERIODS = ["all", "1m", "3m", "6m", "year"] as const;
const EXPORT_PERIOD_DAYS: Record<string, number> = { "1m": 30, "3m": 90, "6m": 180, year: 365 };

function exportUrl(
  token: string,
  period: string,
  format: "xlsx" | "json" = "json",
  lang?: string,
): string {
  const params = new URLSearchParams();
  const days = EXPORT_PERIOD_DAYS[period];
  if (days) {
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    params.set("from", from);
  }
  if (format === "xlsx") {
    params.set("format", "xlsx");
    if (lang) params.set("lang", lang);
  }
  const qs = params.toString();
  return `${ORIGIN}/${token}/api/export${qs ? `?${qs}` : ""}`;
}

function ExportSection() {
  const { t, i18n } = useTranslation("tools");
  const [period, setPeriod] = useState<string>("all");
  const token = getToken();

  // The download is a plain <a href> navigation to the real backend (Content-Disposition drives
  // it, not a fetch), so it can't go through apiGet's isDemo()/demoGet interception like every
  // other data read in the app — there is nothing real to export in demo mode, so skip the
  // section entirely rather than link to a 404.
  if (isDemo()) return null;

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="font-medium">{t("export.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("export.hint")}</p>
      </div>
      {/* A native select, not the segmented PeriodToggle: five spelled-out ranges ("6 месяцев",
          "Всё время") cannot fit one 390px row, and the toggle wrapped them onto a second line
          that read as a separate control (owner, 2026-08-09). A select also gives phones their
          own picker, and the label stays visible once a choice is made — which matters here,
          because the chosen range is the only thing that distinguishes two identical downloads.
          Matches the exercise picker on the Progress screen rather than introducing a new idiom. */}
      <div>
        <label htmlFor="export-period" className="text-sm text-muted-foreground block mb-1.5">
          {t("export.period")}
        </label>
        <select
          id="export-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-border bg-secondary px-3 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {EXPORT_PERIODS.map((k) => (
            <option key={k} value={k}>
              {t(`export.periods.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <Button asChild variant="secondary" className="w-full">
        <a
          href={exportUrl(token, period, "xlsx", i18n.resolvedLanguage)}
          download
          onClick={() => track("export_download", { period, format: "xlsx" })}
        >
          <Download className="h-4 w-4" aria-hidden /> {t("export.download")}
        </a>
      </Button>
      {/* The JSON document is what import_document restores from — it stays reachable for
          backup/transfer, just no longer as the headline format nobody outside a code editor
          can open. */}
      <a
        href={exportUrl(token, period)}
        download
        onClick={() => track("export_download", { period, format: "json" })}
        className="block text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        {t("export.downloadJson")}
      </a>
    </Card>
  );
}

export function Tools() {
  const { t } = useTranslation("tools");
  const navigate = useNavigate();
  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-2">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const label = tool.key === "connect" ? t("connect.label") : t(`${tool.key}.title`);
          return (
            <Card
              key={tool.path}
              role="button"
              tabIndex={0}
              onClick={() => navigate(tool.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(tool.path);
                }
              }}
              className="p-4 flex flex-row items-center gap-4 cursor-pointer transition-colors hover:bg-secondary/50 active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="h-11 w-11 shrink-0 rounded-full bg-secondary flex items-center justify-center text-accent">
                <Icon className="w-5 h-5" aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted-foreground truncate">
                  {t(`${tool.key}.hint`)}
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden />
            </Card>
          );
        })}
      </div>

      <ExportSection />
    </div>
  );
}
