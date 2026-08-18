import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// The "system" option was removed (user feedback, 2026-07): a stored "system" choice must fall
// back to the dark default instead of leaving next-themes with an unknown value.
try {
  if (localStorage.getItem("theme") === "system") localStorage.removeItem("theme");
} catch {
  // Storage unavailable (private mode) — nothing stored, nothing to migrate.
}

// Dark-first; light/dark only, persisted manual toggle.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
