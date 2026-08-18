// Full-screen "past goals" browse — everything superseded before the current featured goal
// (achieved/abandoned/revised, never deleted — COACHING_PLAN.md §3.2). Reached via a nav row on
// Home rather than living inline there, since it's low-frequency content that doesn't need to
// compete for space on every visit. Mirrors SessionDetail.tsx's header pattern.
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ErrorState, Loading } from "../components/States";
import { pastGoals } from "../lib/goals";
import { useGoals } from "../lib/queries";

export function GoalHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGoals("all");
  const goals = data ?? [];
  const byId = new Map(goals.map((g) => [g.id, g]));
  const past = pastGoals(goals);

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 mb-6 border-b border-border bg-background/95 px-4 py-4 backdrop-blur-lg">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="-ml-2 mb-3"
          aria-label={t("home.goalHistory.back")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          {t("home.goalHistory.back")}
        </Button>
        <h1 className="text-xl">{t("home.goalHistory.title")}</h1>
      </div>

      <div className="space-y-2 px-4">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          // A failed load must not masquerade as "no past goals" (same convention as
          // Home/Progress/ProgramSection) — the ?? [] fallback would silently read as empty.
          <ErrorState onRetry={refetch} />
        ) : past.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("home.goalHistory.empty")}</p>
        ) : (
          past.map((g) => {
            const parent = g.supersedes_goal_id ? byId.get(g.supersedes_goal_id) : undefined;
            // The other end of the supersedes chain: whichever goal replaced this one — the
            // chain is why goals are never deleted, so show it, not just store it.
            const successor = goals.find((x) => x.supersedes_goal_id === g.id);
            const closedOn = g.updated_at ? new Date(g.updated_at) : null;
            return (
              <Card key={g.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{g.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {closedOn != null && !Number.isNaN(closedOn.getTime()) && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {closedOn.toLocaleDateString(i18n.language)}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {t(`home.goalHistory.status.${g.status}`)}
                    </Badge>
                  </div>
                </div>
                {parent && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("home.goalHistory.grewFrom", { title: parent.title })}
                  </p>
                )}
                {successor && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("home.goalHistory.replacedBy", { title: successor.title })}
                  </p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
