/** localStorage key the last-seen token is persisted under (App.tsx's "/" restore, rotation). */
export const TOKEN_STORAGE_KEY = "ws_token";

/** The per-user token is the first path segment: /{token}/... (also the react-router basename). */
export function getToken(): string {
  return window.location.pathname.split("/").filter(Boolean)[0] ?? "";
}

/**
 * Real tokens come from secrets.token_urlsafe(24) — ~32 url-safe chars (hex fallback: 32).
 * Everything else that can appear in the first path segment (/demo, /guides, a mistyped
 * /robot.txt) must never be remembered as the user's token: a persisted garbage value makes
 * "/" redirect into a dead page forever (seen in prod: ws_token = "robot.txt").
 */
export function isLikelyToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(value);
}
