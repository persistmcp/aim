import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate } from "./appUpdate";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkForAppUpdate", () => {
  it("reports no update without service worker support", async () => {
    vi.stubGlobal("navigator", {});
    await expect(checkForAppUpdate()).resolves.toBe(false);
  });

  it("reports no update without a registration (dev server)", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: () => Promise.resolve(undefined) },
    });
    await expect(checkForAppUpdate()).resolves.toBe(false);
  });

  it("calls update() and reports no update when no new worker appeared", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: () => Promise.resolve({ update, installing: null, waiting: null }),
      },
    });
    await expect(checkForAppUpdate()).resolves.toBe(false);
    expect(update).toHaveBeenCalledOnce();
  });

  it.each(["installing", "waiting"] as const)(
    "reports an update when a new worker is %s after the check",
    async (phase) => {
      const registration: Record<string, unknown> = {
        update: vi.fn().mockResolvedValue(undefined),
        installing: null,
        waiting: null,
      };
      registration[phase] = {}; // a ServiceWorker stand-in
      vi.stubGlobal("navigator", {
        serviceWorker: { getRegistration: () => Promise.resolve(registration) },
      });
      await expect(checkForAppUpdate()).resolves.toBe(true);
    },
  );

  it("swallows update failures (offline) and reports no update", async () => {
    const update = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: () => Promise.resolve({ update }) },
    });
    await expect(checkForAppUpdate()).resolves.toBe(false);
  });
});
