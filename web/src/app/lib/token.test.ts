import { describe, expect, it } from "vitest";
import { isLikelyToken } from "./token";

describe("isLikelyToken", () => {
  it("accepts real generated tokens", () => {
    // secrets.token_urlsafe(24) shape (32 url-safe chars) and token_hex(16) fallback.
    expect(isLikelyToken("ExampleTokenNotARealUser12345678")).toBe(true);
    expect(isLikelyToken("a".repeat(32))).toBe(true);
    expect(isLikelyToken("A1-_" + "x".repeat(28))).toBe(true);
    // Leading -/_ are stripped server-side, so slightly shorter still passes.
    expect(isLikelyToken("x".repeat(30))).toBe(true);
  });

  it("rejects route segments and mistyped file paths", () => {
    // The prod incident: SW/rewrite served the app under these, and the app persisted
    // them as ws_token, sending "/" to a dead page on every later visit.
    expect(isLikelyToken("robot.txt")).toBe(false);
    expect(isLikelyToken("robots.txt")).toBe(false);
    expect(isLikelyToken("sitemap.xml")).toBe(false);
    expect(isLikelyToken("guides")).toBe(false);
    expect(isLikelyToken("privacy")).toBe(false);
    expect(isLikelyToken("demo")).toBe(false);
    expect(isLikelyToken("demo-light")).toBe(false);
    expect(isLikelyToken("")).toBe(false);
    expect(isLikelyToken("has space".padEnd(30, "x"))).toBe(false);
  });
});
