// i18n foundation (react-i18next). Russian is the source language (copy is authored/reviewed in
// ru first, see docs/LANDING_COPY.md); en/pt/es/fr are translations. English is the runtime
// fallbackLng: a visitor whose detected language isn't one of the supported set (or arrives with
// no signal at all, e.g. a crawler without Accept-Language) gets English, matching the product's
// global-first positioning rather than defaulting to Russian.
// Language is detected once (saved choice → browser), persisted to localStorage, and switchable at
// runtime without a reload. Catalogs are bundled statically for now (small app, PWA-friendly); if
// they grow we can switch to lazy per-language chunks via i18next-http-backend.
import i18n, { type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Order is priority order and it is user-visible: it drives the landing switcher and the settings
// picker. English first because it is the fallback, the x-default and the only locale with
// measured search demand (docs/SEO_PLAN.md Part K.17). Must stay in step with
// web/shared/languages.mjs, which the build scripts read — guarded by a parity test in
// catalogs.test.ts.
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const isSupportedLanguage = (s: string | undefined): s is LanguageCode =>
  !!s && SUPPORTED_LANGUAGES.some((l) => l.code === s);

// English lives at the root (the one URL Google has indexed); every other language gets a path
// prefix. Mirrors landingPath in web/shared/languages.mjs, which the build scripts use to emit
// dist/<lng>/index.html and the sitemap — the parity test keeps the two honest.
export const landingPath = (code: string) => (code === "en" ? "/" : `/${code}/`);

export const LANGUAGE_STORAGE_KEY = "ws_lang";

// Auto-register every catalog under locales/<lng>/<ns>.json. Adding a new namespace file is enough —
// no wiring here. Namespaces are per-screen (home/progress/session/…) so they stay small and can be
// authored independently.
const catalogs = import.meta.glob<{ default: Resource }>("./locales/*/*.json", { eager: true });
const resources: Resource = {};
const namespaces = new Set<string>();
for (const [path, mod] of Object.entries(catalogs)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  ((resources[lng] ??= {}) as Record<string, unknown>)[ns] = (mod as { default: unknown }).default;
  namespaces.add(ns);
}

// Each non-English landing is a real prerendered page at /<lng>/, so the path has to outrank a
// previously saved choice — otherwise a visitor with ws_lang="ru" who opens /es/ reads a Spanish
// <head> above a Russian page. Deliberately a custom detector rather than i18next's built-in
// "path" one: with caches:["localStorage"] that would happily persist a token segment as the
// language, the same class of bug token.ts already guards against.
const detector = new LanguageDetector();
detector.addDetector({
  name: "supportedPath",
  lookup() {
    const segment = window.location.pathname.split("/").filter(Boolean)[0];
    return isSupportedLanguage(segment) ? segment : undefined;
  },
});

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    ns: [...namespaces],
    fallbackLng: "en",
    fallbackNS: "common",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    defaultNS: "common",
    detection: {
      // An explicit ?lng= link still wins so older shared links keep working, then the URL path
      // (/es/ is a real page with a Spanish head — it must beat a stale saved choice), then the
      // saved choice, then the browser. Persist whatever we resolve.
      order: ["querystring", "supportedPath", "localStorage", "navigator"],
      lookupQuerystring: "lng",
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false }, // React already escapes
    returnEmptyString: false,
  });

// Keep <html lang> in sync for a11y / correct hyphenation & speech. Guarded so importing i18n in a
// non-DOM context (e.g. Vitest node env) doesn't throw.
const syncHtmlLang = (lng: string) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
};
syncHtmlLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
