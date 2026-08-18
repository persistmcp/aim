import { defineConfig } from "vitest/config";
import path from "path";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

import { withLandingHead } from "./guides/landing.mjs";
import { LANGS } from "./shared/languages.mjs";

function figmaAssetResolver(): Plugin {
  return {
    name: "figma-asset-resolver",
    resolveId(id: string) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "");
        return path.resolve(__dirname, "src/assets", filename);
      }
    },
  };
}

// Strip the manifest link the PWA plugin injects into index.html. Safari appears to bind the
// page's manifest at HTML parse time — runtime href swaps and even runtime removal were NOT
// picked up (owner's iPhone kept installing start_url "/" from the static manifest,
// 2026-07-22). With no link in the parsed HTML at all, iOS "Add to Home Screen" falls back to
// the current page URL (the full token link) and the apple-* metas cover standalone/title/icon.
// Non-iOS browsers get the link re-attached at boot by src/app/lib/manifestLink.ts — Chromium
// reads manifests lazily, so a JS-attached link works there (documented pattern).
function stripManifestLink(): Plugin {
  return {
    name: "strip-manifest-link",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        return html.replace(/[ \t]*<link rel="manifest"[^>]*>\n?/, "");
      },
    },
  };
}

// Fill the English SEO block in index.html from the i18n catalog. Runs inside the build (rather
// than rewriting dist/index.html afterwards) because vite-plugin-pwa computes the workbox precache
// revision for index.html during the build — a post-build rewrite would leave a stale revision and
// returning visitors would keep serving the cached shell. The other languages are emitted as
// dist/<lng>/index.html by scripts/build-guides.mjs, which derives them from this same output so
// the hashed asset paths carry over.
function localizedLandingHead(): Plugin {
  return {
    name: "localized-landing-head",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        return withLandingHead(html, "en");
      },
    },
  };
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // We register the worker ourselves (src/main.tsx) so we can poll for updates while an
      // installed PWA stays open — otherwise it never re-checks and shows a stale build.
      injectRegister: false,
      manifest: {
        // English, matching i18n fallbackLng and the x-default landing. A hand-mirrored copy of
        // this manifest lives in backend/src/workout_storage/api.py (_TOKEN_MANIFEST) — change
        // both together or they drift.
        name: "AIm: AI coach and workout journal",
        short_name: "AIm",
        lang: "en",
        description: "Goal, plan and progress inside your AI",
        theme_color: "#0B0D0E",
        background_color: "#0B0D0E",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        // vite-plugin-pwa only defaults these to true when it injects its own register script;
        // injectRegister is false here (we register manually in main.tsx), so without this a
        // freshly-fetched worker sits in "waiting" forever while the tab stays open — the
        // "reloads itself once the new worker activates" auto-update never actually fires, and
        // registration.update() (hourly poll, focus check, or pull-to-refresh) is a no-op in
        // practice. skipWaiting activates the new worker immediately; clientsClaim hands it
        // control of the already-open tab, which is what makes that tab's reload fire.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // Don't treat API/MCP/cron requests as SPA navigations. /guides/ and /privacy/ pages
        // and /instructions/ are static HTML outside the app bundle, and file-looking paths
        // (/sitemap.xml, /robots.txt, /llms.txt) are real files — all of them must hit the
        // network, or a returning visitor's service worker serves the app shell instead
        // (seen in prod: /sitemap.xml rendered the app saying "Couldn't load data").
        navigateFallbackDenylist: [
          /^\/[^/]+\/(api|mcp)/,
          /^\/_cron/,
          /^\/api\//,
          /^\/guides(\/|$)/,
          /^\/privacy(\/|$)/,
          /^\/instructions(\/|$)/,
          // The non-English landings are prerendered files (dist/<lng>/index.html) with their own
          // localized head. Without this a returning visitor's worker would answer /ru/ with the
          // cached English shell — same failure the /sitemap.xml note above describes.
          new RegExp(`^/(${LANGS.filter((l) => l !== "en").join("|")})(/|$)`),
          /\.[a-z0-9]+$/i,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/[^/]+\/api\//.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "workout-api", expiration: { maxEntries: 80 } },
          },
        ],
      },
    }),
    stripManifestLink(),
    localizedLandingHead(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],

  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
