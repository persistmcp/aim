import { isIOS } from "./installPrompt";
import { getToken, isLikelyToken } from "./token";

/**
 * The built index.html ships with NO <link rel="manifest"> (stripped in vite.config.ts) and this
 * attaches one at boot — except on iOS. Why the dance:
 *
 * - iOS/WebKit binds the page's manifest when the HTML is parsed: runtime href swaps and even
 *   runtime removal were not picked up (owner's iPhone kept installing start_url "/" from the
 *   static manifest, 2026-07-22, two attempts). And an iOS home-screen app gets a storage
 *   container separate from Safari's, so a start_url of "/" opens the landing with no saved
 *   token to restore. With no manifest ever present, Safari's "Add to Home Screen" falls back
 *   to the CURRENT page URL — the full token link — while the apple-* metas in index.html keep
 *   standalone display, the title and the touch icon.
 *
 * - Chromium reads manifests lazily, so a JS-attached link works: token pages point at
 *   GET /{token}/api/manifest (relative start_url resolves to /{token}/app — installs open the
 *   app directly), everything else gets the static /manifest.webmanifest.
 *
 * Must run at boot from main.tsx, before the user can reach an install surface.
 */
export function initManifestLink(): void {
  if (isIOS()) return;
  const token = getToken();
  const href = isLikelyToken(token) ? `/${token}/api/manifest` : "/manifest.webmanifest";
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "manifest");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}
