// Generates the localized SEO block for the landing page, one per language.
//
// Why this exists: the landing used to ship a single hand-written English <head>. Its hreflang
// alternates pointed at ?lng= URLs while the canonical unconditionally pointed at "/", so Google
// consolidated every alternate into the root and ignored their hreflang — the language variants
// were not merely mislabeled, they were structurally unindexable. And because canonical/OG/JSON-LD
// were never updated at runtime, every social unfurler and LLM crawler (none of which execute JS)
// saw English for all four languages.
//
// Everything here is derived from web/src/app/i18n/locales/<lng>/landing.json, which already holds
// the localized title, description and all ten FAQ entries. That kills a whole class of drift: the
// previous hand-maintained JSON-LD had already fallen out of sync with the catalog (it advertised
// "Download a JSON file" where the catalog says Excel).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LANGS, landingPath } from "../shared/languages.mjs";
import { BASE_URL, alternates, esc, ogLocales } from "./seo.mjs";

const catalog = (lang) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../src/app/i18n/locales/${lang}/landing.json`, import.meta.url)),
      "utf8",
    ),
  );

const stripTags = (s) => String(s).replace(/<[^>]*>/g, "");

// The feature list is assembled from strings that are already translated in every catalog, rather
// than a parallel English-only array. Seven items: the three landing benefits plus the four
// showcase section titles.
const featureList = (c) => [
  ...Object.values(c.benefits ?? {}),
  ...["coach", "muscle", "progress", "program"].map((k) => c.showcase?.[k]?.title).filter(Boolean),
];

const faqEntries = (c) =>
  Object.entries(c.faq ?? {})
    .filter(([k, v]) => k !== "title" && v && typeof v === "object" && v.q && v.a)
    .map(([, v]) => ({
      "@type": "Question",
      name: stripTags(v.q),
      acceptedAnswer: { "@type": "Answer", text: stripTags(v.a) },
    }));

/**
 * The SEO portion of the landing <head> for one language, as an HTML string.
 *
 * Deliberately NOT the whole <head>: Vite injects the hashed script/stylesheet tags there during
 * the build, so callers splice this between the SEO markers in index.html and leave the rest of
 * the head — charset, viewport, PWA metas and the asset tags — untouched.
 */
export function renderLandingHead(lang) {
  const c = catalog(lang);
  const title = c.meta.title;
  const description = c.meta.description;
  const url = `${BASE_URL}${landingPath(lang)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "AIm",
        url,
        // Reuses the page description rather than carrying a second, separately-translated app
        // description. One string per locale, one place to change it, nothing to drift.
        description,
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        inLanguage: LANGS,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: featureList(c),
      },
      { "@type": "FAQPage", mainEntity: faqEntries(c) },
    ],
  };

  return `    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />

${alternates(landingPath)}

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="AIm" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${BASE_URL}/og-cover.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
${ogLocales(lang)}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${BASE_URL}/og-cover.png" />

    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

export const SEO_START = "<!-- seo:start -->";
export const SEO_END = "<!-- seo:end -->";

/**
 * Replaces the block between the SEO markers in an index.html string, and swaps <html lang>.
 * Used both by the Vite plugin (English, during the build) and by scripts/build-guides.mjs
 * (every other language, deriving from the built dist/index.html so hashed asset paths survive).
 */
export function withLandingHead(html, lang) {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start === -1 || end === -1)
    throw new Error(`landing head markers not found in index.html (looking for ${SEO_START})`);
  return (
    html.slice(0, start + SEO_START.length) +
    "\n" +
    renderLandingHead(lang) +
    "\n    " +
    html.slice(end)
  ).replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
}
