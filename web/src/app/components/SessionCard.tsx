import { useTranslation } from "react-i18next";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import type { WorkoutSession } from "../data/workouts";
import { useNavigate } from "react-router";
import { parseLocalDay } from "../lib/localDate";

interface SessionCardProps {
  session: WorkoutSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const { t, i18n } = useTranslation("session");
  const navigate = useNavigate();

  // parseLocalDay: `session.date` is a bare calendar day, and `new Date` reads those as UTC
  // midnight — the card showed "31 июля" for a session logged on 1 August west of UTC.
  const formattedDate = parseLocalDay(session.date).toLocaleDateString(i18n.resolvedLanguage, {
    day: "numeric",
    month: "long",
  });

  const statusColors = {
    completed: "bg-accent",
    partial: "bg-chart-5",
    skipped: "bg-muted",
  };

  const open = () => navigate(`/session/${session.id}`);

  return (
    <Card
      className="p-4 cursor-pointer hover:border-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="button"
      tabIndex={0}
      aria-label={`${session.dayName}, ${formattedDate}`}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
    >
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 ${statusColors[session.status]}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <h3 className="font-medium truncate">{session.dayName}</h3>
            <span className="text-sm text-muted-foreground shrink-0">·</span>
            <span className="text-sm text-muted-foreground shrink-0">{formattedDate}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
            {session.duration != null && (
              <>
                <span>{t("minutes", { n: session.duration })}</span>
                <span>·</span>
              </>
            )}
            <span className="tabular-nums">
              {t("kg", { n: session.totalVolume.toLocaleString(i18n.resolvedLanguage) })}
            </span>
            {session.rpe && (
              <>
                <span>·</span>
                <span>RPE {session.rpe}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {session.energy && (
              <Badge variant="secondary" className="text-xs">
                {t("energyBadge", { n: session.energy })}
              </Badge>
            )}
            {session.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {session.strain && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Strain</div>
            <div className="text-lg tabular-nums text-accent">{session.strain}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
