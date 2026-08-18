// Types for guides/landing.mjs — see shared/languages.d.mts for why these declarations exist.

export declare const SEO_START: string;
export declare const SEO_END: string;

/** The localized SEO portion of the landing <head> for one language, as an HTML string. */
export declare function renderLandingHead(lang: string): string;

/** Splices renderLandingHead(lang) between the SEO markers and swaps <html lang>. */
export declare function withLandingHead(html: string, lang: string): string;
