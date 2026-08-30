// Static HTML template for SEO guide pages. Rendered at build time by scripts/build-guides.mjs.
// Pages are plain HTML with inline CSS: no JS required, so search engines and LLM crawlers that
// do not execute JavaScript read the full content. Visual language mirrors the landing (dark
// theme, lime accent).

import { GUIDE_LANGS, LANGS, isGuideOnlyLang, landingPath } from "../shared/languages.mjs";
import { CTA_ATTR, analyticsScript } from "./analytics.mjs";
import { BASE_URL, alternates, esc, ogLocales } from "./seo.mjs";

export { BASE_URL, GUIDE_LANGS, LANGS };

// The languages one article ships in. Default is every app language; an article may opt into a
// guide-only language (docs/SEO_PLAN.md P.2 item 3: Italy is one page, not one locale) by listing
// it in `extraLangs`. Order matters, it drives hreflang and the language nav.
export const articleLangs = (article) => [...LANGS, ...(article.extraLangs ?? [])];

// A localized slug, where the target query is not a translation of the English one. `calcolo
// massimale` is the Italian phrase people actually type, so the Italian 1RM page lives at
// /guides/it/calcolo-massimale/ rather than at the English slug (the do-not-translate-targets rule,
// Part L). Everything else keeps one slug across languages.
export const articleSlug = (article, lang) => article.slugs?.[lang] ?? article.slug;

// Where the chrome (home, privacy, CTA) should point for a language. A guide-only language has no
// landing and no app locale, so its chrome links go to English rather than to a URL that would
// fall through to the SPA and render "Couldn't load data".
const chromeLang = (lang) => (isGuideOnlyLang(lang) ? "en" : lang);

const UI = {
  en: {
    home: "AIm home",
    guides: "Guides",
    also: "Read next",
    faq: "Frequently asked questions",
    cta: "Get your personal link",
    updated: "Updated:",
    privacy: "Privacy",
  },
  pt: {
    home: "Início do AIm",
    guides: "Guias",
    also: "Leia também",
    faq: "Perguntas frequentes",
    cta: "Receber o seu link pessoal",
    updated: "Atualizado:",
    privacy: "Privacidade",
  },
  ru: {
    home: "Главная AIm",
    guides: "Гайды",
    also: "Читайте также",
    faq: "Частые вопросы",
    cta: "Получить личную ссылку",
    updated: "Обновлено:",
    privacy: "Конфиденциальность",
  },
  es: {
    home: "Inicio de AIm",
    guides: "Guías",
    also: "También te puede interesar",
    faq: "Preguntas frecuentes",
    cta: "Recibir tu enlace personal",
    updated: "Actualizado:",
    privacy: "Privacidad",
  },
  it: {
    home: "Home di AIm",
    guides: "Guide",
    also: "Da leggere dopo",
    faq: "Domande frequenti",
    cta: "Ricevi il tuo link personale",
    updated: "Aggiornato:",
    privacy: "Privacy",
  },
  fr: {
    home: "Accueil AIm",
    guides: "Guides",
    also: "À lire ensuite",
    faq: "Questions fréquentes",
    cta: "Recevoir votre lien personnel",
    updated: "Mis à jour :",
    privacy: "Confidentialité",
  },
};

// Inline SVG icons keyed by guide slug — decorative, stroke follows currentColor so the accent
// tile colors them. Inline keeps guide pages single-file: no extra requests, nothing for the
// service worker or crawlers to miss.
const ICON_PATHS = {
  "claude-remember-workouts":
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8.5 13v-2.5"/><path d="M12 13V7.5"/><path d="M15.5 13v-4"/>',
  "ai-personal-trainer":
    '<path d="M4 9v6"/><path d="M7 6v12"/><path d="M17 6v12"/><path d="M20 9v6"/><path d="M7 12h10"/><path d="M2 12h2"/><path d="M20 12h2"/>',
  "connect-workout-tracker-mcp":
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  "best-workout-split":
    '<path d="M4 5h6v6H4z"/><path d="M14 5h6v6h-6z"/><path d="M4 15h6v4H4z"/><path d="M14 15h6v4h-6z"/>',
  "one-rep-max-calculator":
    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15v4"/><path d="M8 19h4"/>',
  "progressive-overload": '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/><path d="M3 21h18"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
};

const guideIcon = (slug) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[slug] ?? ICON_PATHS.book}</svg>`;

const CSS = `
:root{--bg:#0B0D0E;--panel:#151719;--border:#26292c;--text:#F5F5F5;--muted:#9aa0a6;--accent:#C6F432;--accent-fg:#0B0D0E}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.65;font-size:17px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:720px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--border)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-weight:700;font-size:18px}
.brand img{width:26px;height:26px}
.langs{display:flex;gap:4px}
.langs a,.langs span{padding:4px 9px;border-radius:8px;font-size:13px;color:var(--muted);text-transform:uppercase}
.langs span{background:var(--panel);color:var(--text);border:1px solid var(--border)}
.langs a:hover{color:var(--text);text-decoration:none}
.crumbs{font-size:13px;color:var(--muted);padding:18px 0 0}
.crumbs a{color:var(--muted)}
main{padding:10px 0 40px}
h1{font-size:34px;line-height:1.2;letter-spacing:-.02em;margin:14px 0 10px}
.lead{color:var(--muted);font-size:19px;margin-bottom:8px}
.meta{color:var(--muted);font-size:13px;margin-bottom:26px}
article h2{font-size:23px;line-height:1.3;margin:34px 0 12px;letter-spacing:-.01em}
article h3{font-size:18px;margin:22px 0 8px}
article p{margin:0 0 14px}
article ul,article ol{margin:0 0 14px 22px}
article li{margin-bottom:6px}
article strong{font-weight:600}
.calc{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:18px;margin:0 0 18px}
.calc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.calc-row label{color:var(--muted);font-size:15px}
.calc-row input{background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:9px 12px;font-size:17px;width:130px;text-align:right;font-variant-numeric:tabular-nums}
.calc-row input:focus{outline:2px solid var(--accent);outline-offset:1px}
.calc-out{font-size:18px;margin:14px 0 4px}
.calc-out strong{color:var(--accent);font-size:22px}
.calc table{margin-top:14px}
article table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:15px}
article th,article td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border)}
article th{color:var(--muted);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
article td:not(:first-child),article th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.prompt{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin:0 0 14px}
.prompt .who{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:4px}
.note{border-left:3px solid var(--accent);padding:2px 0 2px 14px;color:var(--muted);margin:0 0 14px}
.cta{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px;margin:36px 0}
.cta h2{margin:0 0 8px;font-size:21px}
.cta p{color:var(--muted);margin-bottom:16px}
.cta a.btn{display:inline-block;background:var(--accent);color:var(--accent-fg);font-weight:700;padding:12px 22px;border-radius:12px}
.cta a.btn:hover{text-decoration:none;filter:brightness(1.06)}
.also{margin:36px 0 0}
.also h2{font-size:19px;margin-bottom:12px}
.also a.card{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:10px;color:var(--text)}
.also a.card:hover{text-decoration:none;border-color:var(--accent)}
.also .t{display:block;font-weight:600}
.also .d{display:block;color:var(--muted);font-size:14px;margin-top:2px}
.also .ic{flex:0 0 44px;width:44px;height:44px;border-radius:12px;background:rgba(198,244,50,.08);border:1px solid rgba(198,244,50,.22);display:flex;align-items:center;justify-content:center;color:var(--accent)}
.also .ic svg{width:22px;height:22px}
.also .ic.lang{font-weight:700;font-size:13px;letter-spacing:.05em}
.also .tx{min-width:0}
.arthero{width:54px;height:54px;border-radius:14px;background:rgba(198,244,50,.08);border:1px solid rgba(198,244,50,.22);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-top:18px}
.arthero svg{width:28px;height:28px}
.faq h2{font-size:23px;margin:34px 0 12px}
.faq h3{font-size:17px;margin:18px 0 6px}
.faq p{color:var(--muted)}
footer.site{border-top:1px solid var(--border);margin-top:44px}
footer.site .wrap{padding-top:18px;padding-bottom:26px;font-size:13px;color:var(--muted);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
footer.site a{color:var(--muted)}
.hub h1{margin-bottom:6px}
.hub .lead{margin-bottom:24px}
@media(max-width:520px){h1{font-size:27px}article h2{font-size:20px}body{font-size:16px}}
`;

// `langs` is the hreflang set this page belongs to. A one-language set emits no alternates at all:
// there is nothing to alternate to, and an x-default pointing at another page's language would be a
// false claim. `robots` is only passed by pages that must stay out of the index.
function head({ lang, title, description, path, ogType, jsonLd, langs = LANGS, robots = null }) {
  const canon = `${BASE_URL}${path(lang)}`;
  const alts = langs.length > 1 ? `${alternates(path, "    ", langs)}\n` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0B0D0E" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${canon}" />
${robots ? `    <meta name="robots" content="${robots}" />\n` : ""}${alts}    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="AIm" />
    <meta property="og:url" content="${canon}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${BASE_URL}/og-cover.png" />
${ogLocales(lang, "    ", langs)}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${BASE_URL}/og-cover.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>${CSS}</style>
  </head>`;
}

// `track` names this page for analytics (pageType + slug); the inline snippet goes last inside
// <body> so nothing about it can block parsing or shift layout.
function chrome({ lang, path, inner, track, langs = LANGS }) {
  const ui = UI[lang];
  const home = landingPath(chromeLang(lang));
  const langLinks = langs
    .map((l) =>
      l === lang ? `<span>${l}</span>` : `<a href="${path(l)}" hreflang="${l}">${l}</a>`,
    )
    .join("");
  return `  <body>
    <header class="site">
      <div class="wrap">
        <a class="brand" href="${home}" ${CTA_ATTR}="header"><img src="/icon.svg" alt="" width="26" height="26" />AIm</a>
        <nav class="langs" aria-label="Language">${langLinks}</nav>
      </div>
    </header>
    <main>
      <div class="wrap">
${inner}
      </div>
    </main>
    <footer class="site">
      <div class="wrap">
        <span>AIm · Workout hard and smart</span>
        <span><a href="${home}" ${CTA_ATTR}="footer">${ui.home}</a> · <a href="/guides/${lang}/">${ui.guides}</a> · <a href="${privacyPath(chromeLang(lang))}">${ui.privacy}</a></span>
      </div>
    </footer>
    ${analyticsScript({ lang, ...track })}
  </body>
</html>`;
}

export function renderArticle(article, lang, siblings, buildDate) {
  const a = article[lang];
  const ui = UI[lang];
  const langs = articleLangs(article);
  const path = (l) => `/guides/${l}/${articleSlug(article, l)}/`;
  const faqLd = a.faq?.length
    ? {
        "@type": "FAQPage",
        mainEntity: a.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
        })),
      }
    : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: a.title,
        description: a.description,
        inLanguage: lang,
        dateModified: buildDate,
        mainEntityOfPage: `${BASE_URL}${path(lang)}`,
        image: `${BASE_URL}/og-cover.png`,
        author: { "@type": "Organization", name: "AIm", url: `${BASE_URL}/` },
        publisher: { "@type": "Organization", name: "AIm", url: `${BASE_URL}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "AIm", item: `${BASE_URL}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: ui.guides,
            item: `${BASE_URL}/guides/${lang}/`,
          },
          { "@type": "ListItem", position: 3, name: a.title, item: `${BASE_URL}${path(lang)}` },
        ],
      },
      ...(faqLd ? [faqLd] : []),
    ],
  };

  const sections = a.sections.map((s) => `        <h2>${s.h2}</h2>\n${s.html}`).join("\n");
  const faq = a.faq?.length
    ? `        <section class="faq">\n        <h2>${ui.faq}</h2>\n${a.faq
        .map((f) => `        <h3>${f.q}</h3>\n        <p>${f.a}</p>`)
        .join("\n")}\n        </section>`
    : "";
  const also = siblings.length
    ? `        <section class="also">\n        <h2>${ui.also}</h2>\n${siblings
        .map(
          (s) =>
            `        <a class="card" href="/guides/${lang}/${articleSlug(s, lang)}/"><span class="ic">${guideIcon(s.slug)}</span><span class="tx"><span class="t">${s[lang].title}</span><span class="d">${s[lang].description}</span></span></a>`,
        )
        .join("\n")}\n        </section>`
    : "";

  const inner = `        <nav class="crumbs"><a href="${landingPath(chromeLang(lang))}">AIm</a> / <a href="/guides/${lang}/">${ui.guides}</a></nav>
        <article>
        <div class="arthero">${guideIcon(article.slug)}</div>
        <h1>${a.title}</h1>
        <p class="lead">${a.lead}</p>
        <p class="meta">${ui.updated} ${buildDate}</p>
${sections}
${faq}
        </article>
        <div class="cta">
          <h2>${a.cta.title}</h2>
          <p>${a.cta.text}</p>
          <a class="btn" href="${landingPath(chromeLang(lang))}" ${CTA_ATTR}="article">${ui.cta}</a>
        </div>
${also}`;

  return (
    head({
      lang,
      title: a.title,
      description: a.description,
      path,
      ogType: "article",
      jsonLd,
      langs,
    }) +
    "\n" +
    chrome({ lang, path, inner, langs, track: { pageType: "guide", slug: article.slug } })
  );
}

// `robots`/`langs` exist for the guide-only hub: /guides/it/ is plumbing, not a search target. It
// keeps the one Italian guide off an orphan path (Part L gotcha 1: a missing /guides/it/ falls
// through Vercel's SPA rewrite and renders "Couldn't load data"), but a one-card index has nothing
// to rank for, so it is noindex,follow, carries no hreflang and stays out of the sitemap.
export function renderHub(hub, articles, lang, buildDate, { langs = LANGS, robots = null } = {}) {
  const h = hub[lang];
  const ui = UI[lang];
  const shown = articles.filter((a) => a[lang]);
  const path = (l) => `/guides/${l}/`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: h.title,
    description: h.description,
    inLanguage: lang,
    dateModified: buildDate,
    url: `${BASE_URL}${path(lang)}`,
    hasPart: shown.map((a) => ({
      "@type": "Article",
      headline: a[lang].title,
      url: `${BASE_URL}/guides/${lang}/${articleSlug(a, lang)}/`,
    })),
  };
  const cards = shown
    .map(
      (a) =>
        `        <a class="card" href="/guides/${lang}/${articleSlug(a, lang)}/"><span class="ic">${guideIcon(a.slug)}</span><span class="tx"><span class="t">${a[lang].title}</span><span class="d">${a[lang].description}</span></span></a>`,
    )
    .join("\n");
  const inner = `        <div class="hub">
        <nav class="crumbs"><a href="${landingPath(chromeLang(lang))}">AIm</a> / ${ui.guides}</nav>
        <h1>${h.title}</h1>
        <p class="lead">${h.lead}</p>
        <section class="also">
${cards}
        </section>
        <div class="cta">
          <h2>${h.cta.title}</h2>
          <p>${h.cta.text}</p>
          <a class="btn" href="${landingPath(chromeLang(lang))}" ${CTA_ATTR}="hub">${ui.cta}</a>
        </div>
        </div>`;
  return (
    head({
      lang,
      title: h.title,
      description: h.description,
      path,
      ogType: "website",
      jsonLd,
      langs,
      robots,
    }) +
    "\n" +
    chrome({ lang, path, inner, langs: GUIDE_LANGS, track: { pageType: "guide_hub" } })
  );
}

// The bare /guides/ root. Each language has its own canonical hub, so this page is only a
// router for people who land on the root by hand or via a truncated link: it redirects the
// browser to its language's hub and shows plain links as the no-JS/crawler fallback. noindex —
// the sitemap and hreflang point at the language hubs, this page must not compete with them.
export function renderGuidesRoot(hub) {
  const alts = LANGS.map(
    (l) => `    <link rel="alternate" hreflang="${l}" href="${BASE_URL}/guides/${l}/" />`,
  ).join("\n");
  const links = GUIDE_LANGS.map(
    (l) =>
      `        <a class="card" href="/guides/${l}/" hreflang="${l}"><span class="ic lang">${l.toUpperCase()}</span><span class="tx"><span class="t">${hub[l].title}</span><span class="d">${hub[l].description}</span></span></a>`,
  ).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0B0D0E" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <title>AIm guides</title>
    <meta name="robots" content="noindex,follow" />
${alts}
    <link rel="alternate" hreflang="x-default" href="${BASE_URL}/guides/en/" />
    <script>
      var l = (navigator.language || "en").slice(0, 2).toLowerCase();
      location.replace("/guides/" + (${JSON.stringify(GUIDE_LANGS)}.indexOf(l) >= 0 ? l : "en") + "/");
    </script>
    <style>${CSS}</style>
  </head>
  <body>
    <main>
      <div class="wrap">
        <h1>Guides</h1>
        <section class="also">
${links}
        </section>
      </div>
    </main>
  </body>
</html>`;
}

export const privacyPath = (l) => (l === "en" ? "/privacy/" : `/privacy/${l}/`);

export function renderPrivacy(privacy, lang) {
  const p = privacy[lang];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: p.title,
    description: p.description,
    inLanguage: lang,
    dateModified: privacy.effective,
    url: `${BASE_URL}${privacyPath(lang)}`,
  };
  const sections = p.sections.map((s) => `        <h2>${s.h2}</h2>\n${s.html}`).join("\n");
  const inner = `        <article>
        <h1>${p.title}</h1>
        <p class="lead">${p.lead}</p>
        <p class="meta">${UI[lang].updated} ${privacy.effective}</p>
${sections}
        </article>`;
  return (
    head({
      lang,
      title: p.title,
      description: p.description,
      path: privacyPath,
      ogType: "website",
      jsonLd,
    }) +
    "\n" +
    chrome({ lang, path: privacyPath, inner, track: { pageType: "privacy" } })
  );
}

export function renderSitemap(articles, buildDate) {
  const urls = [];
  const entry = (loc, pathFor, priority, langs = LANGS) => {
    const alts = langs
      .map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${BASE_URL}${pathFor(l)}" />`,
      )
      .join("\n");
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
${alts}
    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}${pathFor("en")}" />
  </url>`;
  };
  // Landing: one entry per language at its own path. The previous ?lng= alternates could never be
  // indexed — index.html declared an unconditional canonical to "/", so Google consolidated every
  // alternate into the root and dropped their hreflang. Each language now has a real URL with a
  // self-referencing canonical (see guides/landing.mjs).
  for (const l of LANGS)
    urls.push(entry(`${BASE_URL}${landingPath(l)}`, landingPath, l === "en" ? "1.0" : "0.9"));
  for (const l of LANGS)
    urls.push(entry(`${BASE_URL}/guides/${l}/`, (x) => `/guides/${x}/`, "0.8"));
  for (const l of LANGS) urls.push(entry(`${BASE_URL}${privacyPath(l)}`, privacyPath, "0.3"));
  // Articles carry their own language set and their own per-language slugs, so an article that
  // ships one extra guide-only language adds exactly one URL (SEO_PLAN Part R: 45 → 46).
  for (const a of articles) {
    const langs = articleLangs(a);
    for (const l of langs)
      urls.push(
        entry(
          `${BASE_URL}/guides/${l}/${articleSlug(a, l)}/`,
          (x) => `/guides/${x}/${articleSlug(a, x)}/`,
          "0.7",
          langs,
        ),
      );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}
