import { describe, expect, it } from "vitest";

import { LANGS, landingPath as sharedLandingPath } from "../../../shared/languages.mjs";

// Languages we ship, read from the shared build-side module so the app and the static-page
// pipeline can never disagree about the list. SUPPORTED_LANGUAGES in ./index stays the typed TS
// source (it carries labels and gives LanguageCode its literal union); the parity test at the
// bottom of this file keeps the two in step. ./index is not imported here — that would boot the
// i18n runtime and its language detector in a non-DOM env.
const langs = [...LANGS];

// Load every catalog the same way the app does. Guards against a translation drifting out of sync:
// each namespace must expose the same set of keys in every language (ignoring language-specific
// plural suffixes like Russian's _few/_many), so no screen can fall back to a raw key at runtime.
const catalogs = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", {
  eager: true,
});

const PLURAL = /_(zero|one|two|few|many|other)$/;
const flatBaseKeys = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object"
      ? flatBaseKeys(v as Record<string, unknown>, key)
      : [key.replace(PLURAL, "")];
  });

// { ns: { lng: Set<baseKey> } }
const byNs: Record<string, Record<string, Set<string>>> = {};
for (const [path, mod] of Object.entries(catalogs)) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (byNs[ns] ??= {})[lng] = new Set(flatBaseKeys(mod.default));
}

describe("i18n catalog parity", () => {
  it("defines every namespace in all supported languages", () => {
    for (const [ns, byLng] of Object.entries(byNs)) {
      expect(Object.keys(byLng).sort(), `namespace "${ns}"`).toEqual([...langs].sort());
    }
  });

  it.each(Object.keys(byNs))("namespace '%s' has matching keys across languages", (ns) => {
    const ref = byNs[ns].ru;
    expect(ref, `"${ns}" must have a Russian (source) catalog`).toBeTruthy();
    for (const lng of langs) {
      if (lng === "ru") continue;
      const keys = byNs[ns][lng] ?? new Set();
      const missing = [...ref].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !ref.has(k));
      expect({ ns, lng, missing, extra }).toEqual({ ns, lng, missing: [], extra: [] });
    }
  });
});

// The build scripts (vite.config.ts, scripts/build-guides.mjs, guides/template.mjs) read
// shared/languages.mjs; the app reads SUPPORTED_LANGUAGES. If the two drift, the site emits
// hreflang for a language the app cannot switch to — or ships a landing nobody links to.
describe("language list parity between the app and the build", () => {
  it("SUPPORTED_LANGUAGES matches shared/languages.mjs, order included", async () => {
    const { SUPPORTED_LANGUAGES, landingPath } = await import("./index");
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual([...LANGS]);
    for (const code of LANGS) expect(landingPath(code)).toBe(sharedLandingPath(code));
  });
});
