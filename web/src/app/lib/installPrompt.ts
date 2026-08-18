/**
 * Captures the browser's `beforeinstallprompt` so the app can offer PWA installation with its
 * own visible UI. Chrome's ambient install affordance is just a tiny omnibox icon most people
 * never notice — the event fires once, early (often before React mounts), and installation can
 * only be triggered from a stashed reference to it. This module must therefore be imported from
 * main.tsx so the listener is registered before the event can fire.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Dismissals expire so the offer can come back later, but never nags within a month. */
export const INSTALL_DISMISSED_STORAGE_KEY = "ws_install_dismissed";
const DISMISS_FOR_DAYS = 30;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress Chrome's mini-infobar; we present our own card
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

/** Already running as an installed app (Android/desktop standalone, or iOS homescreen). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari never fires beforeinstallprompt — installation is manual via the share sheet. */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export function isInstallDismissed(): boolean {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY);
    if (!raw) return false;
    const at = new Date(raw).getTime();
    if (Number.isNaN(at)) return false;
    return Date.now() - at < DISMISS_FOR_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, new Date().toISOString());
  } catch {
    // storage unavailable (private mode) — the banner just reappears next visit
  }
}

/** Runs the native install dialog; resolves with the user's verdict. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = deferredPrompt;
  if (!ev) return "unavailable";
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  // The event is single-use: whatever the outcome, a fresh beforeinstallprompt is needed
  // before the dialog can be shown again.
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
  return outcome;
}

/** Notifies when install availability changes (event captured / consumed / app installed). */
export function subscribeInstallAvailability(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
