import { useEffect, useRef, useState } from "react";
import { Flag, Pause, Play, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ToolHeader } from "./ToolHeader";

// mm:ss.cs (centiseconds) — readable at a glance between sets.
function format(ms: number): { main: string; cs: string } {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return {
    main: `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
    cs: String(cs).padStart(2, "0"),
  };
}

export function Stopwatch() {
  const { t } = useTranslation("tools");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  // Anchor on wall-clock so backgrounding/throttling can't drift the count.
  const startedAt = useRef(0);
  const base = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    const tick = () => {
      setElapsed(base.current + (performance.now() - startedAt.current));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running]);

  const toggle = () => {
    if (running) {
      base.current = elapsed;
      setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const reset = () => {
    setRunning(false);
    setElapsed(0);
    base.current = 0;
    setLaps([]);
  };

  const lap = () => setLaps((l) => [elapsed, ...l]);

  const disp = format(elapsed);

  return (
    <div className="px-4 py-6">
      <ToolHeader title={t("stopwatch.title")} />

      <div className="flex flex-col items-center">
        <div className="tabular-nums font-light tracking-tight flex items-baseline">
          <span className="text-7xl">{disp.main}</span>
          <span className="text-3xl text-muted-foreground ml-1 w-12 text-left">.{disp.cs}</span>
        </div>

        <div className="flex items-center gap-3 mt-10">
          {running ? (
            <Button
              size="lg"
              variant="secondary"
              onClick={lap}
              className="h-16 w-16 rounded-full p-0"
              aria-label={t("stopwatch.lap")}
            >
              <Flag className="w-6 h-6" aria-hidden />
            </Button>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              onClick={reset}
              disabled={elapsed === 0}
              className="h-16 w-16 rounded-full p-0"
              aria-label={t("controls.reset")}
            >
              <RotateCcw className="w-6 h-6" aria-hidden />
            </Button>
          )}
          <Button
            size="lg"
            onClick={toggle}
            className={`h-20 w-20 rounded-full p-0 ${running ? "bg-chart-5 hover:bg-chart-5/90 text-white" : ""}`}
            aria-label={running ? t("controls.pause") : t("controls.start")}
          >
            {running ? (
              <Pause className="w-8 h-8" aria-hidden />
            ) : (
              <Play className="w-8 h-8 ml-1" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {laps.length > 0 && (
        <div className="mt-10 space-y-1">
          {laps.map((lapTime, i) => {
            const idx = laps.length - i;
            const split = lapTime - (laps[i + 1] ?? 0);
            const st = format(split);
            const tt = format(lapTime);
            return (
              <Card
                key={idx}
                className="px-4 py-2.5 flex flex-row items-center justify-between text-sm tabular-nums"
              >
                <span className="text-muted-foreground">{t("stopwatch.lapN", { n: idx })}</span>
                <span className="text-muted-foreground">
                  +{st.main}.{st.cs}
                </span>
                <span className="font-medium">
                  {tt.main}.{tt.cs}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
