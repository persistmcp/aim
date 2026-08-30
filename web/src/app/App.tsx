import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { isGuideOnlyLang } from "../../shared/languages.mjs";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { isSupportedLanguage } from "./i18n";
import { reportError } from "./lib/telemetry";
import { TOKEN_STORAGE_KEY, isLikelyToken } from "./lib/token";
import { router } from "./routes";
import { Landing } from "./screens/Landing";

const queryClient = new QueryClient({
  // Every failed query reports centrally — screens that render fallbacks (e.g. "0 workouts")
  // must not be able to swallow a broken backend silently.
  queryCache: new QueryCache({
    onError: (error, query) => reportError(error, { source: "query", queryKey: query.queryKey }),
  }),
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  const pathToken = window.location.pathname.split("/").filter(Boolean)[0];

  // PWA / bookmarks land on "/" — restore the last token so the app opens straight to the data.
  // The localized landings (/ru/, /es/, /fr/) are prerendered pages served by the same SPA shell,
  // so their language segment must take this branch too. Without the isSupportedLanguage check the
  // segment would be read as a token, the router would mount under basename "/ru" and the visitor
  // would get "Couldn't load data" instead of the landing.
  //
  // Guide-only languages (/it/) have no landing at all, only guide pages — but the segment is still
  // a language, not a token, so it takes the same branch and gets the English landing rather than a
  // broken app shell. It must NOT reach i18n's SUPPORTED_LANGUAGES: the app has no Italian catalog,
  // and the path detector would persist "it" as the saved language.
  if (!pathToken || isSupportedLanguage(pathToken) || isGuideOnlyLang(pathToken)) {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && isLikelyToken(stored)) {
      window.location.replace(`/${stored}`);
      return null;
    }
    // A leftover garbage value (pre-validation builds persisted any path segment, e.g.
    // "robot.txt") would redirect "/" into a dead page forever — drop it instead.
    if (stored) localStorage.removeItem(TOKEN_STORAGE_KEY);
    return <Landing />;
  }
  // Only remember real-looking tokens: /demo and mistyped paths must not overwrite the
  // user's saved token or become the "/" redirect target.
  if (isLikelyToken(pathToken)) localStorage.setItem(TOKEN_STORAGE_KEY, pathToken);

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
