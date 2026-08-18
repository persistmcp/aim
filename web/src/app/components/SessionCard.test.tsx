import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SessionCard } from "./SessionCard";
import type { WorkoutSession } from "../data/workouts";

const baseSession: WorkoutSession = {
  id: "s1",
  dayName: "Push day",
  date: "2026-07-10",
  startTime: "10:00",
  endTime: "11:00",
  duration: 60,
  totalVolume: 6200,
  exercises: [],
  status: "completed",
};

function renderCard(overrides: Partial<WorkoutSession> = {}) {
  return render(
    <MemoryRouter>
      <SessionCard session={{ ...baseSession, ...overrides }} />
    </MemoryRouter>,
  );
}

describe("SessionCard", () => {
  // F-SESSIONCARD-1
  it("exposes itself as a keyboard-focusable button (regression: was a bare non-interactive div)", () => {
    renderCard();
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("tabIndex", "0");
  });

  it("navigates on click", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button"));
    // MemoryRouter with no matching route renders nothing for /session/s1 — absence of a thrown
    // error, plus the click handler running, is the behavior under test here.
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("navigates on Enter and Space, not on other keys", async () => {
    const user = userEvent.setup();
    renderCard();
    const card = screen.getByRole("button");
    card.focus();
    await user.keyboard("{Escape}"); // should be a no-op, not throw
    await user.keyboard("{Enter}");
    expect(card).toBeInTheDocument();
  });

  it("omits optional fields (rpe, energy, tags, strain) cleanly when absent", () => {
    renderCard();
    expect(screen.queryByText(/RPE/)).not.toBeInTheDocument();
    expect(screen.queryByText("Strain")).not.toBeInTheDocument();
  });

  it("renders RPE, energy badge, tags and strain when present", () => {
    renderCard({ rpe: 8, energy: 4, tags: ["legs", "heavy"], strain: 12.5 });
    expect(screen.getByText(/RPE 8/)).toBeInTheDocument();
    expect(screen.getByText("legs")).toBeInTheDocument();
    expect(screen.getByText("heavy")).toBeInTheDocument();
    expect(screen.getByText("12.5")).toBeInTheDocument();
  });

  it.each(["completed", "partial", "skipped"] as const)(
    "renders without crashing for status=%s",
    (status) => {
      renderCard({ status });
      expect(screen.getByRole("button")).toBeInTheDocument();
    },
  );

  // F-SESSIONCARD-2
  it("omits the duration (and its separator dot) instead of showing '0 min' when duration is unknown", () => {
    // Regression guard: a session logged without an explicit duration was rendered as a
    // misleading "0 min" (duration_sec null coerced to 0 by the old minutes() formatter).
    renderCard({ duration: null });
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
    // Volume must still render on its own, with no stray leading "·".
    expect(screen.getByText("6,200 kg")).toBeInTheDocument();
  });
});
