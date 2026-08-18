import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "./api";
import {
  errorKey,
  isConnectivityFailure,
  reportError,
  resetDedupe,
  shouldReport,
} from "./telemetry";

vi.mock("./analytics", () => ({ track: vi.fn(), trackException: vi.fn() }));
const analytics = await import("./analytics");

describe("errorKey", () => {
  it("formats Error instances as name: message", () => {
    expect(errorKey(new TypeError("boom"))).toBe("TypeError: boom");
  });

  it("passes strings through", () => {
    expect(errorKey("plain failure")).toBe("plain failure");
  });

  it("serializes objects and survives circular ones", () => {
    expect(errorKey({ code: 500 })).toBe('{"code":500}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof errorKey(circular)).toBe("string");
  });
});

describe("connectivity failures vs real errors", () => {
  beforeEach(() => {
    resetDedupe();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("classifies a dropped request, not an HTTP failure, as connectivity", () => {
    expect(isConnectivityFailure(new NetworkError("/summary", new TypeError("Load failed")))).toBe(
      true,
    );
    expect(isConnectivityFailure(new ApiError(500, "/summary"))).toBe(false);
  });

  it("counts a dropped request instead of reporting it as an exception", () => {
    reportError(new NetworkError("/summary", new TypeError("Load failed")), { source: "query" });
    expect(analytics.trackException).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith(
      "api_unreachable",
      expect.objectContaining({ source: "query" }),
    );
  });

  it("reports one outage once, however many queries it takes down", () => {
    reportError(new NetworkError("/summary", new TypeError("Load failed")), { source: "query" });
    reportError(new NetworkError("/sessions", new TypeError("Load failed")), { source: "query" });
    reportError(new NetworkError("/goals", new TypeError("Load failed")), { source: "query" });
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith(
      "api_unreachable",
      expect.objectContaining({ path: "/summary" }),
    );
  });

  it("still reports a backend that answered badly as an exception", () => {
    const error = new ApiError(500, "/summary");
    reportError(error, { source: "query" });
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.trackException).toHaveBeenCalledWith(error, { source: "query" });
  });
});

describe("shouldReport", () => {
  beforeEach(resetDedupe);

  it("reports the first occurrence and suppresses repeats inside the window", () => {
    expect(shouldReport("k", 1_000)).toBe(true);
    expect(shouldReport("k", 2_000)).toBe(false);
  });

  it("reports again after the window elapses", () => {
    expect(shouldReport("k", 1_000)).toBe(true);
    expect(shouldReport("k", 1_000 + 30_001)).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(shouldReport("a", 1_000)).toBe(true);
    expect(shouldReport("b", 1_000)).toBe(true);
  });
});
