// Gear menu in the Home header. Holds the language picker (ru/en/es/fr), the theme choice
// (light/dark), and token rotation. Language changes apply instantly and persist via i18next's
// localStorage detector; theme persists via next-themes.
import { Download, KeyRound, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";
import { track } from "../lib/analytics";
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  promptInstall,
  subscribeInstallAvailability,
} from "../lib/installPrompt";
import { ApiError, apiPost } from "../lib/api";
import { isDemo } from "../lib/demo";
import { TOKEN_STORAGE_KEY } from "../lib/token";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { buttonVariants } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type RotateOutcome = "success" | "no_email" | "error";

// Confirm dialog + result live outside the DropdownMenu tree (dropdown closes on item select,
// which would tear the nested dialog down with it) — a boolean `confirmOpen` bridges the two.
// Plain async state rather than react-query's useMutation: this is a one-off fire-and-forget
// action with nothing to cache or invalidate, and SettingsMenu renders unconditionally inside
// Home — pulling in useMutation would make every render require a QueryClientProvider ancestor.
function RotateTokenAction() {
  const { t, i18n } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [outcome, setOutcome] = useState<RotateOutcome | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Demo has no email on file and nothing real to rotate — the same isDemo() gate every other
  // write surface uses (export, set/bodyweight edit). Without it the item renders and just fails.
  if (isDemo()) return null;

  const rotate = async () => {
    setOutcome(null);
    setIsPending(true);
    try {
      await apiPost<{ ok: boolean }>("/rotate-token", { lang: i18n.resolvedLanguage });
      // The token this page is running under no longer resolves — nothing left to keep around.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setOutcome("success");
    } catch (err) {
      setOutcome(err instanceof ApiError && err.status === 409 ? "no_email" : "error");
    } finally {
      setIsPending(false);
    }
  };

  // Portaled straight to <body>: DropdownMenuContent animates with a CSS transform, which would
  // otherwise become the containing block for a `fixed` descendant and break full-viewport cover.
  const successOverlay =
    outcome === "success"
      ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-center">
            <div className="max-w-xs space-y-2">
              <KeyRound className="mx-auto h-6 w-6 text-accent" aria-hidden />
              <h1 className="font-medium">{t("settings.rotateSuccessTitle")}</h1>
              <p className="text-sm text-muted-foreground">{t("settings.rotateSuccessBody")}</p>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {successOverlay}
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <KeyRound aria-hidden /> {t("settings.rotateToken")}
      </DropdownMenuItem>
      {outcome && outcome !== "success" && (
        <p className="px-2 pb-1 text-xs text-destructive">
          {t(outcome === "no_email" ? "settings.rotateNoEmail" : "settings.rotateError")}
        </p>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.rotateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.rotateConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.rotateCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={rotate} disabled={isPending}>
              {t("settings.rotateConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Permanent "install the app" entry — the Home banner is dismissible, and after a month-long
// snooze this menu is the only remaining path to installation. Chromium: runs the captured
// beforeinstallprompt; iOS (no such event ever): explains the share-sheet route in a dialog.
function InstallAction() {
  const { t } = useTranslation();
  const [iosOpen, setIosOpen] = useState(false);
  const promptable = useSyncExternalStore(
    subscribeInstallAvailability,
    canPromptInstall,
    () => false,
  );

  if (isStandalone() || (!promptable && !isIOS())) return null;

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          if (promptable) {
            void promptInstall().then((outcome) =>
              track("install_prompt_result", { outcome, source: "settings" }),
            );
            return;
          }
          // iOS: keep the pattern RotateTokenAction uses — the dropdown closes on select, so the
          // dialog must live outside it, bridged by local state.
          e.preventDefault();
          setIosOpen(true);
        }}
      >
        <Download aria-hidden /> {t("install.title")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <AlertDialog open={iosOpen} onOpenChange={setIosOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("install.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("install.iosHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIosOpen(false)}>
              {t("install.gotIt")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SettingsMenu() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
        aria-label={t("settings.title")}
      >
        <Settings className="w-4 h-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("settings.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={i18n.resolvedLanguage}
          onValueChange={(lng) => i18n.changeLanguage(lng)}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <DropdownMenuRadioItem key={l.code} value={l.code}>
              {l.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("settings.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">{t("settings.themeLight")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t("settings.themeDark")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <InstallAction />
        <RotateTokenAction />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
