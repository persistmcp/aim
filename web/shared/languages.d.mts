// Types for shared/languages.mjs. The module itself is plain ESM so Node build scripts, the Vite
// config and the guides template can all read it without a build step; this declaration is what
// lets TypeScript consumers (vite.config.ts, the i18n parity test) import it under
// moduleResolution: bundler with allowJs off.

export type LanguageCode = "en" | "pt" | "ru" | "es" | "fr";
/** A language with static guide pages but no app locale. See GUIDE_ONLY_LANGS in languages.mjs. */
export type GuideOnlyLanguageCode = "it";
export type GuideLanguageCode = LanguageCode | GuideOnlyLanguageCode;

export declare const LANGS: readonly LanguageCode[];
export declare const GUIDE_ONLY_LANGS: readonly GuideOnlyLanguageCode[];
export declare const GUIDE_LANGS: readonly GuideLanguageCode[];
export declare const LANG_LABELS: Record<GuideLanguageCode, string>;
export declare const OG_LOCALE: Record<GuideLanguageCode, string>;
export declare const landingPath: (l: LanguageCode | string) => string;
export declare const isLang: (s: string) => boolean;
export declare const isGuideOnlyLang: (s: string | undefined) => boolean;
