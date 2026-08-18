import { Download, X } from "lucide-react";
import { useSyncExternalStore, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  canPromptInstall,
  dismissInstall,
  isInstallDismissed,
  isIOS,
  isStandalone,
  promptInstall,
  subscribeInstallAvailability,
} from "../lib/installPrompt";
import { track } from "../lib/analytics";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

/**
 * Visible "install this app" offer for browser visits. Chromium fires beforeinstallprompt and we
 * drive the real install dialog; iOS Safari has no such event, so it gets the share-sheet
 * instructions instead. Hidden when already installed, and a dismissal snoozes it for a month.
 */
export function InstallBanner() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(isInstallDismissed);
  const promptable = useSyncExternalStore(
    subscribeInstallAvailability,
    canPromptInstall,
    () => false,
  );

  if (hidden || isStandalone()) return null;
  const ios = isIOS();
  if (!promptable && !ios) return null;

  const close = () => {
    dismissInstall();
    setHidden(true);
    track("install_banner_dismissed");
  };

  return (
    <Card className="p-4 flex flex-row items-start gap-3">
      <span className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-accent">
        <Download className="w-4 h-4" aria-hidden />
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <h2 className="text-sm font-medium">{t("install.title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ios && !promptable ? t("install.iosHint") : t("install.body")}
          </p>
        </div>
        {promptable && (
          <Button
            size="sm"
            onClick={async () => {
              const outcome = await promptInstall();
              track("install_prompt_result", { outcome });
              if (outcome === "accepted") setHidden(true);
            }}
          >
            {t("install.action")}
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label={t("install.dismiss")}
        className="shrink-0 -m-1 p-2 rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={close}
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </Card>
  );
}
