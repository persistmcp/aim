import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { History } from "./History";
import { useSessions } from "../lib/queries";
import type { WorkoutSession } from "../data/workouts";

vi.mock("../lib/queries", () => ({ useSessions: vi.fn() }));

const q = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  refetch: vi.fn(),
  ...overrides,
});

function session(
  id: string,
  date: string,
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id,
    dayName: `Session ${id}`,
    date,
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    totalVolume: 1000,
    exercises: [],
    status: "completed",
    ...overrides,
  };
}

function setup(sessions: unknown) {
  vi.mocked(useSessions).mockReturnValue(sessions as ReturnType<typeof useSessions>);
  return render(
    <MemoryRouter>
      <History />
    </MemoryRouter>,
  );
}

describe("History", () => {
  // Regression: `session.date` is a bare "YYYY-MM-DD" and `new Date(that)` parses it as UTC
  // midnight, so west of UTC a session logged on the 1st was filed under the PREVIOUS month —
  // both in the header and in the month-filter dropdown built from the same keys. The card
  // underneath printed the wrong day for the same reason.
  it("files a session dated the 1st under that month, west of UTC", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      setup(q({ data: [session("s1", "2026-08-01")] }));
      // Two matches on purpose: the month header and the filter dropdown's option, both built
      // from the same key — the bug moved both together.
      expect(screen.getAllByText(/August 2026/i)).toHaveLength(2);
      expect(screen.queryByText(/July 2026/i)).not.toBeInTheDocument();
      expect(screen.getByText(/August 1|1 August/i)).toBeInTheDocument();
    } finally {
      // `process.env.TZ = undefined` assigns the STRING "undefined", which Node reads as UTC —
      // that would silently switch every later test in this file to UTC and stop them catching a
      // revert of the very fix this test guards.
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("groups sessions across two months under separate headers, newest month first", () => {
    // The hook already returns newest-first; grouping preserves first-seen order, so July's
    // header should precede June's.
    setup(
      q({
        data: [session("july", "2026-07-05"), session("june", "2026-06-10")],
      }),
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["July 2026", "June 2026"]);
    expect(screen.getByText("Session july")).toBeInTheDocument();
    expect(screen.getByText("Session june")).toBeInTheDocument();
  });

  it("narrows to a single month's cards and hides the other month's header when filtered", async () => {
    const user = userEvent.setup();
    setup(
      q({
        data: [session("july", "2026-07-05"), session("june", "2026-06-10")],
      }),
    );
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "June 2026");

    expect(screen.queryByRole("heading", { name: "July 2026" })).not.toBeInTheDocument();
    expect(screen.queryByText("Session july")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "June 2026" })).toBeInTheDocument();
    expect(screen.getByText("Session june")).toBeInTheDocument();
  });

  it("keeps everything visible when the filter is reset to 'all'", async () => {
    const user = userEvent.setup();
    setup(
      q({
        data: [session("july", "2026-07-05"), session("june", "2026-06-10")],
      }),
    );
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "June 2026");
    await user.selectOptions(select, "All months");
    expect(screen.getByText("Session july")).toBeInTheDocument();
    expect(screen.getByText("Session june")).toBeInTheDocument();
  });

  it("renders the empty state (no month headers) when there are zero sessions", () => {
    setup(q({ data: [] }));
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByText("No workouts yet")).toBeInTheDocument();
    expect(screen.getByText("Log your first one via chat with your AI.")).toBeInTheDocument();
  });

  it("shows the loading state while sessions are loading", () => {
    setup(q({ isLoading: true }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows ErrorState with a working retry when sessions fails to load", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setup(q({ isError: true, refetch }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
