// Tests for the inline analytics snippet the static guide pages carry (web/guides/analytics.mjs).
//
// It lives in src/ rather than next to the module because tsconfig.app.json only covers src/ and
// e2e/ — same arrangement as src/app/i18n/catalogs.test.ts, which reaches into shared/ so the
// build-time ESM is typechecked by the app project.
//
// The snippet is a string of JavaScript rendered into HTML, so the only way to test it honestly
// is to execute it: each case evaluates the real emitted code in jsdom with sendBeacon stubbed
// and asserts on what would have been sent to PostHog.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POSTHOG_KEY, personStorageKey } from "../../../shared/analytics.mjs";
import { analyticsScript } from "../../../guides/analytics.mjs";

type Sent = { url: string; body: any };

const cleanups: Array<() => void> = [];
let sent: Sent[] = [];

function scriptBody(html: string): string {
  const match = /^<script>([\s\S]*)<\/script>$/.exec(html);
  if (!match) throw new Error("analyticsScript() did not return a single <script> element");
  return match[1];
}

/** Execute the emitted snippet, tracking the listeners it installs so tests stay isolated. */
function run(page: Parameters<typeof analyticsScript>[0]) {
  const code = scriptBody(analyticsScript(page));
  const added: Array<[string, any, any]> = [];
  const original = document.addEventListener.bind(document);
  document.addEventListener = ((t: string, h: any, o: any) => {
    added.push([t, h, o]);
    original(t, h, o);
  }) as typeof document.addEventListener;
  try {
    new Function(code)();
  } finally {
    document.addEventListener = original;
    cleanups.push(() => added.forEach(([t, h, o]) => document.removeEventListener(t, h, o)));
  }
}

function define(target: object, prop: string, value: unknown) {
  const had = Object.getOwnPropertyDescriptor(target, prop);
  Object.defineProperty(target, prop, { value, configurable: true, writable: true });
  cleanups.push(() => {
    if (had) Object.defineProperty(target, prop, had);
    else delete (target as any)[prop];
  });
}

beforeEach(() => {
  sent = [];
  localStorage.clear();
  document.body.innerHTML = "";
  // jsdom cannot navigate; without this every anchor click logs a "Not implemented" error.
  const stopNavigation = (e: Event) => e.preventDefault();
  document.addEventListener("click", stopNavigation);
  cleanups.push(() => document.removeEventListener("click", stopNavigation));
  define(navigator, "sendBeacon", (url: string, blob: Blob) => {
    // Blob.text() is async and the snippet is sync; the payload is captured verbatim here and
    // decoded by the assertions.
    sent.push({ url, body: blob });
    return true;
  });
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

// jsdom's Blob has no text(); FileReader is the portable reader here.
function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function events() {
  return Promise.all(
    sent.map(async (s) => ({ url: s.url, ...JSON.parse(await blobText(s.body as Blob)) })),
  );
}

describe("guide analytics snippet", () => {
  it("fires one $pageview carrying the slug, the locale and the page type", async () => {
    run({ lang: "pt", pageType: "guide", slug: "progressive-overload" });

    const [ev, ...rest] = await events();
    expect(rest).toHaveLength(0);
    expect(ev.url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(ev.api_key).toBe(POSTHOG_KEY);
    expect(ev.event).toBe("$pageview");
    expect(ev.distinct_id).toBeTruthy();
    expect(ev.properties.guide_slug).toBe("progressive-overload");
    expect(ev.properties.locale).toBe("pt");
    expect(ev.properties.page_type).toBe("guide");
    expect(ev.properties.$current_url).toBe(location.href);
    expect(ev.properties.$pathname).toBe(location.pathname);
    expect(ev.properties.$lib).toBe("aim-guides");
  });

  it("omits the slug on the hub, which has none", async () => {
    run({ lang: "en", pageType: "guide_hub" });
    const [ev] = await events();
    expect(ev.properties.page_type).toBe("guide_hub");
    expect(ev.properties).not.toHaveProperty("guide_slug");
  });

  it("reports a click on a landing link as guide_cta_clicked", async () => {
    document.body.innerHTML =
      '<div class="cta"><a class="btn" href="/pt/" data-cta="article"><b>go</b></a></div>';
    run({ lang: "pt", pageType: "guide", slug: "best-workout-split" });
    // Click the nested element: the handler must walk up to the anchor.
    document
      .querySelector("b")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const all = await events();
    const clicks = all.filter((e) => e.event === "guide_cta_clicked");
    expect(clicks).toHaveLength(1);
    expect(clicks[0].properties.cta).toBe("article");
    expect(clicks[0].properties.cta_href).toBe("/pt/");
    expect(clicks[0].properties.guide_slug).toBe("best-workout-split");
    expect(clicks[0].properties.locale).toBe("pt");
    expect(clicks[0].distinct_id).toBe(all[0].distinct_id);
  });

  it("ignores clicks on links that do not leave for the landing", async () => {
    document.body.innerHTML = '<a href="/guides/en/one-rep-max-calculator/">next guide</a>';
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });
    document
      .querySelector("a")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect((await events()).filter((e) => e.event === "guide_cta_clicked")).toHaveLength(0);
  });

  it("reuses the SPA's person id so guide → app is one person", async () => {
    localStorage.setItem(
      personStorageKey(),
      JSON.stringify({ distinct_id: "person-from-the-app", $device_id: "person-from-the-app" }),
    );
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });

    const [ev] = await events();
    expect(ev.distinct_id).toBe("person-from-the-app");
  });

  it("persists a new person id in posthog-js's own storage shape", async () => {
    run({ lang: "en", pageType: "privacy" });

    const [ev] = await events();
    const stored = JSON.parse(localStorage.getItem(personStorageKey())!);
    expect(stored.distinct_id).toBe(ev.distinct_id);
    expect(stored.$device_id).toBe(ev.distinct_id);
    expect(document.cookie).toContain(personStorageKey());
  });

  it("scrubs a token out of the referrer", async () => {
    const token = "ExampleTokenNotARealUser12345678";
    define(document, "referrer", `https://aim-journal.com/${token}/connect`);
    run({ lang: "en", pageType: "guide", slug: "connect-workout-tracker-mcp" });

    const [ev] = await events();
    expect(ev.properties.$referrer).toBe("https://aim-journal.com/:token/connect");
    expect(JSON.stringify(ev)).not.toContain(token);
  });

  it("keeps the locale of a guide referrer", async () => {
    define(document, "referrer", "https://aim-journal.com/guides/es/ai-personal-trainer/");
    run({ lang: "es", pageType: "guide", slug: "progressive-overload" });

    const [ev] = await events();
    expect(ev.properties.$referrer).toBe("https://aim-journal.com/guides/es/ai-personal-trainer/");
    expect(ev.properties.$referring_domain).toBe("aim-journal.com");
  });

  it("sends nothing when Do Not Track is on", async () => {
    define(navigator, "doNotTrack", "1");
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for Global Privacy Control", async () => {
    define(navigator, "globalPrivacyControl", true);
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for crawlers", async () => {
    define(navigator, "userAgent", "Mozilla/5.0 (compatible; Googlebot/2.1)");
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });
    expect(sent).toHaveLength(0);
  });

  it("does not install a click handler when it opts out", async () => {
    document.body.innerHTML = '<a href="/" data-cta="article">go</a>';
    define(navigator, "webdriver", true);
    run({ lang: "en", pageType: "guide", slug: "progressive-overload" });
    document
      .querySelector("a")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(sent).toHaveLength(0);
  });
});
