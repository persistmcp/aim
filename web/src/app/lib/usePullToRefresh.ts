// Pull-to-refresh for the standalone PWA, where the browser's native gesture is gone. Listens with
// a non-passive touchmove so it can claim a downward drag *only* while the scroll area sits at the
// top — every other gesture falls through to native scrolling untouched. Past the threshold it
// refetches all React Query data AND re-checks the deployed build (a fresh deploy reloads in
// place, keeping the /{token}/ URL). Returns the pull distance (for a rubber-band indicator).

import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { checkForAppUpdate } from "./appUpdate";

const THRESHOLD = 70; // px of pull (post-resistance) needed to trigger a refresh
const MAX = 110; // hard cap on how far the content rubber-bands
const RESISTANCE = 0.5; // finger travel -> content travel
const MIN_SPIN = 1100; // ms the spinner stays up even if the refetch returns instantly

export function usePullToRefresh(scrollRef: RefObject<HTMLElement | null>, enabled = true) {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // A new BUILD was found and its worker is downloading the precache: the spinner stays up with
  // an "updating the app" label until the worker activates and the page reloads itself
  // (registerSW autoUpdate). Without this the swipe went quiet and the reload arrived seconds
  // later looking random.
  const [updating, setUpdating] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Mirrors of the state, so the native listeners below read fresh values without re-subscribing.
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const settle = (to: number) => {
      setAnimating(true);
      set(to);
      window.setTimeout(() => setAnimating(false), 220);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      startY.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      // Scrolled away from the top mid-gesture — hand the rest back to native scroll.
      if (el.scrollTop > 0) {
        startY.current = null;
        if (pullRef.current) set(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (pullRef.current) set(0);
        return; // upward / no movement: let it scroll
      }
      // Genuine downward pull at the top — this gesture is ours now.
      e.preventDefault();
      set(Math.min(dy * RESISTANCE, MAX));
    };

    const onEnd = async () => {
      if (startY.current == null) return;
      startY.current = null;
      const dist = pullRef.current;
      if (dist < THRESHOLD || refreshingRef.current) {
        if (dist > 0) settle(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setAnimating(true);
      set(THRESHOLD);
      const started = Date.now();
      let updateFound = false;
      try {
        // invalidateQueries marks EVERY cached query stale and refetches the mounted ones now —
        // the rest refetch the moment their screen is opened. Deliberately never resetQueries/
        // clear: the old data stays on screen until a fresh response replaces it (and React
        // Query's structural sharing skips the re-render entirely when nothing changed).
        [, updateFound] = await Promise.all([qc.invalidateQueries(), checkForAppUpdate()]);
      } finally {
        if (updateFound) {
          // A new build is installing: hold the indicator until the worker activates and the
          // page reloads itself. Safety valve — if the install stalls (connection dropped),
          // release the UI instead of spinning forever.
          setUpdating(true);
          window.setTimeout(() => {
            setUpdating(false);
            refreshingRef.current = false;
            setRefreshing(false);
            settle(0);
          }, 45_000);
        } else {
          // Keep the spinner visible long enough to read as "refreshed", even when the
          // refetch resolves from cache almost instantly. Longer requests just wait themselves.
          const remaining = MIN_SPIN - (Date.now() - started);
          if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining));
          refreshingRef.current = false;
          setRefreshing(false);
          settle(0);
        }
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef, qc, enabled]);

  // Navigating to a route where this is disabled mid-gesture (rare, but possible) must not leave
  // stale pull state — nothing will ever settle() it once the listeners above are torn down.
  useEffect(() => {
    if (!enabled) {
      pullRef.current = 0;
      setPull(0);
      setRefreshing(false);
      setUpdating(false);
      setAnimating(false);
    }
  }, [enabled]);

  return { pull, refreshing, updating, animating };
}
