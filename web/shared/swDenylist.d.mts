// Types for shared/swDenylist.mjs. Same reasoning as languages.d.mts: the module is plain ESM so
// the Vite config can read it without a build step, and this declaration is what lets TypeScript
// consumers (vite.config.ts, the denylist test) import it under moduleResolution: bundler.

/** Paths the service worker must not answer with the cached app shell. */
export declare const navigateFallbackDenylist: (langs: readonly string[]) => RegExp[];
