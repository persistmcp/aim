// Guards the guide renderer where a mistake would be invisible until Google saw it: the hreflang
// sets, the sitemap, and the one page that carries JavaScript.
//
// It lives next to the module (rather than under src/, like guideAnalytics.test.ts) because it
// imports template.mjs, which has no .d.mts and is not part of the app's TypeScript project.
// Vitest picks it up anyway; tsc -b does not look at it.
//
// The calculator cases execute the real inline script in jsdom. That is the only honest way to
// test a string of JavaScript rendered into HTML, and it is what proves the Italian page computes
// the same numbers as the English one instead of merely containing the same-looking markup.

import { describe, expect, it } from "vitest";

import { GUIDE_ONLY_LANGS, LANGS } from "../shared/languages.mjs";
import { articleLangs, articleSlug, renderArticle, renderHub, renderSitemap } from "./template.mjs";
import hub from "./content/hub.mjs";
import oneRepMax from "./content/one-rep-max-calculator.mjs";
import progressiveOverload from "./content/progressive-overload.mjs";

const BUILD_DATE = "2026-08-18";
const articles = [oneRepMax, progressiveOverload];

const render = (article, lang) =>
  renderArticle(
    article,
    lang,
    articles.filter((a) => a.slug !== article.slug && a[lang]),
    BUILD_DATE,
  );

const alternatesOf = (html) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  );

const head = (html) => html.slice(0, html.indexOf("</head>"));

/** Parse the calculator out of a rendered page, run its script in jsdom and drive the inputs. */
function mountCalculator(html) {
  document.body.innerHTML = html.slice(html.indexOf("<body>") + "<body>".length);
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((code) => code.includes("orm-weight"));
  if (!source) throw new Error("the rendered page carries no calculator script");
  new Function(source)();
  const weight = document.getElementById("orm-weight");
  const reps = document.getElementById("orm-reps");
  return (kg, n) => {
    weight.value = String(kg);
    reps.value = String(n);
    weight.dispatchEvent(new Event("input"));
    return {
      estimate: document.querySelector("#orm-out strong").textContent,
      percentages: [...document.querySelectorAll("#orm-table td[data-pct]")].map(
        (td) => td.textContent,
      ),
    };
  };
}

// stats.epley_1rm, transcribed: reps <= 1 returns the weight itself, a set of one IS the max.
const epley = (kg, n) => Math.round((n <= 1 ? kg : kg * (1 + n / 30)) * 10) / 10;

describe("guide-only languages", () => {
  it("are not app languages", () => {
    for (const lang of GUIDE_ONLY_LANGS) expect(LANGS).not.toContain(lang);
  });

  it("only appear in the hreflang set of the articles that opted in", () => {
    expect(articleLangs(oneRepMax)).toEqual([...LANGS, "it"]);
    expect(articleLangs(progressiveOverload)).toEqual([...LANGS]);
    const other = alternatesOf(head(render(progressiveOverload, "en")));
    expect(other.filter((a) => a.startsWith("it "))).toEqual([]);
    expect(other).toHaveLength(LANGS.length + 1); // + x-default
    expect(alternatesOf(head(renderHub(hub, articles, "en", BUILD_DATE)))).toEqual([
      ...LANGS.map((l) => `${l} https://aim-journal.com/guides/${l}/`),
      "x-default https://aim-journal.com/guides/en/",
    ]);
  });

  it("get no hreflang of their own on a single-language page", () => {
    const html = renderHub(hub, articles, "it", BUILD_DATE, {
      langs: ["it"],
      robots: "noindex,follow",
    });
    expect(alternatesOf(head(html))).toEqual([]);
    expect(head(html)).toContain('<meta name="robots" content="noindex,follow" />');
  });

  it("never link the chrome at a path that does not exist", () => {
    const html = render(oneRepMax, "it");
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).not.toContain("/it/");
    expect(hrefs).not.toContain("/privacy/it/");
    expect(hrefs).toContain("/"); // the English landing, which is the one that exists
    expect(hrefs).toContain("/privacy/");
    expect(hrefs).toContain("/guides/it/");
  });
});

describe("the one-rep-max cluster", () => {
  it("uses the Italian phrase verbatim as the Italian slug", () => {
    expect(articleSlug(oneRepMax, "it")).toBe("calcolo-massimale");
    expect(articleSlug(oneRepMax, "en")).toBe("one-rep-max-calculator");
  });

  it("emits a reciprocal hreflang set from every page in it", () => {
    const expected = [
      ...LANGS.map((l) => `${l} https://aim-journal.com/guides/${l}/one-rep-max-calculator/`),
      "it https://aim-journal.com/guides/it/calcolo-massimale/",
      "x-default https://aim-journal.com/guides/en/one-rep-max-calculator/",
    ];
    for (const lang of articleLangs(oneRepMax))
      expect(alternatesOf(head(render(oneRepMax, lang))), lang).toEqual(expected);
  });

  it("self-references its canonical", () => {
    for (const lang of articleLangs(oneRepMax))
      expect(head(render(oneRepMax, lang)), lang).toContain(
        `<link rel="canonical" href="https://aim-journal.com/guides/${lang}/${articleSlug(oneRepMax, lang)}/" />`,
      );
  });

  it("leads the Italian title with the literal search term, inside the SERP limit", () => {
    expect(oneRepMax.it.title.startsWith("Calcolo massimale")).toBe(true);
    expect(oneRepMax.it.title.length).toBeLessThanOrEqual(60);
  });

  it("carries the per-lift sections the completion tree branches on", () => {
    const html = render(oneRepMax, "it");
    for (const lift of ["panca", "squat", "stacco"]) expect(html.toLowerCase()).toContain(lift);
  });
});

describe("the calculator", () => {
  const cases = [
    [100, 5],
    [60, 12],
    [140, 1], // the single-rep case: the formula must not inflate it
    [82.5, 3],
  ];

  it.each(cases)("mirrors stats.epley_1rm for %s kg x %s", (kg, reps) => {
    const drive = mountCalculator(render(oneRepMax, "it"));
    expect(drive(kg, reps).estimate).toBe(String(epley(kg, reps)));
  });

  it("computes the same numbers in Italian as in English", () => {
    for (const [kg, reps] of cases) {
      const en = mountCalculator(render(oneRepMax, "en"))(kg, reps);
      const it = mountCalculator(render(oneRepMax, "it"))(kg, reps);
      expect(it).toEqual(en);
    }
  });

  it("labels the Italian widget in Italian", () => {
    const html = render(oneRepMax, "it");
    expect(html).toContain("Peso sollevato");
    expect(html).toContain("Ripetizioni eseguite");
    expect(html).toContain("Massimale stimato");
    expect(html).not.toContain("Weight lifted");
  });
});

describe("the sitemap", () => {
  it("adds exactly one URL for the Italian page", () => {
    const xml = renderSitemap(articles, BUILD_DATE);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // 5 landings + 5 hubs + 5 privacy + 5 langs x 2 articles + the Italian one
    expect(locs.length).toBe(26);
    expect(locs).toContain("https://aim-journal.com/guides/it/calcolo-massimale/");
    expect(locs).not.toContain("https://aim-journal.com/guides/it/");
    expect(locs).not.toContain("https://aim-journal.com/it/");
    expect(new Set(locs).size).toBe(locs.length);
  });
});
