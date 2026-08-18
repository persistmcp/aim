import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Stopwatch } from "./Stopwatch";

// Same rationale as Timer.test.tsx: the running clock is driven by requestAnimationFrame +
// performance.now(), so we take both over ourselves for exact, non-flaky control instead of
// relying on jsdom's real-time rAF polyfill or vi.useFakeTimers() (which doesn't intercept rAF
// timestamps the way this component consumes them).
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

function renderStopwatch() {
  return render(
    <MemoryRouter>
      <Stopwatch />
    </MemoryRouter>,
  );
}

function display(container: HTMLElement) {
  const main = container.querySelector(".text-7xl")?.textContent ?? "";
  const cs = container.querySelector(".text-3xl")?.textContent ?? "";
  return `${main}${cs}`; // e.g. "00:01.50"
}

function lapRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-slot="card"]')).map((el) => el.textContent);
}

describe("Stopwatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders zeroed out with reset disabled and no lap button before starting", () => {
    const { container } = renderStopwatch();
    expect(display(container)).toBe("00:00.00");
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lap" })).not.toBeInTheDocument();
  });

  // F-STOPWATCH-1
  it("shows the lap button only while running, and swaps it for reset once paused", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderStopwatch();

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("button", { name: "Lap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.queryByRole("button", { name: "Lap" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();

    frames.restore();
  });

  // F-STOPWATCH-2
  it("freezes elapsed on pause and resumes from there instead of restarting", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderStopwatch();

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(1500);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(display(container)).toBe("00:01.50");

    // Resuming must continue from the frozen value, not reset to zero.
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(display(container)).toBe("00:01.50");

    frames.advance(1000);
    expect(display(container)).toBe("00:02.50");

    frames.restore();
  });

  // F-STOPWATCH-3
  it("computes lap splits against the previous lap, not against zero, newest lap first", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderStopwatch();

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(1000);
    await user.click(screen.getByRole("button", { name: "Lap" })); // lap 1 @ 1000ms
    frames.advance(1500);
    await user.click(screen.getByRole("button", { name: "Lap" })); // lap 2 @ 2500ms
    frames.advance(1500);
    await user.click(screen.getByRole("button", { name: "Lap" })); // lap 3 @ 4000ms

    const rows = lapRows(container);
    expect(rows).toHaveLength(3);
    // Newest lap rendered first.
    expect(rows[0]).toContain("Lap 3");
    expect(rows[0]).toContain("+00:01.50");
    expect(rows[0]).toContain("00:04.00");
    expect(rows[1]).toContain("Lap 2");
    expect(rows[1]).toContain("+00:01.50");
    expect(rows[1]).toContain("00:02.50");
    expect(rows[2]).toContain("Lap 1");
    // Oldest lap's split is against zero, i.e. equal to its own elapsed time.
    expect(rows[2]).toContain("+00:01.00");
    expect(rows[2]).toContain("00:01.00");

    frames.restore();
  });

  // F-STOPWATCH-5: jsdom has no real CSS layout engine, so nothing above actually verifies the
  // three lap values render as a horizontal row rather than stacked/centered — `Card`'s own base
  // class is `flex flex-col`, which silently wins over a lap row's `items-center justify-between`
  // (no explicit direction) and re-flowed it as a centered *vertical* stack in the real browser,
  // caught only by a live mobile-viewport screenshot. This asserts the textual guard against that
  // regression: the row's className must explicitly claim `flex-row`.
  it("renders each lap row as an explicit flex-row (regression: Card's own flex-col default silently won without it)", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderStopwatch();

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(1000);
    await user.click(screen.getByRole("button", { name: "Lap" }));

    const row = container.querySelector('[data-slot="card"]');
    expect(row?.className).toMatch(/\bflex-row\b/);

    frames.restore();
  });

  // F-STOPWATCH-4
  it("reset clears both elapsed and laps together", async () => {
    const frames = installFrameControl();
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = renderStopwatch();

    await user.click(screen.getByRole("button", { name: "Start" }));
    frames.advance(1000);
    await user.click(screen.getByRole("button", { name: "Lap" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(lapRows(container)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(display(container)).toBe("00:00.00");
    expect(lapRows(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();

    frames.restore();
  });
});
