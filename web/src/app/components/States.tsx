import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center py-16 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label ?? t("states.loading")}</span>
      <div
        className="w-6 h-6 rounded-full border-2 border-muted border-t-accent animate-spin"
        aria-hidden
      />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16 px-4">
      <p className="text-base">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 px-4" role="alert">
      <p className="text-base">{t("states.errorTitle")}</p>
      <p className="text-sm text-muted-foreground mt-1">{t("states.errorHint")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("states.retry")}
        </button>
      )}
    </div>
  );
}

/** Render helper: shows loading/error/empty, else the children with data. */
export function Query<T>({
  q,
  children,
  empty,
}: {
  q: { isLoading: boolean; isError: boolean; data: T | undefined; refetch: () => void };
  children: (data: T) => ReactNode;
  empty?: { title: string; hint?: string; when?: (d: T) => boolean };
}) {
  if (q.isLoading) return <Loading />;
  if (q.isError || q.data === undefined) return <ErrorState onRetry={q.refetch} />;
  if (empty?.when && empty.when(q.data))
    return <EmptyState title={empty.title} hint={empty.hint} />;
  return <>{children(q.data)}</>;
}
