import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Timer } from "./Timer";

// Timer's countdown is driven by requestAnimationFrame + performance.now(), not
// setTimeout/setInterval, so vi.useFakeTimers() doesn't help control it (and jsdom's own rAF
// polyfill runs on a real ~16ms clock, which would make deterministic assertions slow/flaky).
// Instead we take over rAF/performance.now ourselves: requestAnimationFrame just records the
// callback instead of scheduling it, and advance() moves the virtual clock forward and — if a
// frame is pending — runs it once, exactly like a real browser frame would.
function installFrameControl(startTime = 0) {
  let now = startTime;
  let pending: FrameRequestCallback | null = null;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", ((cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => {
    pending = null;
  }) as typeof cancelAnimationFrame);
  return {
    advance(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      if (cb) act(() => cb(now));
    },
    restore() {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

function renderTimer() {
  return render(
    <MemoryRouter>
      <Timer />
    </MemoryRouter>,
  );
}

function mainDisplay(container: HTMLElement) {
  return container.querySelector(".text-6xl")?.textContent;
}

function lengthLabel() {
  return screen.getByText(/^length /).textContent;
}

describe("Timer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the default 60s length and countdown", () => {
    const { container } = renderTimer();
    expect(mainDisplay(container)).toBe("01:00");
    expect(lengthLabel()).toBe("length 01:00");
  });

  // F-TIMER-1
  it("floors length at 5s when mashing -15 from a 30s preset (never goes negative)", async () => {
    const user = userEvent.setup();
    const { container } = renderTimer();
    await user.click(screen.getByRole("button", { name: "00:30" }));
    expect(mainDisplay(container)).toBe("00:30");

    const minus = screen.getByRole("button", { name: "−15 sec" });
    await user.click(minus); // 30 -> 15
    await user.click(minus); // 15 -> 0, clamped to 5
    await user.click(minus); // would go negative, stays clamped to 5

    expect(mainDisplay(container)).toBe("00:05");
    expect(lengthLabel()).toBe("length 00:05");
  });

  // F-TIMER-2
  it("ceilings length at 3599s (59:59) when mashing +15 from a 300s preset", async () => {
    const { container } = renderTimer();
    await userEvent.setup().click(screen.getByRole("button", { name: "05:00" }));
    expect(mainDisplay(container)).toBe("05:00");

    const plus = screen.getByRole("button", { name: "+15 sec" });
    // 300 -> 3599 needs 220 steps of +15 (300 + 15*220 = 3600, clamped to 3599 on the last one);
    // a couple of extra clicks confirm it then sticks at the cap instead of wrapping/overflowing.
    for (let i = 0; i < 223; i++) {
      fireEventClick(plus);
    }

    expect(mainDisplay(container)).toBe("59:59");
    expect(lengthLabel()).toBe("length 59:59");
  });

  // F-TIMER-3
  it("disables length controls (±15 and presets) while running and re-enables them once paused", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderTimer();

    const minus = screen.getByRole("button", { name: "−15 sec" });
    const plus = screen.getByRole("button", { name: "+15 sec" });
    const preset = screen.getByRole("button", { name: "01:30" });
    expect(minus).not.toBeDisabled();
    expect(plus).not.toBeDisabled();
    expect(preset).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(minus).toBeDisabled();
    expect(plus).toBeDisabled();
    // Regression guard: presets used to remain clickable mid-countdown while ±15 didn't —
    // fixed 2026-07-12 so all length controls are consistently locked while running.
    expect(preset).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(minus).not.toBeDisabled();
    expect(plus).not.toBeDisabled();
    expect(preset).not.toBeDisabled();

    frames.restore();
  });

  // F-TIMER-4
  it("disables reset on a fresh timer and enables it once paused with elapsed time", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderTimer();

    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(2000);
    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(reset).not.toBeDisabled();
    expect(mainDisplay(container)).toBe("00:58");

    frames.restore();
  });

  // F-TIMER-5
  it("finishes at zero, fires vibrate, disables start until reset", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderTimer();

    // Get down to the 5s floor so we don't need to simulate a full minute.
    await user.click(screen.getByRole("button", { name: "00:30" }));
    const minus = screen.getByRole("button", { name: "−15 sec" });
    await user.click(minus);
    await user.click(minus);
    expect(mainDisplay(container)).toBe("00:05");

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(5100);

    expect(mainDisplay(container)).toBe("00:00");
    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 200]);

    const startBtn = screen.getByRole("button", { name: "Start" });
    expect(startBtn).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(mainDisplay(container)).toBe("00:05");
    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();

    frames.restore();
  });
});

// A plain DOM click, used only for the high-iteration-count clamp test above where 223
// userEvent.click() round-trips (each with its own pointer/event choreography and awaited
// microtasks) would make the test needlessly slow; the button has no pointer-specific behavior,
// so a synthetic click is behaviorally equivalent here.
function fireEventClick(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
