import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GoalCoachFab } from "./GoalCoachFab";
import { useConnection } from "../lib/queries";

vi.mock("../lib/queries", () => ({ useConnection: vi.fn() }));

// jsdom has no ResizeObserver, which Radix's Popper (positions the tooltip content) needs once
// it actually opens — same jsdom-gap stub as FeaturedGoalCard.test.tsx's sparkline.
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  // @ts-expect-error test-only cleanup of a stub installed per-test
  delete navigator.clipboard;
});

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function renderFab(prompt = "Bench 100kg for a single") {
  return render(
    <MemoryRouter>
      <GoalCoachFab prompt={prompt} />
    </MemoryRouter>,
  );
}

describe("GoalCoachFab", () => {
  it("links to /connect instead of offering a copy action when disconnected", () => {
    vi.mocked(useConnection).mockReturnValue({ data: { connected: false } } as any);
    renderFab();
    const link = screen.getByRole("link", { name: "Connect to chat with your coach" });
    expect(link).toHaveAttribute("href", "/connect");
  });

  it("defaults to the disconnected/connect-first affordance while the connection query is still loading", () => {
    // `useConnection()` resolves `data: undefined` until its query settles — must not read as
    // "connected" in the meantime (a brand-new user would briefly see a copy action that does
    // nothing useful yet, instead of the link that gets them connected first).
    vi.mocked(useConnection).mockReturnValue({ data: undefined } as any);
    renderFab();
    const link = screen.getByRole("link", { name: "Connect to chat with your coach" });
    expect(link).toHaveAttribute("href", "/connect");
  });

  it("offers a copy action instead of a link once connected", () => {
    vi.mocked(useConnection).mockReturnValue({ data: { connected: true } } as any);
    renderFab();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Talk this over with your coach" }),
    ).toBeInTheDocument();
  });

  it("renders the tooltip content below the trigger once focused", async () => {
    vi.mocked(useConnection).mockReturnValue({ data: { connected: true } } as any);
    renderFab();
    const button = screen.getByRole("button", { name: "Talk this over with your coach" });
    fireEvent.focus(button);
    await waitFor(() => {
      const tooltip = document.querySelector('[data-slot="tooltip-content"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveAttribute("data-side", "bottom");
    });
  });

  it("copies a goal-scoped conversation starter and announces the copied state", async () => {
    vi.mocked(useConnection).mockReturnValue({ data: { connected: true } } as any);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderFab("Bench 100kg for a single");

    const button = screen.getByRole("button", { name: "Talk this over with your coach" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('Let\'s talk about my goal: "Bench 100kg for a single"');
    expect(screen.getByText("Copied", { selector: '[aria-live="polite"]' })).toBeInTheDocument();
  });

  it("stays in its non-copied state and does not crash when the clipboard write is denied", async () => {
    vi.mocked(useConnection).mockReturnValue({ data: { connected: true } } as any);
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    renderFab();

    const button = screen.getByRole("button", { name: "Talk this over with your coach" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: "Talk this over with your coach" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Copied", { selector: '[aria-live="polite"]' }),
    ).not.toBeInTheDocument();
  });
});
