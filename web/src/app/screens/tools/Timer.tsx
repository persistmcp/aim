import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { ToolHeader } from "./ToolHeader";

const PRESETS = [30, 60, 90, 120, 180, 300]; // seconds — common rest intervals

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Short beep sequence via Web Audio — no asset, works offline. iOS Safari only allows an
// AudioContext to make sound if it was created/resumed inside a real user-gesture call stack;
// one built fresh here, inside the completion tick (not a gesture), would be silently blocked.
// Callers must pass the context primed in `primeAudio` (called from the Start button's onClick).
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    // Audio may be blocked — vibration below still fires.
  }
}

// Created/resumed synchronously inside the Start tap so iOS Safari unlocks it for the later,
// gesture-less completion beep. Reused across start/pause/reset cycles for the component's life.
function primeAudio(ctx: MutableRefObject<AudioContext | null>) {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!ctx.current) ctx.current = new Ctx();
    if (ctx.current.state === "suspended") void ctx.current.resume();
  } catch {
    // Audio may be blocked — vibration below still fires.
  }
}

export function Timer() {
  const { t } = useTranslation("tools");
  const [duration, setDuration] = useState(60); // configured length, seconds
  const [remaining, setRemaining] = useState(60_000); // ms left
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const raf = useRef<number>();
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Deliberately reads .current at cleanup time, not effect-run time: the context is created
    // later, on the first Start tap (primeAudio), well after this mount-only effect already ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => void audioCtx.current?.close();
  }, []);

  useEffect(() => {
    if (!running) return;
    endAt.current = performance.now() + remaining;
    const tick = () => {
      const left = endAt.current - performance.now();
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        beep(audioCtx.current);
        navigator.vibrate?.([200, 100, 200, 100, 200]);
        return;
      }
      setRemaining(left);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const finished = remaining <= 0;
  const setLength = (sec: number) => {
    const v = Math.max(5, Math.min(3599, sec));
    setRunning(false);
    setDuration(v);
    setRemaining(v * 1000);
  };

  const toggle = () => {
    if (finished) return;
    setRunning((r) => {
      // Starting (not pausing): prime/resume the AudioContext inside this tap's own call
      // stack so the completion beep — fired later, outside any gesture — isn't silently
      // blocked by iOS Safari's autoplay policy.
      if (!r) primeAudio(audioCtx);
      return !r;
    });
  };
  const reset = () => {
    setRunning(false);
    setRemaining(duration * 1000);
  };

  const total = duration * 1000;
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const R = 130;
  const C = 2 * Math.PI * R;

  return (
    <div className="px-4 py-6">
      <ToolHeader title={t("timer.title")} />

      <div className="flex flex-col items-center">
        <div className="relative w-72 h-72">
          <svg viewBox="0 0 300 300" className="w-full h-full -rotate-90">
            <circle
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke="var(--secondary)"
              strokeWidth="14"
            />
            <circle
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke={finished ? "var(--chart-5)" : "var(--accent)"}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: running ? "none" : "stroke-dashoffset 0.3s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-light tabular-nums tracking-tight">
              {mmss(remaining / 1000)}
            </span>
            {finished && (
              <span className="text-chart-5 text-sm mt-2 font-medium">{t("timer.done")}</span>
            )}
          </div>
        </div>

        {/* Adjust length (disabled while counting). */}
        <div className="flex items-center gap-4 mt-8">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setLength(duration - 15)}
            disabled={running}
            className="h-12 w-12 rounded-full p-0"
            aria-label={t("timer.minus", { n: 15 })}
          >
            <Minus className="w-5 h-5" aria-hidden />
          </Button>
          <span className="text-sm text-muted-foreground w-24 text-center tabular-nums">
            {t("timer.length", { value: mmss(duration) })}
          </span>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setLength(duration + 15)}
            disabled={running}
            className="h-12 w-12 rounded-full p-0"
            aria-label={t("timer.plus", { n: 15 })}
          >
            <Plus className="w-5 h-5" aria-hidden />
          </Button>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setLength(p)}
              disabled={running}
              className={`px-3 py-1.5 rounded-full text-sm tabular-nums border transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                duration === p
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {mmss(p)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-8">
          <Button
            size="lg"
            variant="secondary"
            onClick={reset}
            disabled={remaining === total && !running}
            className="h-16 w-16 rounded-full p-0"
            aria-label={t("controls.reset")}
          >
            <RotateCcw className="w-6 h-6" aria-hidden />
          </Button>
          <Button
            size="lg"
            onClick={toggle}
            disabled={finished}
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
    </div>
  );
}
