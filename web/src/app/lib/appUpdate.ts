// Re-check the deployed build on demand (pull-to-refresh). main.tsx already wires registerType
// 'autoUpdate': once a newly-fetched worker activates, it reloads the page itself — reload keeps
// the current URL, so the personal /{token}/ link (and the ws_token in localStorage) is
// untouched. This pokes the existing registration to fetch+install a new worker right now
// instead of waiting for the hourly/focus poll, and REPORTS whether a new build was actually
// found — installing the new worker means downloading the whole precache, which takes long
// enough on mobile that the UI must say "updating" rather than go quiet and reload "randomly"
// seconds later (the exact confusion the owner hit on 2026-08-02).
export async function checkForAppUpdate(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false; // dev server / unsupported browser
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.update();
    // update() resolves once the check is done; a worker in `installing`/`waiting` at that
    // point means a new build is on its way to activation (skipWaiting) and a self-reload.
    return Boolean(registration.installing || registration.waiting);
  } catch {
    // Offline or no registration yet — the data refresh already happened, the build can wait.
    return false;
  }
}
