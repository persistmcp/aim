/**
 * The service worker must never answer a non-app path with the cached shell.
 *
 * This has broken production twice: /sitemap.xml rendering the app's "Couldn't load data", and
 * /oauth/consent doing the same — which also stripped the authorization_id out of the URL and so
 * broke the entire OAuth connect flow for anyone who had ever opened the app. A first visit always
 * looks fine, so only a test catches it.
 */
import { describe, expect, it } from "vitest";

import { LANGS } from "../../../shared/languages.mjs";
import { navigateFallbackDenylist } from "../../../shared/swDenylist.mjs";

const denylist = navigateFallbackDenylist(LANGS);
const denied = (path: string) => denylist.some((re) => re.test(path));

describe("service worker navigation denylist", () => {
  it("keeps the OAuth flow on the network", () => {
    // The consent screen is served by the Python function. If the worker answers it, Supabase's
    // redirect lands on the app shell and the authorization_id is lost.
    expect(denied("/oauth/consent")).toBe(true);
    expect(denied("/oauth/consent/details")).toBe(true);
    expect(denied("/oauth/consent/decide")).toBe(true);
    // The emailed resume link is token-scoped, so it needs the two-segment rule, not the bare one.
    expect(denied("/SomeToken123456789012/oauth/resume")).toBe(true);
  });

  it("keeps both MCP endpoints on the network", () => {
    expect(denied("/mcp")).toBe(true); // OAuth, token-less
    expect(denied("/sometoken/mcp")).toBe(true); // legacy, token in the path
  });

  it("keeps OAuth discovery documents on the network", () => {
    expect(denied("/.well-known/oauth-protected-resource/mcp")).toBe(true);
    expect(denied("/.well-known/oauth-authorization-server")).toBe(true);
  });

  it("keeps the API, cron and static pages on the network", () => {
    expect(denied("/sometoken/api/summary")).toBe(true);
    expect(denied("/api/public/signup")).toBe(true);
    expect(denied("/_cron/backup")).toBe(true);
    expect(denied("/guides/en/ai-personal-trainer")).toBe(true);
    expect(denied("/privacy")).toBe(true);
    expect(denied("/instructions")).toBe(true);
    expect(denied("/sitemap.xml")).toBe(true);
    expect(denied("/robots.txt")).toBe(true);
  });

  it("keeps prerendered non-English landings on the network", () => {
    for (const lang of LANGS.filter((l) => l !== "en")) {
      expect(denied(`/${lang}/`)).toBe(true);
    }
  });

  it("still lets the app's own routes fall through to the shell", () => {
    // These are React Router paths under a user's token — the worker SHOULD serve the shell here,
    // which is the whole point of an installed PWA working offline.
    expect(denied("/exampleTokenNotARealCredential00")).toBe(false);
    expect(denied("/exampleTokenNotARealCredential00/history")).toBe(false);
    expect(denied("/exampleTokenNotARealCredential00/progress")).toBe(false);
    expect(denied("/demo")).toBe(false);
    expect(denied("/")).toBe(false);
  });
});
