// The one PostHog project the whole site reports to, plus the token-scrubbing pattern that keeps
// a user's secret link out of it.
//
// Plain ESM with no dependencies, for the same reason as shared/languages.mjs: two very different
// consumers need these values and neither may own a private copy.
//   - the SPA (src/app/lib/analytics.ts), compiled by Vite;
//   - the static guide pages (guides/analytics.mjs), rendered to HTML in Node at build time and
//     shipped with no bundle at all.
// Before this file the guide pages had no analytics whatsoever, which is why 40 days of organic
// search traffic to /guides/* was invisible in PostHog while Search Console counted the clicks.

// Project API keys are public by design — they can only ingest.
export const POSTHOG_KEY = "phc_BkasniTDYiUrKYXLqcDxeJJQfr79ENveDhTRb3DtkPpJ";
export const POSTHOG_HOST = "https://us.i.posthog.com";

// posthog-js persists its person state (distinct_id, $device_id, ...) as JSON under this key, in
// localStorage AND in a cookie. The guide snippet reads it so a reader who came from search and
// then opens the app is the SAME person, not a fresh anonymous one — which is the whole point of
// measuring guide → landing conversion.
export const personStorageKey = (key = POSTHOG_KEY) => `ph_${key}_posthog`;

// A token-shaped URL path segment: /{32 url-safe chars} straight after the host (or after a quote
// / start-of-string, so serialized pathnames match too). Group 1 is the prefix, group 2 the
// segment itself — the caller decides what to do with it, which is how the locale exemption in
// analytics.ts is expressed.
//
// Matching by SHAPE, not just the current token, matters: PostHog persists $initial_current_url
// across visits, so an event can carry a token from a PREVIOUS session. The {20,} floor is also
// what keeps two-letter locale segments (/guides/en/, /ru/) out of the match.
export const TOKEN_PATH_SOURCE = String.raw`(^|["']|https?://[^/\s"']+)/([A-Za-z0-9_-]{20,})(?=[/?#"'\s]|$)`;
