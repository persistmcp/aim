import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdherenceWidget } from "./AdherenceWidget";
import { useAdherence } from "../lib/queries";

vi.mock("../lib/queries", () => ({ useAdherence: vi.fn() }));

const q = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  data: undefined,
  ...overrides,
});

function setup(state: Record<string, unknown>) {
  vi.mocked(useAdherence).mockReturnValue(q(state) as unknown as ReturnType<typeof useAdherence>);
  return render(<AdherenceWidget />);
}

describe("AdherenceWidget", () => {
  it("renders nothing while loading", () => {
    const { container } = setup({ isLoading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on error", () => {
    const { container } = setup({ isError: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the user never set a weekly target (pre-intake)", () => {
    const { container } = setup({
      data: { sessions_this_week: 2, target_per_week: null, week_start: "2026-07-06" },
    });
    expect(container).toBeEmptyDOMElement();
  });

  // Regression (2026-07-25): a target of 0 slipped past the `== null` gate and rendered
  // "0 of 0" with an always-true "target met" badge.
  it("renders nothing when the weekly target is 0", () => {
    const { container } = setup({
      data: { sessions_this_week: 0, target_per_week: 0, week_start: "2026-07-06" },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count against the target without a completion note when below target", () => {
    setup({ data: { sessions_this_week: 2, target_per_week: 4, week_start: "2026-07-06" } });
    expect(screen.getByText("2 of 4")).toBeInTheDocument();
    expect(screen.getByText("this week")).toBeInTheDocument();
    expect(screen.queryByText(/met/i)).not.toBeInTheDocument();
  });

  it("shows a completion note once sessions meet or exceed the target", () => {
    setup({ data: { sessions_this_week: 4, target_per_week: 4, week_start: "2026-07-06" } });
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
    expect(screen.getByText("Weekly target met ✅")).toBeInTheDocument();
  });

  it("still shows the completion note if the user logged more than the target", () => {
    setup({ data: { sessions_this_week: 5, target_per_week: 4, week_start: "2026-07-06" } });
    expect(screen.getByText("Weekly target met ✅")).toBeInTheDocument();
  });

  const days = (states: string[]) =>
    states.map((state, i) => ({ date: `2026-07-${6 + i}`, state }));

  it("renders one accessible pill per day with state-specific labels", () => {
    setup({
      data: {
        sessions_this_week: 2,
        target_per_week: 4,
        week_start: "2026-07-06",
        days: days(["done", "rest", "done", "today", "future", "future", "future"]),
        tone: null,
      },
    });
    const pills = screen.getAllByRole("img");
    expect(pills).toHaveLength(7);
    expect(screen.getAllByLabelText(/trained/)).toHaveLength(2);
    expect(screen.getByLabelText(/today/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/upcoming/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/rest/)).toHaveLength(1);
  });

  it("shows the tense caption only when tone is tense", () => {
    setup({
      data: {
        sessions_this_week: 1,
        target_per_week: 4,
        week_start: "2026-07-06",
        days: days(["done", "rest", "rest", "rest", "rest", "today", "future"]),
        tone: "tense",
      },
    });
    expect(screen.getByText("Only a couple of days left this week")).toBeInTheDocument();
  });

  it("omits the tense caption and pills gracefully on a met week with no tone", () => {
    setup({
      data: {
        sessions_this_week: 4,
        target_per_week: 4,
        week_start: "2026-07-06",
        days: days(["done", "done", "done", "done", "today", "future", "future"]),
        tone: null,
      },
    });
    expect(screen.queryByText("Only a couple of days left this week")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(7);
  });
});
