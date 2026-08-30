// SEO head fragments shared by the static guide pages (template.mjs) and the landing shells
// (landing.mjs). Extracted so the two can never disagree about hreflang: before this, the guides
// emitted a reciprocal alternate set built from LANGS while the landing carried a hand-written
// block pointing at ?lng= URLs that could not be indexed at all.

import { LANGS, OG_LOCALE } from "../shared/languages.mjs";

export const BASE_URL = "https://aim-journal.com";

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// A reciprocal alternate for every language in the set plus x-default → English. `pathFor` maps a
// language code to a site-relative path, so callers stay in control of their own URL shape, and
// `langs` lets one page belong to a set the rest of the site is not in: the Italian 1RM guide is a
// sixth alternate of `one-rep-max-calculator` under its own slug, while the landings and the other
// guides stay a five-language set (docs/SEO_PLAN.md Part R). Reciprocity is automatic because every
// page in a set is rendered from the same `langs` + `pathFor` pair.
export const alternates = (pathFor, indent = "    ", langs = LANGS) =>
  [
    ...langs.map(
      (l) => `${indent}<link rel="alternate" hreflang="${l}" href="${BASE_URL}${pathFor(l)}" />`,
    ),
    `${indent}<link rel="alternate" hreflang="x-default" href="${BASE_URL}${pathFor("en")}" />`,
  ].join("\n");

// og:locale for the current language + og:locale:alternate for the others.
export const ogLocales = (lang, indent = "    ", langs = LANGS) =>
  [
    `${indent}<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    ...langs
      .filter((l) => l !== lang)
      .map((l) => `${indent}<meta property="og:locale:alternate" content="${OG_LOCALE[l]}" />`),
  ].join("\n");
