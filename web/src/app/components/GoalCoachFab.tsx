// Coach-chat entry point for the featured goal card — there is no in-app chat, so any real change
// to a goal (a new target, marking it achieved, switching to maintenance) happens back in the
// conversation with the assistant, never in this app (COACHING_PLAN.md's co-creation principle:
// the app displays, the coach decides — with the user, not for them). An icon button anchored to
// the goal card's own top-right corner (not a page-level FAB) with a tooltip explaining what it
// does; mirrors Connect.tsx's own two states: if the assistant has never been reached, point at
// the Connect screen; once connected, offer a copyable conversation starter instead.
import { Check, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useConnection } from "../lib/queries";
import { useCopyToClipboard } from "../lib/useCopyToClipboard";

export function GoalCoachFab({ prompt }: { prompt: string }) {
  const { t } = useTranslation();
  const { data: connection } = useConnection();
  const { copied, copy } = useCopyToClipboard();
  // Defaults to the disconnected/"connect first" affordance whenever `connection` isn't resolved
  // yet (undefined while useConnection() is loading), not just when it explicitly says
  // `connected: false` — the safer default while status is unknown, since offering a copy action
  // before we actually know the user is connected risks a confusing no-op tap.
  const disconnected = !connection?.connected;
  const label = t(
    disconnected ? "home.featuredGoal.fab.disconnected" : "home.featuredGoal.fab.connected",
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {disconnected ? (
            <Button
              asChild
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 rounded-full"
              aria-label={label}
            >
              <Link to="/connect">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 rounded-full"
              aria-label={label}
              onClick={() => copy(t("home.featuredGoal.discussPrompt", { title: prompt }))}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <MessageCircle className="h-4 w-4" aria-hidden />
              )}
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      {!disconnected && (
        <span className="sr-only" aria-live="polite">
          {copied ? t("home.featuredGoal.copied") : ""}
        </span>
      )}
    </>
  );
}
