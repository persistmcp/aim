import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallBanner } from "./InstallBanner";
import {
  INSTALL_DISMISSED_STORAGE_KEY,
  canPromptInstall,
  isIOS,
  isStandalone,
  promptInstall,
} from "../lib/installPrompt";
import { track } from "../lib/analytics";

vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

// Keep the real snooze persistence (dismissInstall/isInstallDismissed run against real
// localStorage) and stub only the environment probes: whether Chrome offered the event, whether
// we're iOS, whether we're already installed.
vi.mock("../lib/installPrompt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/installPrompt")>();
  return {
    ...actual,
    canPromptInstall: vi.fn(() => false),
    isIOS: vi.fn(() => false),
    isStandalone: vi.fn(() => false),
    promptInstall: vi.fn(),
    subscribeInstallAvailability: vi.fn(() => () => {}),
  };
});

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(canPromptInstall).mockReturnValue(false);
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
  });

  it("renders nothing when the browser never offered install (no event, not iOS)", () => {
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the install offer with a working button when beforeinstallprompt was captured", async () => {
    vi.mocked(canPromptInstall).mockReturnValue(true);
    vi.mocked(promptInstall).mockResolvedValue("accepted");
    const user = userEvent.setup();
    render(<InstallBanner />);
    expect(screen.getByText("Install the app")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(promptInstall).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("install_prompt_result", { outcome: "accepted" });
    // An accepted install removes the offer immediately.
    expect(screen.queryByText("Install the app")).not.toBeInTheDocument();
  });

  it("renders nothing when already running standalone", () => {
    vi.mocked(canPromptInstall).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows share-sheet instructions instead of a button on iOS (no beforeinstallprompt there)", () => {
    vi.mocked(isIOS).mockReturnValue(true);
    render(<InstallBanner />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("dismissing hides the banner and snoozes it for later visits", async () => {
    vi.mocked(canPromptInstall).mockReturnValue(true);
    const user = userEvent.setup();
    const { container } = render(<InstallBanner />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY)).not.toBeNull();

    // A fresh mount within the snooze window stays hidden.
    const second = render(<InstallBanner />);
    expect(second.container).toBeEmptyDOMElement();
  });
});
