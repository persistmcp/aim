import "@testing-library/jest-dom/vitest";
import "./src/app/i18n";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Not using vitest's `globals: true`, so @testing-library/react's own auto-cleanup (which hooks
// into a global `afterEach`) never registers — without this, DOM from one test leaks into the
// next and `getByRole` queries start throwing "found multiple elements".
afterEach(() => cleanup());

// jsdom implements no ResizeObserver, and recharts' ResponsiveContainer constructs one on mount —
// so any test that rendered a chart threw "ResizeObserver is not defined", and the suites worked
// around it by only ever feeding the charts empty data. That left every chart render path
// untested, which is exactly where a period filter silently dropping its points would hide.
// The stub reports a fixed box: ResponsiveContainer needs a non-zero size to render children.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 400 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 200 });
