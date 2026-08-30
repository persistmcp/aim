/**
 * Paths the service worker must NOT answer with the cached app shell.
 *
 * Lives here rather than inline in vite.config.ts so it can be tested: getting this list wrong is
 * invisible on a first visit and only breaks for *returning* visitors, whose worker quietly serves
 * the SPA instead of the real response. It has bitten twice — /sitemap.xml rendering the app saying
 * "Couldn't load data", and then /oauth/consent doing the same and dropping the authorization_id
 * out of the URL, which broke the whole OAuth connect flow.
 *
 * The rule of thumb: if a path is served by the Python function or is a real file, it belongs here.
 * Only routes the React app itself owns may fall through to index.html.
 */
export function navigateFallbackDenylist(langs) {
  return [
    // Token-scoped API, MCP and the OAuth resume link: /{token}/api/…, /{token}/mcp,
    // /{token}/oauth/resume — the last one is how an emailed link identifies a browser that has
    // never opened the app, so the worker swallowing it breaks connecting from a second device.
    /^\/[^/]+\/(api|mcp|oauth)/,
    // OAuth: the consent screen and anything else the authorization flow adds. Without this a
    // returning visitor's worker hijacks the redirect Supabase sends them to, the app treats
    // "oauth" as their token, and the authorization_id is stripped from the URL.
    /^\/oauth(\/|$)/,
    // The token-less MCP endpoint. The rule above needs two path segments, so a bare /mcp is not
    // covered by it.
    /^\/mcp(\/|$)/,
    // OAuth discovery documents (RFC 8414 / RFC 9728). Clients fetch these directly, but a browser
    // that lands on one must get the document, not the app.
    /^\/\.well-known(\/|$)/,
    /^\/_cron/,
    /^\/api\//,
    /^\/guides(\/|$)/,
    /^\/privacy(\/|$)/,
    /^\/instructions(\/|$)/,
    // The non-English landings are prerendered files (dist/<lng>/index.html) with their own
    // localized head. Without this a returning visitor's worker would answer /ru/ with the
    // cached English shell.
    new RegExp(`^/(${langs.filter((l) => l !== "en").join("|")})(/|$)`),
    // File-looking paths (/sitemap.xml, /robots.txt, /llms.txt) are real files.
    /\.[a-z0-9]+$/i,
  ];
}
