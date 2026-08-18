// The single source of truth for which languages the site ships and in what order.
//
// Plain ESM with no dependencies so every consumer can read it: the Vite config, the post-build
// guide renderer, the guides template, and (via a parity test) the SPA's TypeScript i18n setup.
// Before this file the list existed in five places that drifted — guides/template.mjs, the SPA's
// SUPPORTED_LANGUAGES, a hardcoded array in catalogs.test.ts, the JSON-LD `inLanguage` in
// index.html, and the guide language nav.
//
// Order is priority order and it is visible: it drives the language nav on guide pages, the
// switcher on the landing, hreflang emission order and the sitemap. English is first because it
// is the runtime fallback, the x-default, and the only locale with measured search demand for
// tool-intent queries (docs/SEO_PLAN.md Part K.17).

export const LANGS = ["en", "pt", "ru", "es", "fr"];

export const LANG_LABELS = {
  en: "English",
  pt: "Português",
  ru: "Русский",
  es: "Español",
  fr: "Français",
};

// Full locale codes for og:locale. Note these are NOT the 2-letter path segments: the codebase
// uses bare 2-letter codes for URLs and language detection (navigator.language.slice(0,2)), but
// Open Graph expects language_TERRITORY.
export const OG_LOCALE = {
  en: "en_US",
  pt: "pt_BR",
  ru: "ru_RU",
  es: "es_ES",
  fr: "fr_FR",
};

// English lives at the root so the one URL Google has actually indexed keeps working; every other
// language gets a path prefix. Mirrors the existing privacyPath convention in guides/template.mjs.
export const landingPath = (l) => (l === "en" ? "/" : `/${l}/`);

export const isLang = (s) => LANGS.includes(s);
