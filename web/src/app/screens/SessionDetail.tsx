import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Activity, ArrowLeft, Pencil } from "lucide-react";
import { EditSetSheet, type EditSetTarget } from "../components/EditSetSheet";
import { ErrorState, Loading } from "../components/States";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import type { Exercise } from "../data/workouts";
import { isDemo } from "../lib/demo";
import { longDate } from "../lib/format";
import { useSession } from "../lib/queries";

export function SessionDetail() {
  const { t } = useTranslation("session");
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, isError, refetch } = useSession(id);
  const [editTarget, setEditTarget] = useState<EditSetTarget | null>(null);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!session) return <div className="p-6 text-center">{t("notFound")}</div>;

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-4 mb-6 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-3 -ml-2"
          aria-label={t("back")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" aria-hidden />
          {t("back")}
        </Button>
        <h1 className="text-xl">{session.dayName}</h1>
        <p className="text-sm text-muted-foreground">
          {longDate(session.date)}
          {session.startTime && ` · ${session.startTime}–${session.endTime}`}
        </p>
      </div>

      <div className="px-4 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{t("duration")}</div>
            <div className="text-lg tabular-nums">
              {session.duration != null ? t("minutes", { n: session.duration }) : "·"}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{t("volume")}</div>
            <div className="text-lg tabular-nums">
              {t("tons", { n: (session.totalVolume / 1000).toFixed(1) })}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">RPE</div>
            <div className="text-lg tabular-nums">
              {session.rpe != null ? `${session.rpe}/10` : "·"}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{t("energy")}</div>
            <div className="text-lg">{session.energy != null ? `${session.energy}/5` : "·"}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{t("bodyWeight")}</div>
            <div className="text-lg tabular-nums">
              {session.bodyWeight != null ? t("kg", { n: session.bodyWeight }) : "·"}
            </div>
          </Card>
        </div>

        {session.strain != null && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-accent" aria-hidden />
              <h2 className="text-sm font-medium">WHOOP</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-xs text-muted-foreground">{t("strain")}</div>
                <div className="text-2xl tabular-nums text-accent">{session.strain}</div>
              </div>
              {session.maxHR != null && (
                <div>
                  <div className="text-xs text-muted-foreground">{t("maxHr")}</div>
                  <div className="text-2xl tabular-nums">{session.maxHR}</div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {session.cardioLoad != null && (
                <LoadBar label={t("cardioLoad")} pct={session.cardioLoad} className="bg-chart-2" />
              )}
              {session.muscularLoad != null && (
                <LoadBar
                  label={t("muscularLoad")}
                  pct={session.muscularLoad}
                  className="bg-accent"
                />
              )}
            </div>
          </Card>
        )}

        {session.cardio && session.cardio.length > 0 && (
          <div>
            <h2 className="text-sm text-muted-foreground mb-3">{t("cardio")}</h2>
            {session.cardio.map((c, i) => (
              <Card key={i} className="p-3">
                <div className="font-medium">{c.type}</div>
                <div className="text-sm text-muted-foreground">
                  {[c.distance && t("meters", { n: c.distance }), c.duration, c.note]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-sm text-muted-foreground mb-3">{t("exercises")}</h2>
          <div className="space-y-3">
            {session.exercises.map((exercise) => (
              <ExerciseBlock
                key={exercise.id}
                exercise={exercise}
                onEditSet={
                  isDemo()
                    ? undefined
                    : (setNumber) =>
                        setEditTarget({
                          sessionId: session.id,
                          exerciseId: exercise.exerciseId,
                          occurrence: exercise.occurrence,
                          setNumber,
                          weight: exercise.sets.find((s) => s.setNumber === setNumber)?.weight,
                          reps: exercise.sets.find((s) => s.setNumber === setNumber)?.reps,
                          rir: exercise.sets.find((s) => s.setNumber === setNumber)?.rir,
                        })
                }
              />
            ))}
          </div>
        </div>

        {session.notes && (
          <Card className="p-4">
            <h2 className="text-sm text-muted-foreground mb-2">{t("notes")}</h2>
            <p className="text-sm">{session.notes}</p>
          </Card>
        )}
      </div>
      <EditSetSheet
        target={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />
    </div>
  );
}

function LoadBar({ label, pct, className }: { label: string; pct: number; className: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ExerciseBlock({
  exercise,
  onEditSet,
}: {
  exercise: Exercise;
  onEditSet?: (setNumber: number) => void;
}) {
  const { t } = useTranslation("session");
  const [isOpen, setIsOpen] = useState(true);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger className="w-full p-4 text-left hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{exercise.name}</span>
              {exercise.supersetGroup && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {t("superset", { group: exercise.supersetGroup })}
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
              {t("setsCount", { count: exercise.sets.length })}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4">
            <div className="bg-secondary/30 rounded-lg p-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left pb-2 w-8" scope="col">
                      #
                    </th>
                    <th className="text-left pb-2" scope="col">
                      {t("weightRepsHeader")}
                    </th>
                    <th className="text-right pb-2" scope="col">
                      RIR
                    </th>
                    {onEditSet && <th className="pb-2 w-8" scope="col" aria-hidden />}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {exercise.sets.map((set) => (
                    <tr key={set.setNumber} className="border-t border-border/50">
                      <td className="py-1.5 text-muted-foreground">{set.setNumber}</td>
                      <td className="py-1.5">
                        {set.weight != null
                          ? t("setWeight", { weight: set.weight, reps: set.reps })
                          : set.reps != null
                            ? t("setReps", { reps: set.reps })
                            : set.duration != null
                              ? t("seconds", { n: set.duration })
                              : "·"}
                      </td>
                      <td className="py-1.5 text-right">
                        {set.rir != null
                          ? set.rir
                          : set.rpe != null
                            ? t("rpeValue", { n: set.rpe })
                            : "·"}
                      </td>
                      {onEditSet && (
                        <td className="py-1.5 pl-1 text-right">
                          <button
                            type="button"
                            onClick={() => onEditSet(set.setNumber)}
                            aria-label={t("editSet.editLabel", { n: set.setNumber })}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {exercise.sets.find((s) => s.note) && (
                <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  {exercise.sets.find((s) => s.note)?.note}
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
