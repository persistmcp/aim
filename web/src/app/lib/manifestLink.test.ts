import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initManifestLink } from "./manifestLink";
import { isIOS } from "./installPrompt";

vi.mock("./installPrompt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./installPrompt")>()),
  isIOS: vi.fn(() => false),
}));

const TOKEN = "ExampleTokenNotARealUser12345678";

function manifestLink(): HTMLLinkElement | null {
  return document.querySelector('link[rel="manifest"]');
}

beforeEach(() => {
  vi.mocked(isIOS).mockReturnValue(false);
});

afterEach(() => {
  document.head.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  window.history.pushState({}, "", "/");
});

describe("initManifestLink", () => {
  // The built index.html carries no manifest link (stripped at build) — these tests mirror that.
  it("attaches the token-scoped backend manifest on token pages (non-iOS)", () => {
    window.history.pushState({}, "", `/${TOKEN}/app`);
    initManifestLink();
    expect(manifestLink()?.getAttribute("href")).toBe(`/${TOKEN}/api/manifest`);
  });

  it("attaches the static manifest on the landing and non-token paths like /demo (non-iOS)", () => {
    for (const path of ["/", "/demo", "/guides/ru/"]) {
      window.history.pushState({}, "", path);
      initManifestLink();
      expect(manifestLink()?.getAttribute("href")).toBe("/manifest.webmanifest");
    }
  });

  it("never attaches a manifest on iOS — Add to Home Screen must use the full page URL", () => {
    vi.mocked(isIOS).mockReturnValue(true);
    for (const path of [`/${TOKEN}/app`, "/", "/demo"]) {
      window.history.pushState({}, "", path);
      initManifestLink();
      expect(manifestLink()).toBeNull();
    }
  });

  it("reuses an existing link instead of stacking duplicates when called twice", () => {
    window.history.pushState({}, "", `/${TOKEN}/app`);
    initManifestLink();
    initManifestLink();
    expect(document.querySelectorAll('link[rel="manifest"]').length).toBe(1);
  });
});
