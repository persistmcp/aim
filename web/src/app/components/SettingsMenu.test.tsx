import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsMenu } from "./SettingsMenu";
import i18n, { SUPPORTED_LANGUAGES } from "../i18n";
import { ApiError } from "../lib/api";

vi.mock("next-themes", () => ({ useTheme: vi.fn() }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/installPrompt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/installPrompt")>()),
  canPromptInstall: vi.fn(() => false),
  isIOS: vi.fn(() => false),
  isStandalone: vi.fn(() => false),
  promptInstall: vi.fn(),
  subscribeInstallAvailability: vi.fn(() => () => {}),
}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  apiPost: vi.fn(),
}));
vi.mock("../lib/demo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/demo")>()),
  isDemo: vi.fn().mockReturnValue(false),
}));

import { useTheme } from "next-themes";
import { apiPost } from "../lib/api";
import { isDemo } from "../lib/demo";
import { canPromptInstall, isIOS, isStandalone, promptInstall } from "../lib/installPrompt";

// Radix's dropdown menu reaches for pointer-capture / scroll APIs jsdom doesn't implement.
// Polyfilling here (not in the shared vitest.setup.ts) keeps the workaround scoped to the one
// component that actually exercises Radix's interactive menu in tests.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  vi.clearAllMocks();
  if (i18n.resolvedLanguage !== "en") await i18n.changeLanguage("en");
});

async function openMenu() {
  const user = userEvent.setup();
  render(<SettingsMenu />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  return user;
}

describe("SettingsMenu", () => {
  it("shows the language and theme radio groups with the current selections checked", async () => {
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
    await openMenu();

    // English + Dark are the live defaults in this test environment (test runner locale, and
    // ThemeProvider's dark default surfaced here via the mocked useTheme()).
    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Русский" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("lists every supported language", async () => {
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
    await openMenu();
    // Driven by SUPPORTED_LANGUAGES rather than a hardcoded list, so adding a locale does not
    // need this test edited — it just has to pass.
    for (const { label } of SUPPORTED_LANGUAGES) {
      expect(screen.getByRole("menuitemradio", { name: label })).toBeInTheDocument();
    }
  });

  // F-SETTINGS-1
  it("calls setTheme with the selected value when a theme option is picked", async () => {
    const setTheme = vi.fn();
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme } as any);
    const user = await openMenu();
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  // F-SETTINGS-2
  it("switches the live language via the real i18n instance, reflected in rendered UI text", async () => {
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
    const user = await openMenu();
    await user.click(screen.getByRole("menuitemradio", { name: "Español" }));
    expect(i18n.resolvedLanguage).toBe("es");
    // The trigger's aria-label is itself a translated string (settings.title) — its new value
    // proves the change took effect, not just that changeLanguage was called.
    expect(await screen.findByRole("button", { name: "Ajustes" })).toBeInTheDocument();
  });

  describe("install entry", () => {
    it("is absent when the environment offers no install path (no event, not iOS)", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      await openMenu();
      expect(screen.queryByRole("menuitem", { name: "Install the app" })).not.toBeInTheDocument();
    });

    it("runs the captured install prompt when Chromium offered one", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      vi.mocked(canPromptInstall).mockReturnValue(true);
      vi.mocked(promptInstall).mockResolvedValue("accepted");
      const user = await openMenu();
      await user.click(screen.getByRole("menuitem", { name: "Install the app" }));
      expect(promptInstall).toHaveBeenCalledTimes(1);
    });

    it("stays hidden when already running standalone even if promptable", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      vi.mocked(canPromptInstall).mockReturnValue(true);
      vi.mocked(isStandalone).mockReturnValue(true);
      await openMenu();
      expect(screen.queryByRole("menuitem", { name: "Install the app" })).not.toBeInTheDocument();
    });

    it("explains the share-sheet route in a dialog on iOS instead of prompting", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      // clearAllMocks keeps implementations set by earlier tests — pin all three probes.
      vi.mocked(canPromptInstall).mockReturnValue(false);
      vi.mocked(isStandalone).mockReturnValue(false);
      vi.mocked(isIOS).mockReturnValue(true);
      const user = await openMenu();
      await user.click(screen.getByRole("menuitem", { name: "Install the app" }));
      expect(promptInstall).not.toHaveBeenCalled();
      expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    });
  });

  describe("token rotation", () => {
    // F-SETTINGS-3
    it("opens a confirm dialog before rotating, without calling the API yet", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      const user = await openMenu();
      await user.click(screen.getByText("Reissue link"));
      expect(screen.getByText("Reissue your link?")).toBeInTheDocument();
      expect(apiPost).not.toHaveBeenCalled();
    });

    // F-SETTINGS-4
    it("rotates on confirm and shows the check-your-inbox takeover", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      vi.mocked(apiPost).mockResolvedValue({ ok: true });
      const user = await openMenu();
      await user.click(screen.getByText("Reissue link"));
      await user.click(screen.getByRole("button", { name: "Reissue" }));

      expect(apiPost).toHaveBeenCalledWith("/rotate-token", { lang: "en" });
      expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    });

    // F-SETTINGS-5
    it("shows a no-email message on a 409 without the success takeover", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      vi.mocked(apiPost).mockRejectedValue(new ApiError(409, "/rotate-token"));
      const user = await openMenu();
      await user.click(screen.getByText("Reissue link"));
      await user.click(screen.getByRole("button", { name: "Reissue" }));

      await waitFor(() => expect(screen.getByText(/no email is on file/)).toBeInTheDocument());
      expect(screen.queryByText("Check your inbox")).not.toBeInTheDocument();
    });

    // Regression (2026-07-25): the item rendered in demo mode — a write path with no backend
    // to write to, which just failed with a red error when tapped.
    it("is hidden entirely in demo mode", async () => {
      vi.mocked(useTheme).mockReturnValue({ theme: "dark", setTheme: vi.fn() } as any);
      vi.mocked(isDemo).mockReturnValue(true);
      await openMenu();
      expect(screen.queryByText("Reissue link")).not.toBeInTheDocument();
      vi.mocked(isDemo).mockReturnValue(false);
    });
  });
});
