// Renders the static SEO guide pages into dist/ after `vite build`.
// Output: dist/guides/<lang>/<slug>/index.html, dist/guides/<lang>/index.html, dist/sitemap.xml.
// Vercel serves real files before rewrites, so these pages bypass the SPA entirely and are full
// HTML for crawlers that do not execute JavaScript.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GUIDE_ONLY_LANGS, landingPath } from "../shared/languages.mjs";
import { withLandingHead } from "../guides/landing.mjs";
import {
  GUIDE_LANGS,
  LANGS,
  articleLangs,
  articleSlug,
  privacyPath,
  renderArticle,
  renderGuidesRoot,
  renderHub,
  renderPrivacy,
  renderSitemap,
} from "../guides/template.mjs";
import hub from "../guides/content/hub.mjs";
import privacy from "../guides/content/privacy.mjs";
import rememberWorkouts from "../guides/content/claude-remember-workouts.mjs";
import aiPersonalTrainer from "../guides/content/ai-personal-trainer.mjs";
import connectMcp from "../guides/content/connect-workout-tracker-mcp.mjs";
import progressiveOverload from "../guides/content/progressive-overload.mjs";
import oneRepMax from "../guides/content/one-rep-max-calculator.mjs";
import bestSplit from "../guides/content/best-workout-split.mjs";

const articles = [
  rememberWorkouts,
  aiPersonalTrainer,
  connectMcp,
  progressiveOverload,
  oneRepMax,
  bestSplit,
];
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const buildDate = new Date().toISOString().slice(0, 10);

// Fail with a useful message when a content module is missing a language. Without this the loops
// below blow up as "Cannot read properties of undefined" somewhere deep in the renderer, naming
// neither the module nor the language — the exact trap when adding a locale.
for (const [name, mod] of [
  ["hub", hub],
  ["privacy", privacy],
  ...articles.map((a) => [a.slug, a]),
]) {
  const required = mod.extraLangs ? articleLangs(mod) : LANGS;
  const missing = required.filter((l) => !mod[l]);
  if (missing.length)
    throw new Error(
      `guides/content/${name}.mjs is missing language block(s): ${missing.join(", ")}. ` +
        `Every module must cover all of LANGS (${LANGS.join(", ")}).`,
    );
}

// A guide-only language must be declared in shared/languages.mjs, or App.tsx would read its path
// segment as an auth token and /it/ would boot a broken app shell (Part L gotcha 1).
for (const a of articles)
  for (const l of a.extraLangs ?? [])
    if (!GUIDE_ONLY_LANGS.includes(l))
      throw new Error(
        `guides/content/${a.slug}.mjs declares extraLangs "${l}", which is not in ` +
          `GUIDE_ONLY_LANGS in shared/languages.mjs.`,
      );

// The Italian hub carries the single Italian guide. It exists so /guides/it/ is a real file rather
// than an SPA fallback; hub.mjs supplies its copy.
const langsWithGuides = GUIDE_LANGS.filter(
  (l) => LANGS.includes(l) || articles.some((a) => articleLangs(a).includes(l)),
);

let pages = 0;
for (const lang of langsWithGuides) {
  const guideOnly = !LANGS.includes(lang);
  await mkdir(join(dist, "guides", lang), { recursive: true });
  await writeFile(
    join(dist, "guides", lang, "index.html"),
    renderHub(hub, articles, lang, buildDate, {
      langs: guideOnly ? [lang] : LANGS,
      robots: guideOnly ? "noindex,follow" : null,
    }),
  );
  pages += 1;
  for (const article of articles.filter((a) => a[lang])) {
    // Siblings are the other guides that exist in THIS language: a "Read next" card pointing at a
    // page the language does not have would be a 404 (and an SPA shell, at that).
    const siblings = articles.filter((a) => a.slug !== article.slug && a[lang]);
    const dir = join(dist, "guides", lang, articleSlug(article, lang));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), renderArticle(article, lang, siblings, buildDate));
    pages += 1;
  }
}

for (const lang of LANGS) {
  const dir = join(dist, privacyPath(lang));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), renderPrivacy(privacy, lang));
  pages += 1;
}

// The bare /guides/ root would otherwise fall through Vercel's SPA rewrite and render the app
// shell ("Couldn't load data") — give it a real page that routes to the language hubs.
await writeFile(join(dist, "guides", "index.html"), renderGuidesRoot(hub));
pages += 1;

// Non-English landings. Derived from the built dist/index.html (which the Vite plugin already
// filled with the English head) rather than templated from scratch, so the hashed asset paths and
// everything else Vite injected carry over untouched — only the <head> SEO block and <html lang>
// differ. Vite emits absolute /assets/... URLs, so a copy at a subpath resolves fine.
const builtIndex = await readFile(join(dist, "index.html"), "utf8");
for (const lang of LANGS.filter((l) => l !== "en")) {
  const dir = join(dist, landingPath(lang));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), withLandingHead(builtIndex, lang));
  pages += 1;
}

await writeFile(join(dist, "sitemap.xml"), renderSitemap(articles, buildDate));
console.log(`guides: ${pages} pages + sitemap.xml written to dist/`);
