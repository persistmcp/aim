import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
// Imported for its side effect: the beforeinstallprompt listener must exist before the browser
// fires the event (often before React mounts), or the in-app install offer can never work.
import "./app/lib/installPrompt";
import { initManifestLink } from "./app/lib/manifestLink";
import { initAnalytics } from "./app/lib/analytics";
import { initTelemetry, reportError } from "./app/lib/telemetry";
import "./app/i18n";
import "./styles/index.css";

initAnalytics();
initTelemetry();
initManifestLink();

// Keep installed PWAs current. An installed app can stay open for days without ever re-checking for
// a new build, so we poll: on launch, whenever it regains focus, and hourly. With registerType
// 'autoUpdate' the page reloads itself once the new worker activates — no reinstall needed.
registerSW({
  immediate: true,
  onRegisterError(error) {
    // A broken SW registration silently degrades the PWA (no offline, no auto-update).
    reportError(error, { source: "sw-register" });
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => registration.update().catch(() => {});
    setInterval(checkForUpdate, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
