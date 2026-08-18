// Bottom sheet with the featured goal's full story — opened by tapping the goal card. Read-only
// on purpose: any actual change to a goal happens in conversation with the coach (COACHING_PLAN.md
// co-creation principle), so this sheet shows facts and progress, and its footer says exactly
// that instead of offering edit controls that couldn't exist.
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { FeaturedGoal } from "../data/workouts";
import { Badge } from "./ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { MaintenanceZone, MilestoneRing, TrendChart, WeeklyBands } from "./FeaturedGoalCard";

const fmtValue = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale);
}

export function GoalDetailSheet({
  goal,
  open,
  onOpenChange,
}: {
  goal: FeaturedGoal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const target = goal.target ?? {};
  const targetValue = typeof target.value === "number" ? (target.value as number) : null;
  const unit = typeof target.unit === "string" ? (target.unit as string) : null;
  const deadline = typeof target.deadline === "string" ? (target.deadline as string) : null;
  const progress = goal.progress;
  const isMilestone = goal.goal_type === "milestone";

  const facts: { label: string; value: string }[] = [];
  if (targetValue != null)
    facts.push({
      label: t("home.featuredGoal.details.target"),
      value: unit ? `${fmtValue(targetValue)} ${unit}` : fmtValue(targetValue),
    });
  if (goal.current != null)
    facts.push({
      label: t("home.featuredGoal.details.current"),
      value: unit ? `${fmtValue(goal.current)} ${unit}` : fmtValue(goal.current),
    });
  if (deadline)
    facts.push({
      label: t("home.featuredGoal.details.deadline"),
      value: fmtDate(deadline, i18n.language),
    });
  if (goal.review_date)
    facts.push({
      label: t("home.featuredGoal.details.reviewDate"),
      value: fmtDate(goal.review_date, i18n.language),
    });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {t(`home.featuredGoal.goalType.${goal.goal_type}`, { defaultValue: goal.goal_type })}
            </Badge>
            {goal.status === "active" && (
              <Badge variant="outline" className="text-xs">
                {t("home.featuredGoal.details.statusActive")}
              </Badge>
            )}
          </div>
          <DrawerTitle id={titleId} className="mt-1">
            {goal.title}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {t("home.featuredGoal.details.description")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-2">
          {progress?.type === "bar" && isMilestone && (
            <MilestoneRing goal={goal} progress={progress} titleId={titleId} />
          )}
          {progress?.type === "weekly_bands" && <WeeklyBands progress={progress} />}
          {progress?.type === "trend" && <TrendChart progress={progress} />}
          {progress?.type === "tolerance" && <MaintenanceZone progress={progress} />}

          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <p className="px-4 pb-6 pt-2 text-xs text-muted-foreground">
          {t("home.featuredGoal.details.editHint")}
        </p>
      </DrawerContent>
    </Drawer>
  );
}
