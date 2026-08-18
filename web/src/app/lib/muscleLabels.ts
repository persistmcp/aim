// Localized muscle names. Split from `muscle.ts` so that file stays pure (no i18n import) and
// node-testable. Reads the live i18n instance, so callers must re-render on language change
// (they use `useTranslation()` already). Falls back to the raw slug for unknown muscles.
import i18n from "../i18n";

export const muscleLabel = (m: string): string => i18n.t(`muscles:label.${m}`, { defaultValue: m });
