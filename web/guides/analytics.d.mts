// Types for guides/analytics.mjs — see shared/languages.d.mts for why these declarations exist.

export declare const CTA_ATTR: string;

export declare function analyticsScript(page: {
  lang: string;
  pageType: "guide" | "guide_hub" | "privacy";
  slug?: string | null;
}): string;
