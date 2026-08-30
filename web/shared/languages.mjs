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

// Guide-only languages: a language that has static guide pages but NO app locale, no landing and
// no i18n catalog. Deliberately a separate list rather than an entry in LANGS, because LANGS means
// "the app speaks this": the parity tests (backend/tests/unit/test_locale_parity.py,
// src/app/i18n/catalogs.test.ts) read LANGS and demand a signup email, XLSX headers, a full 444-key
// catalog and a prerendered landing for every entry. A one-page bet on one search term must not
// drag all of that in (docs/SEO_PLAN.md P.2 item 3).
//
// What a guide-only language DOES get: the guide chrome strings in guides/template.mjs, whatever
// article opts into it via `extraLangs`, a `/guides/<lang>/` hub, a sitemap entry per page, and a
// path guard in App.tsx so `/it/` (which is not a real page) does not boot the app shell.
// What it must NOT get: an entry in i18n's SUPPORTED_LANGUAGES, or the path detector would persist
// it as the app language.
export const GUIDE_ONLY_LANGS = ["it"];

// Everything with a static surface, in priority order. Read by the guide renderer; never by the app.
export const GUIDE_LANGS = [...LANGS, ...GUIDE_ONLY_LANGS];

export const LANG_LABELS = {
  en: "English",
  pt: "Português",
  ru: "Русский",
  es: "Español",
  fr: "Français",
  it: "Italiano",
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
  it: "it_IT",
};

// English lives at the root so the one URL Google has actually indexed keeps working; every other
// language gets a path prefix. Mirrors the existing privacyPath convention in guides/template.mjs.
export const landingPath = (l) => (l === "en" ? "/" : `/${l}/`);

export const isLang = (s) => LANGS.includes(s);

// True for a path segment that names a guide-only language. App.tsx uses it so `/it/...` is not
// read as an auth token; nothing else in the app may treat it as a language.
export const isGuideOnlyLang = (s) => GUIDE_ONLY_LANGS.includes(s);
