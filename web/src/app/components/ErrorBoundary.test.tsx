import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppErrorBoundary, RouteError } from "./ErrorBoundary";

vi.mock("../lib/telemetry", () => ({ reportError: vi.fn() }));

import { reportError } from "../lib/telemetry";

function Bomb(): never {
  throw new Error("boom");
}

afterEach(() => {
  vi.mocked(reportError).mockClear();
});

describe("AppErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <div>fine</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  // F-ERRORBOUNDARY-1
  it("catches a render crash from a child and shows a retry screen instead of a blank page", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    // ErrorState's role=alert markup, not the thrown error propagating and blanking the test.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("reports the crash centrally via reportError (never swallows it silently)", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "error-boundary" }),
    );
    consoleSpy.mockRestore();
  });
});

describe("RouteError", () => {
  // F-ERRORBOUNDARY-2
  it("catches a loader/render error inside a route and reports it via reportError({source: 'route'})", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [{ path: "/", element: <Bomb />, errorElement: <RouteError /> }],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(expect.anything(), { source: "route" });
    consoleSpy.mockRestore();
  });
});
