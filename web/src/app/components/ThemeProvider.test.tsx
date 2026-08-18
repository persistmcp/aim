import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";

// jsdom doesn't implement matchMedia; next-themes checks it even with enableSystem={false}.
// Polyfilled locally (not in the shared vitest.setup.ts) since only this component touches it.
beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

// The "system" -> dark migration guard runs as top-level (module-eval) code, before the
// component even mounts, so it can only be exercised by re-importing the module fresh with
// localStorage seeded beforehand.
describe("ThemeProvider module-eval migration guard", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // F-THEME-1
  it("removes a stored 'system' theme so next-themes falls back to the dark default", async () => {
    localStorage.setItem("theme", "system");
    vi.resetModules();
    await import("./ThemeProvider");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("leaves a non-system stored theme (e.g. light) untouched", async () => {
    localStorage.setItem("theme", "light");
    vi.resetModules();
    await import("./ThemeProvider");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("does nothing when no theme is stored", async () => {
    vi.resetModules();
    await import("./ThemeProvider");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  // F-THEME-2
  it("does not throw at import time when localStorage access throws (private browsing)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.resetModules();
    await expect(import("./ThemeProvider")).resolves.toBeDefined();
  });
});
