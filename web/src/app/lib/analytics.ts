// PostHog wiring: pageviews (SPA history), autocapture, session replay, error tracking.
//
// CRITICAL: the user's token is the URL basename (a live credential). Nothing containing it may
// leave the browser — before_send scrubs every string property, and network request URLs inside
// replays are masked the same way. The Connect screen's MCP-URL block additionally carries
// ph-no-capture so replays never record the credential pixels.

import posthog from "posthog-js";
import { POSTHOG_HOST, POSTHOG_KEY, TOKEN_PATH_SOURCE } from "../../../shared/analytics.mjs";
import { isLang } from "../../../shared/languages.mjs";
import { isDemo } from "./demo";
import { getToken, isLikelyToken } from "./token";

// Project API keys are public by design (they can only ingest); env vars can still override.
// The default lives in shared/analytics.mjs, which the static guide pages read too — one project,
// one key, no second copy to drift.
const KEY = (import.meta as any).env?.VITE_POSTHOG_KEY ?? POSTHOG_KEY;
const HOST = (import.meta as any).env?.VITE_POSTHOG_HOST ?? POSTHOG_HOST;

let enabled = false;

// Any token-shaped first path segment (secrets.token_urlsafe(24) → 32 urlsafe chars); group 2 is
// the segment. Matching by SHAPE, not just the current token, matters: PostHog persists
// $initial_current_url across visits, so an event can carry a token from a PREVIOUS session that
// getToken() no longer knows.
const TOKEN_PATH = new RegExp(TOKEN_PATH_SOURCE, "g");

/** Replace the current token and any token-shaped URL path segment with a placeholder.
 *
 * Two things are deliberately NOT scrubbed, both of them locale segments:
 *  - the exact split only runs on token-SHAPED values. On localized landing URLs (/ru/, /pt/)
 *    getToken() returns the language code, and splitting on a 2-char substring both corrupts
 *    every "ru" inside the serialized event ("true" → "t:tokene", crashing before_send on
 *    JSON.parse) and rewrote real URLs: a guide referrer came through as
 *    /guides/:token/ai-personal-trainer/ because "en" was split out of it.
 *  - a path segment that IS a known locale is left alone even if it matched the shape, so the
 *    guide pages (/guides/<locale>/<slug>/) stay locale-visible in analytics no matter how the
 *    pattern is tuned later. A real token is never a locale, so nothing leaks. */
export function scrubToken(value: string, token: string): string {
  const exact =
    token && !token.startsWith("demo") && !isLang(token) && isLikelyToken(token)
      ? value.split(token).join(":token")
      : value;
  return exact.replace(TOKEN_PATH, (match, prefix: string, segment: string) =>
    isLang(segment) ? match : `${prefix}/:token`,
  );
}

/** Scrub every string in an event's properties (URLs, referrers, pathnames, ...).
 * JSON round-trip: properties are JSON-safe by definition, and the fast path (nothing matched)
 * returns the original object without any cloning. */
export function scrubDeep<T>(value: T, token: string): T {
  if (value == null) return value;
  const serialized = JSON.stringify(value);
  const scrubbed = scrubToken(serialized, token);
  return scrubbed === serialized ? value : (JSON.parse(scrubbed) as T);
}

export function initAnalytics() {
  const dev = !(import.meta as any).env?.PROD;
  if (dev && !(import.meta as any).env?.VITE_POSTHOG_DEV) return;
  if (!KEY) return;

  posthog.init(KEY, {
    api_host: HOST,
    debug: dev, // dev is only ever true with VITE_POSTHOG_DEV=1
    defaults: "2025-05-24", // history-change pageviews for SPA routing
    capture_exceptions: true,
    session_recording: {
      maskAllInputs: true,
      maskCapturedNetworkRequestFn: (request) => {
        const token = getToken();
        if (request.name) request.name = scrubToken(request.name, token);
        return request;
      },
    },
    before_send: (event) => {
      if (!event) return event;
      const token = getToken();
      event.properties = scrubDeep(event.properties, token);
      if (event.$set) event.$set = scrubDeep(event.$set, token);
      if (event.$set_once) event.$set_once = scrubDeep(event.$set_once, token);
      return event;
    },
  });
  // register() persists in localStorage — a demo visit must not tag the user's real
  // sessions forever, so explicitly unregister on non-demo loads.
  if (isDemo()) posthog.register({ is_demo: true });
  else posthog.unregister("is_demo");
  if (dev) (window as any).__posthog = posthog; // debugging handle, dev-only builds
  enabled = true;
}

/** Tie this browser to the backend user id (from /api/me) — never to the token. */
export function identifyUser(userId: string, props?: Record<string, unknown>) {
  if (!enabled || isDemo()) return;
  posthog.identify(userId, props);
}

export function track(name: string, props?: Record<string, unknown>) {
  if (!enabled) return;
  posthog.capture(name, props);
}

export function trackException(error: unknown, context?: Record<string, unknown>) {
  if (!enabled) return;
  posthog.captureException(error, context);
}
