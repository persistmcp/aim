import { defineConfig, devices } from "@playwright/test";

// Runs against /demo* — deterministic, client-side fixture data (see src/app/lib/demo.ts), so
// this suite needs no backend and is safe to run in CI. Scenarios that need a live backend
// (real login token, bad-token ErrorState, phone connector) are out of scope here — see the
// /verify and /manual-qa skills for those.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4183",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // --host 127.0.0.1 explicitly, not the default "localhost": on some CI runners "localhost"
    // resolves to the IPv6 loopback (::1) first, so Vite listens there while Playwright's
    // polling of the literal 127.0.0.1 URL below never connects -- it looks like a slow start
    // (times out) rather than a clear connection-refused error.
    command: "npm run dev -- --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183/demo",
    reuseExistingServer: !process.env.CI,
    // A cold CI runner (no warm esbuild pre-bundle cache, slower disk/CPU than a dev machine)
    // needs meaningfully longer than a local dev-server start.
    timeout: 120_000,
  },
});
