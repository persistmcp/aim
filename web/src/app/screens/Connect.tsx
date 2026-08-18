import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Copy, Link2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { track } from "../lib/analytics";
import { useConnection } from "../lib/queries";
import { getToken } from "../lib/token";
import { useCopyToClipboard } from "../lib/useCopyToClipboard";

// The app is served same-origin in prod; in dev VITE_API_ORIGIN points at the deployed backend.
const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN || window.location.origin;

// Screenshots in web/public/instructions/{client}/, one per numbered guide step. ChatGPT's
// connector flow is real (verified end-to-end 2026-07-25) but noticeably rougher than Claude's:
// a separate Developer Mode toggle, an "elevated risk" warning, and a page reload before the
// plugin shows up — Claude stays the default tab, ChatGPT is opt-in via the switcher.
const STEPS = { claude: [1, 2, 3, 4, 5, 6, 7], chatgpt: [1, 2, 3, 4, 5, 6] } as const;

const DAY = 86_400_000;

// The critical funnel step (pasting the MCP URL into Claude's settings) happens outside the
// product, so the user otherwise gets no confirmation it worked — the blindest spot in
// activation. Polls /api/connection every 5s (see useConnection) until a tool call is seen, then
// stops; fires connection_verified exactly once, on the disconnected→connected transition (not on
// every visit from an already-connected user — that isn't a "verification" event).
function ConnectionStatus() {
  const { t } = useTranslation(["connect", "common"]);
  const { data, isLoading, isError } = useConnection();
  const wasConnected = useRef<boolean | undefined>(undefined);
  const { copied: promptCopied, copy: copyPrompt } = useCopyToClipboard();

  useEffect(() => {
    if (!data) return;
    if (wasConnected.current === false && data.connected) track("connection_verified");
    wasConnected.current = data.connected;
  }, [data]);

  if (isLoading || isError || !data) return null;

  if (data.connected) {
    const days = data.last_call_at
      ? Math.floor((Date.now() - new Date(data.last_call_at).getTime()) / DAY)
      : null;
    const when =
      days == null
        ? null
        : days <= 0
          ? t("common:home.ago.today")
          : days === 1
            ? t("common:home.ago.yesterday")
            : t("common:home.ago.days", { count: days });
    return (
      <Card className="p-4 flex items-center gap-3 border-accent/40 bg-accent/10">
        <CheckCircle2 className="h-5 w-5 text-accent shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">{t("status.connected")}</p>
          {when && (
            <p className="text-xs text-muted-foreground">{t("status.lastActive", { when })}</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-medium">{t("status.waiting")}</p>
      <p className="text-xs text-muted-foreground">{t("status.waitingHint")}</p>
      <div className="flex items-center gap-2">
        <p className="ph-no-capture flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          {t("status.testPrompt")}
        </p>
        <Button onClick={() => copyPrompt(t("status.testPrompt"))} variant="secondary" size="sm">
          {promptCopied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> {t("copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> {t("copy")}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

export function Connect() {
  const { t } = useTranslation("connect");
  const token = getToken();
  const mcpUrl = `${ORIGIN}/${token}/mcp`;
  const { copied, copy: copyUrl } = useCopyToClipboard();
  const [client, setClient] = useState<"claude" | "chatgpt">("claude");

  const copy = async () => {
    const ok = await copyUrl(mcpUrl);
    track(ok ? "mcp_url_copied" : "mcp_url_copy_failed");
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <ConnectionStatus />

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-accent">
          <Link2 className="h-4 w-4" aria-hidden />
          <span className="text-sm font-medium">{t("urlLabel")}</span>
        </div>
        {/* ph-no-capture: the URL is a live credential — session replay must never record it. */}
        <p className="ph-no-capture text-sm break-all text-muted-foreground tabular-nums">
          {mcpUrl}
        </p>
        <Button onClick={copy} variant="secondary" className="w-full">
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> {t("copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> {t("copy")}
            </>
          )}
        </Button>
      </Card>

      <Card className="p-4 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">{t("guideTitle")}</h3>
          <Tabs value={client} onValueChange={(v) => setClient(v as "claude" | "chatgpt")}>
            <TabsList>
              <TabsTrigger value="claude">Claude</TabsTrigger>
              <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {client === "claude" && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm leading-relaxed">
            {t("mobileNote")}
          </p>
        )}
        {client === "chatgpt" && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm leading-relaxed">
            {t("chatgptDevModeNote")}
          </p>
        )}
        <ol className="space-y-6">
          {STEPS[client].map((n) => (
            <li key={n} className="space-y-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-accent font-medium">{n}.</span>{" "}
                {t(client === "chatgpt" ? `guideStepChatgpt${n}` : `guideStep${n}`)}
              </p>
              <img
                src={`/instructions/${client}/0${n}.png`}
                alt=""
                loading="lazy"
                className="w-full max-w-md rounded-lg border border-border"
              />
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          {t(client === "chatgpt" ? "guideNoteChatgpt" : "guideNote")}
        </p>
      </Card>

      <p className="text-xs text-muted-foreground">{t("warning")}</p>
    </div>
  );
}
