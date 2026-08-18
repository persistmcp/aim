import { describe, expect, it } from "vitest";
import { LANGS } from "../../../shared/languages.mjs";
import { scrubDeep, scrubToken } from "./analytics";

const TOKEN = "ExampleTokenNotARealUser12345678";

describe("scrubToken", () => {
  it("replaces the token everywhere in a URL", () => {
    expect(scrubToken(`https://app.dev/${TOKEN}/history`, TOKEN)).toBe(
      "https://app.dev/:token/history",
    );
  });

  it("replaces repeated occurrences", () => {
    expect(scrubToken(`${TOKEN} and ${TOKEN}`, TOKEN)).toBe(":token and :token");
  });

  it("leaves demo tokens readable (not a credential)", () => {
    expect(scrubToken("https://app.dev/demo/history", "demo")).toBe("https://app.dev/demo/history");
  });

  it("is a no-op without a token", () => {
    expect(scrubToken("https://app.dev/", "")).toBe("https://app.dev/");
  });
});

describe("scrubDeep", () => {
  it("scrubs nested objects and arrays", () => {
    const event = {
      $current_url: `https://app.dev/${TOKEN}/progress`,
      $set: { paths: [`/${TOKEN}/history`, "/plain"] },
      count: 3,
      nested: { $referrer: `https://app.dev/${TOKEN}` },
    };
    expect(scrubDeep(event, TOKEN)).toEqual({
      $current_url: "https://app.dev/:token/progress",
      $set: { paths: ["/:token/history", "/plain"] },
      count: 3,
      nested: { $referrer: "https://app.dev/:token" },
    });
  });

  it("never lets the token through", () => {
    const scrubbed = JSON.stringify(
      scrubDeep({ a: [`x${TOKEN}y`, { b: TOKEN }], c: TOKEN }, TOKEN),
    );
    expect(scrubbed).not.toContain(TOKEN);
  });
});

describe("token-shaped scrubbing (stale tokens from persisted props)", () => {
  it("scrubs a token-shaped path segment even when it is not the current token", () => {
    const stale = "AAAAABBBBBCCCCCDDDDDEEEEEFFFFF12";
    expect(scrubToken(`https://app.dev/${stale}/history`, TOKEN)).toBe(
      "https://app.dev/:token/history",
    );
  });

  it("scrubs pathname-style strings inside JSON via scrubDeep", () => {
    const stale = "AAAAABBBBBCCCCCDDDDDEEEEEFFFFF12";
    const out = scrubDeep({ $initial_pathname: `/${stale}/connect` }, TOKEN);
    expect(out).toEqual({ $initial_pathname: "/:token/connect" });
  });

  it("does not scrub short segments like /demo or normal routes", () => {
    expect(scrubToken("https://app.dev/demo/history", TOKEN)).toBe("https://app.dev/demo/history");
    expect(scrubToken("https://app.dev/history", TOKEN)).toBe("https://app.dev/history");
  });

  it("returns the same object reference when nothing matches (fast path)", () => {
    const obj = { a: "/plain", n: 1 };
    expect(scrubDeep(obj, TOKEN)).toBe(obj);
  });
});

describe("scrubToken on localized landing paths", () => {
  // /ru/ makes getToken() return "ru"; splitting on it turned "true" into "t:tokene" and broke
  // before_send with a JSON.parse SyntaxError, dropping every event from localized landings.
  it("does not split on a language-code pseudo-token", () => {
    expect(scrubToken('{"enabled":true}', "ru")).toBe('{"enabled":true}');
    expect(scrubToken('{"pt":"treinos"}', "pt")).toBe('{"pt":"treinos"}');
  });

  it("scrubDeep survives a language-code pseudo-token", () => {
    const event = { enabled: true, current_url: "https://app.dev/ru/" };
    expect(scrubDeep(event, "ru")).toEqual(event);
  });
});

// Guide URLs are /guides/<locale>/<slug>/. A real referrer was recorded as
// https://aim-journal.com/guides/:token/ai-personal-trainer/ — the locale had been split out of
// it as if it were the token, which makes every guide visit locale-blind. Both directions are
// pinned here: the locale survives, the token never does.
describe("guide URLs keep their locale segment", () => {
  const guide = (l: string) => `https://aim-journal.com/guides/${l}/ai-personal-trainer/`;

  it("keeps the locale when it is the pseudo-token (a localized landing was the referrer)", () => {
    for (const lang of LANGS) expect(scrubToken(guide(lang), lang)).toBe(guide(lang));
  });

  it("keeps the locale while a real token is being scrubbed", () => {
    for (const lang of LANGS) expect(scrubToken(guide(lang), TOKEN)).toBe(guide(lang));
  });

  it("keeps the locale in pathname-shaped properties", () => {
    expect(scrubDeep({ $pathname: "/guides/en/progressive-overload/" }, "en")).toEqual({
      $pathname: "/guides/en/progressive-overload/",
    });
  });

  it("still scrubs a token that appears in the same string as a locale", () => {
    const out = scrubToken(`${guide("fr")}?from=${TOKEN}`, TOKEN);
    expect(out).toBe(`${guide("fr")}?from=:token`);
  });

  it("still scrubs a token-shaped first segment on a localized path", () => {
    expect(scrubToken(`https://app.dev/${TOKEN}/ru/connect`, "")).toBe(
      "https://app.dev/:token/ru/connect",
    );
  });
});
