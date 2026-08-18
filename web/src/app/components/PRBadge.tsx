import { Trophy, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "./ui/card";

interface PRBadgeProps {
  exerciseName: string;
  weight: number;
  reps: number;
  onClick?: () => void;
  // A just-discovered record vs. a plain historical listing — same component either way, just a
  // pop-in reveal + a stronger accent treatment for the moment it's first shown.
  celebratory?: boolean;
  // When set, the badge is dismissible: an explicit close button plus swipe-aside. The
  // celebration strip can hold many records after a long gap between app opens — each one must
  // be closable on its own, not squat on the Home screen until the next full reload.
  onDismiss?: () => void;
}

// Horizontal travel (px) past which a release dismisses instead of springing back.
const SWIPE_DISMISS_PX = 72;
const LEAVE_MS = 200;

export function PRBadge({
  exerciseName,
  weight,
  reps,
  onClick,
  celebratory,
  onDismiss,
}: PRBadgeProps) {
  const { t } = useTranslation("session");
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // dx lives both in state (drives the transform) and in the ref: React flushes continuous
  // pointermove updates asynchronously, so the pointerup handler can run before the re-render
  // and must read the latest travel from the ref, not a stale closure.
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    active: boolean;
    dx: number;
  } | null>(null);

  const dismiss = (direction: 1 | -1) => {
    setLeaving(true);
    setDx(direction * (typeof window !== "undefined" ? window.innerWidth : 400));
    // Let the slide-out play before unmounting; matches the transition duration below.
    window.setTimeout(() => onDismiss?.(), LEAVE_MS);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onDismiss || leaving) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, dx: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || leaving) return;
    const moveX = e.clientX - d.startX;
    const moveY = e.clientY - d.startY;
    // Only claim the gesture once it's clearly horizontal — vertical stays with the scroller
    // (touch-action: pan-y below keeps the browser scrolling for those).
    if (!d.active && Math.abs(moveX) > 8 && Math.abs(moveX) > Math.abs(moveY)) {
      d.active = true;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / already-released pointer — capture is an optimization, not a requirement
      }
    }
    if (d.active) {
      d.dx = moveX;
      setDx(moveX);
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (leaving) return;
    if (d.active && Math.abs(d.dx) > SWIPE_DISMISS_PX) {
      dismiss(d.dx > 0 ? 1 : -1);
    } else {
      setDx(0);
    }
  };

  return (
    <Card
      className={`p-3 flex flex-row items-center gap-2 ${
        celebratory
          ? "border-accent ring-1 ring-accent/40 animate-in fade-in-0 zoom-in-95 duration-200"
          : "border-accent/20"
      } ${onClick ? "cursor-pointer hover:border-accent/50 transition-colors" : ""}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={
        onDismiss
          ? {
              transform: dx ? `translateX(${dx}px)` : undefined,
              opacity: leaving ? 0 : Math.max(0.3, 1 - Math.abs(dx) / (SWIPE_DISMISS_PX * 3)),
              // Follow the finger instantly while dragging; animate only the release/spring-back.
              transition: dragging
                ? "none"
                : `transform ${LEAVE_MS}ms ease, opacity ${LEAVE_MS}ms ease`,
              touchAction: "pan-y",
            }
          : undefined
      }
    >
      <Trophy className="w-4 h-4 text-accent flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{exerciseName}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {t("prWeightReps", { weight, reps })}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label={t("prDismiss")}
          className="shrink-0 -m-1 p-2 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => {
            e.stopPropagation();
            dismiss(1);
          }}
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      )}
    </Card>
  );
}
