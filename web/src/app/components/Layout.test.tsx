import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Layout } from "./Layout";

vi.mock("../lib/queries", () => ({ useMe: vi.fn() }));
vi.mock("../lib/analytics", () => ({ identifyUser: vi.fn() }));

// react-router's data-router navigation builds a real `Request` under the hood, which trips over
// a jsdom/Node fetch AbortSignal realm mismatch in this test environment. useNavigate is spied
// (everything else — Outlet, useLocation, the router itself — stays real) so the click-to-navigate
// test doesn't depend on that unrelated plumbing actually completing.
const navigateSpy = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

import { identifyUser } from "../lib/analytics";
import { useMe } from "../lib/queries";

function renderLayout(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Layout />,
        children: [
          { index: true, element: <div>home-content</div> },
          { path: "history/*", element: <div>history-content</div> },
          { path: "progress/*", element: <div>progress-content</div> },
          { path: "tools/*", element: <div>tools-content</div> },
          { path: "session/*", element: <div>session-content</div> },
          { path: "goal-history", element: <div>goal-history-content</div> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("Layout", () => {
  it("renders both the desktop sidebar and mobile bottom nav tab sets", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/");
    // jsdom has no layout engine, so both the `hidden lg:flex` sidebar and the `lg:hidden`
    // bottom bar are present in the DOM at once — assert both copies exist rather than
    // asserting which one is "visible".
    expect(screen.getAllByRole("button", { name: "Home" })).toHaveLength(2);
  });

  // F-LAYOUT-1
  it("marks Home active only on an exact match, not as a prefix of every route", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/history");
    for (const btn of screen.getAllByRole("button", { name: "Home" })) {
      expect(btn).not.toHaveAttribute("aria-current");
    }
    for (const btn of screen.getAllByRole("button", { name: "History" })) {
      expect(btn).toHaveAttribute("aria-current", "page");
    }
  });

  // F-LAYOUT-2
  it("marks a tab active for nested paths via startsWith (e.g. /history/extra)", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/history/extra");
    for (const btn of screen.getAllByRole("button", { name: "History" })) {
      expect(btn).toHaveAttribute("aria-current", "page");
    }
    for (const btn of screen.getAllByRole("button", { name: "Home" })) {
      expect(btn).not.toHaveAttribute("aria-current");
    }
  });

  it("navigates when a tab is clicked", async () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    const user = userEvent.setup();
    renderLayout("/");
    const historyButtons = screen.getAllByRole("button", { name: "History" });
    await user.click(historyButtons[0]);
    expect(navigateSpy).toHaveBeenCalledWith("/history");
  });

  it("hides the mobile bottom nav on a session detail screen but keeps the desktop sidebar", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/session/abc");
    // Only the desktop sidebar's copy should exist once the bottom bar is suppressed.
    expect(screen.getAllByRole("button", { name: "Home" })).toHaveLength(1);
  });

  it("hides the mobile bottom nav on the goal-history screen too", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/goal-history");
    expect(screen.getAllByRole("button", { name: "Home" })).toHaveLength(1);
  });

  // F-LAYOUT-3
  it("does not identify the user to analytics before /me has loaded", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined } as any);
    renderLayout("/");
    expect(identifyUser).not.toHaveBeenCalled();
  });

  it("identifies the user to analytics once /me resolves an id", async () => {
    vi.mocked(useMe).mockReturnValue({
      data: { id: "u1", name: "Liza" },
    } as any);
    renderLayout("/");
    await waitFor(() => expect(identifyUser).toHaveBeenCalledWith("u1", { name: "Liza" }));
  });
});
