import { useEffect, useRef } from "react";
import { History, Home, TrendingUp, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router";
import { identifyUser } from "../lib/analytics";
import { useMe } from "../lib/queries";
import { usePullToRefresh } from "../lib/usePullToRefresh";

const tabs = [
  { path: "/", labelKey: "nav.home", icon: Home },
  { path: "/history", labelKey: "nav.history", icon: History },
  { path: "/progress", labelKey: "nav.progress", icon: TrendingUp },
  { path: "/tools", labelKey: "nav.tools", icon: Wrench },
];

// Routes whose content owns its own back-navigation header — the bottom tab bar (mobile) has
// nothing useful to add there and just eats vertical space.
const DETAIL_PATH_PREFIXES = ["/session/", "/goal-history"];

export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isDetailScreen = DETAIL_PATH_PREFIXES.some((p) => location.pathname.includes(p));
  const mainRef = useRef<HTMLElement>(null);
  // Detail screens (SessionDetail, GoalHistory) render their own sticky back-header inside this
  // pull-to-refresh subtree. While a pull is active, the wrapper below gets a `transform`, and a
  // `transform` on an ancestor changes the containing block for a `position: sticky` descendant
  // per spec — WebKit visibly detaches/jitters the header when that happens. Disabling the pull
  // gesture on these routes sidesteps it entirely instead of chasing the sticky positioning.
  const { pull, refreshing, updating, animating } = usePullToRefresh(mainRef, !isDetailScreen);
  const pulled = pull > 0 || animating;

  // Tie the analytics identity to the backend user id (never the URL token).
  const me = useMe();
  useEffect(() => {
    if (me.data?.id) identifyUser(me.data.id, { name: me.data.name ?? undefined });
  }, [me.data?.id, me.data?.name]);

  // iOS Safari treats the *document* as its own rubber-band scroller even when nothing in it
  // overflows — a stray vertical drag can bounce the whole page by a few px, dragging the fixed
  // tab bar out of sync with where it was tapped (reads as "layout drifted" + "buttons don't
  // work"). Pin the document to the viewport for as long as this app shell is mounted; `main`
  // stays the only real scroller. Landing (no Layout) keeps normal document scroll.
  useEffect(() => {
    const { documentElement, body } = document;
    documentElement.classList.add("h-full", "overflow-hidden");
    body.classList.add("h-full", "overflow-hidden");
    return () => {
      documentElement.classList.remove("h-full", "overflow-hidden");
      body.classList.remove("h-full", "overflow-hidden");
    };
  }, []);

  return (
    <div className="h-dvh bg-background text-foreground flex flex-col lg:flex-row max-w-[390px] lg:max-w-none mx-auto relative">
      {/* Desktop sidebar; the phone keeps the bottom tab bar below */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-border px-3 py-6">
        <span className="text-xl font-medium tracking-tight px-3 mb-8">
          <span className="text-accent">AI</span>m
        </span>
        <nav aria-label={t("nav.aria")} className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const isActive =
              location.pathname === tab.path ||
              (tab.path !== "/" && location.pathname.startsWith(tab.path));
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

      <main
        ref={mainRef}
        className="flex-1 pb-20 lg:pb-8 pt-safe overflow-y-auto overscroll-y-contain"
      >
        <div
          className="relative"
          style={{
            transform: pulled ? `translateY(${pull}px)` : undefined,
            transition: animating ? "transform 0.2s ease-out" : "none",
          }}
        >
          <div
            className="absolute left-0 right-0 flex flex-col items-center gap-1.5 pointer-events-none"
            style={{ top: updating ? -58 : -40, opacity: pull > 4 || refreshing ? 1 : 0 }}
          >
            <div
              className={`h-8 w-8 rounded-full border-2 border-muted border-t-accent ${refreshing ? "animate-spin" : ""}`}
              style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
            />
            {/* A found build downloads its whole precache before the self-reload — say so
                instead of going quiet and reloading "out of nowhere" seconds later. */}
            {updating && (
              <span role="status" className="text-xs text-muted-foreground whitespace-nowrap">
                {t("app.updating")}
              </span>
            )}
          </div>
          <div className="lg:max-w-2xl lg:mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {!isDetailScreen && (
        <nav
          aria-label={t("nav.aria")}
          // z-50 + will-change-transform: force this fixed, backdrop-blurred bar onto its own
          // stable compositing layer. Without it, iOS Safari can stop re-hit-testing the layer
          // after a scroll/gesture on the sibling `main` scroller, so taps land but the button
          // underneath never receives them.
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 max-w-[390px] mx-auto bg-card/95 border-t border-border pb-safe backdrop-blur-lg will-change-transform"
        >
          <div className="grid grid-cols-4 h-16">
            {tabs.map((tab) => {
              const isActive =
                location.pathname === tab.path ||
                (tab.path !== "/" && location.pathname.startsWith(tab.path));
              const Icon = tab.icon;
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-all duration-200 touch-manipulation active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    isActive ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {/* The active tab is bigger, not only tinted — a 4-up bar of same-size labels
                      gives no peripheral cue about where you are, and colour alone fails for
                      colour-blind users. Scale rather than a font-size swap so the row height
                      never changes and nothing below it shifts. */}
                  <Icon
                    className={`h-6 w-6 transition-transform duration-200 motion-reduce:transition-none ${
                      isActive ? "scale-115" : ""
                    }`}
                    strokeWidth={isActive ? 2.5 : 2}
                    aria-hidden
                  />
                  {/* whitespace-nowrap: at 12px "Инструменты" measures 80px in the 80px cell a
                      320px phone gives it — one more character in any locale and the label wrapped
                      to a second row, knocking the icons out of alignment across the whole bar.
                      Below 360px it steps down to 11px so it still fits whole rather than
                      ellipsing; truncate stays as the last resort for a longer translation.
                      The label itself does not scale when active — at this width the extra 5%
                      is what would push it back into the ellipsis. */}
                  <span
                    className={`max-w-full truncate whitespace-nowrap text-[11px] leading-4 min-[360px]:text-xs ${
                      isActive ? "font-medium" : ""
                    }`}
                  >
                    {t(tab.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
