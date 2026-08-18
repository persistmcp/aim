import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalHistory } from "./GoalHistory";
import type { Goal } from "../data/workouts";
import { useGoals } from "../lib/queries";

vi.mock("../lib/queries", () => ({ useGoals: vi.fn() }));

const navigateSpy = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    kind: "outcome",
    title: "Bench 100kg",
    target: null,
    status: "achieved",
    review_date: null,
    current: null,
    progress_pct: null,
    goal_type: "milestone",
    ...overrides,
  };
}

describe("GoalHistory", () => {
  it("navigates back when the back button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(useGoals).mockReturnValue({ data: [], isLoading: false } as any);
    render(<GoalHistory />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it("shows an empty state when there is no past goal", () => {
    vi.mocked(useGoals).mockReturnValue({ data: [], isLoading: false } as any);
    render(<GoalHistory />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  // Regression (2026-07-25): a failed load rendered the same "Nothing here yet" as a genuinely
  // empty history — error must be visibly distinct and retryable, same as every other screen.
  it("shows an error state with retry on a failed load, not the empty message", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useGoals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as any);
    render(<GoalHistory />);
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows past (non-active) goals, excluding the active one", () => {
    vi.mocked(useGoals).mockReturnValue({
      data: [
        goal({ id: "g1", title: "Old goal", status: "achieved" }),
        goal({ id: "g2", title: "Still going", status: "active" }),
      ],
      isLoading: false,
    } as any);
    render(<GoalHistory />);
    expect(screen.getByText("Old goal")).toBeInTheDocument();
    expect(screen.getByText("Achieved")).toBeInTheDocument();
    // Active goals are the featured/current one's job (FeaturedGoalCard) — history is the rest.
    expect(screen.queryByText("Still going")).not.toBeInTheDocument();
  });

  it("resolves the supersedes chain into a 'grew from' note", () => {
    vi.mocked(useGoals).mockReturnValue({
      data: [
        goal({ id: "old", title: "Bench 100kg", status: "achieved" }),
        goal({
          id: "new",
          title: "Maintain 100kg bench",
          status: "abandoned",
          supersedes_goal_id: "old",
        }),
      ],
      isLoading: false,
    } as any);
    render(<GoalHistory />);
    expect(screen.getByText('Grew from "Bench 100kg"')).toBeInTheDocument();
  });
});
