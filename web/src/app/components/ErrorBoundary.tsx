import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { useRouteError } from "react-router";
import { reportError } from "../lib/telemetry";
import { ErrorState } from "./States";

/** Last-resort boundary above the router: a render crash shows a retry screen, never a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: "error-boundary", componentStack: info.componentStack });
  }

  render() {
    if (this.state.crashed) {
      // Reload rather than reset state: after a render crash the app state is suspect.
      return (
        <div className="min-h-dvh flex items-center justify-center">
          <ErrorState onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return this.props.children;
  }
}

/** Router-level error element: catches loader/render errors inside routes, keeps the shell alive. */
export function RouteError() {
  const error = useRouteError();
  // Effect, not render body: parent re-renders (theme, i18n) must not re-report the same crash.
  useEffect(() => {
    reportError(error, { source: "route" });
  }, [error]);
  return <ErrorState onRetry={() => window.location.reload()} />;
}
