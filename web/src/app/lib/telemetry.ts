// Central error sink. Today it deduplicates and writes to the console (visible in devtools and
// in `vercel logs` for SSR-less SPAs it is the only breadcrumb); when an error-tracking SDK
// (Sentry/PostHog) is added, wire it here and every boundary/query/handler reports through it.

import { track, trackException } from "./analytics";
import { NetworkError } from "./api";

const DEDUPE_WINDOW_MS = 30_000;
const lastSeen = new Map<string, number>();

/** Stable key for an error so repeats (e.g. a query retrying) collapse into one report. */
export function errorKey(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** True once per key per window — callers report only when this says so. */
export function shouldReport(key: string, now: number): boolean {
  const prev = lastSeen.get(key);
  if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) return false;
  lastSeen.set(key, now);
  return true;
}

export function resetDedupe() {
  lastSeen.clear();
}

/** A request that never reached the backend — connectivity, not a defect. See NetworkError. */
export function isConnectivityFailure(error: unknown): boolean {
  return error instanceof NetworkError;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  const offline = isConnectivityFailure(error);
  // One dropped connection fails every in-flight query at once, and each carries a different path,
  // so per-message dedupe would report the same single outage six times. Collapse them onto one key
  // — the path still rides along as a property for whoever needs it.
  const key = offline ? "connectivity" : errorKey(error);
  if (!shouldReport(key, Date.now())) return;
  // Connectivity failures still get logged and counted — a backend that is down for everyone must
  // not go quiet — but they are NOT exceptions. Mixing them in made every phone that walked into a
  // lift indistinguishable from a genuine crash in the error feed, so the feed said nothing.
  if (offline) {
    console.warn("[aim]", errorKey(error), context ?? {});
    track("api_unreachable", {
      ...context,
      path: (error as NetworkError).path,
      online: navigator.onLine,
    });
    return;
  }
  console.error("[aim]", key, context ?? {}, error instanceof Error ? error.stack : "");
  trackException(error, context);
}

/** Global last-resort listeners: render crashes escape React, promises escape queries.
 * Console-only: PostHog's capture_exceptions already reports uncaught window errors itself,
 * so sending them through trackException too would double-count. */
export function initTelemetry() {
  window.addEventListener("error", (e) => {
    // filename/lineno are empty exactly when the browser withholds the details because the throwing
    // script is cross-origin without CORS — the "Script error." with no stack that we cannot
    // attribute to anything (an extension, an in-app browser's injected script, a third-party SDK).
    // Recording which of the two it is turns "is this ours?" from a guess into a lookup.
    const opaque = !e.filename;
    console.error("[aim]", errorKey(e.error ?? e.message), {
      source: "window.onerror",
      opaque,
      ...(opaque ? {} : { filename: e.filename, line: e.lineno, column: e.colno }),
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[aim]", errorKey(e.reason), { source: "unhandledrejection" });
  });
}
