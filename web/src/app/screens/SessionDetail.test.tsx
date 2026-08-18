import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SessionDetail } from "./SessionDetail";
import { useSession } from "../lib/queries";
import i18n from "../i18n";
import type { Exercise, WorkoutSession } from "../data/workouts";

vi.mock("../lib/queries", () => ({ useSession: vi.fn() }));

afterEach(async () => {
  if (i18n.resolvedLanguage !== "en") await i18n.changeLanguage("en");
});

const q = (overrides: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...overrides,
});

function fullSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "abc",
    dayName: "Push day",
    date: "2026-07-05",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    totalVolume: 6200,
    exercises: [],
    status: "completed",
    ...overrides,
  };
}

function setup(session: unknown) {
  vi.mocked(useSession).mockReturnValue(session as ReturnType<typeof useSession>);
  const router = createMemoryRouter([{ path: "/session/:id", element: <SessionDetail /> }], {
    initialEntries: ["/session/abc"],
  });
  // SessionDetail now also renders EditSetSheet (FUNCTIONAL_IMPROVEMENTS_PLAN.md #5), which
  // reaches for useQueryClient() even while its Drawer is closed — needs a real QueryClient.
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("SessionDetail", () => {
  it("shows Loading while isLoading is true", () => {
    setup(q({ isLoading: true }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows ErrorState with a working retry when isError is true", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setup(q({ isError: true, refetch }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // F-DETAIL-1
  it("shows ErrorState, not the not-found message, on a transient error even though session data is also undefined", () => {
    // Regression guard: isError must be checked before `!session`, or a plain fetch failure would
    // silently render as "workout not found" — which offers no retry and is simply the wrong
    // message for a network blip vs. a truly deleted session.
    setup(q({ isError: true, data: undefined }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Workout not found")).not.toBeInTheDocument();
  });

  // F-DETAIL-2
  it("shows a plain not-found message with no retry button when there's no error and no session", () => {
    setup(q({ isLoading: false, isError: false, data: undefined }));
    expect(screen.getByText("Workout not found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to a placeholder for RPE, energy and body weight when they are null", () => {
    setup(q({ data: fullSession({ rpe: undefined, energy: undefined, bodyWeight: undefined }) }));
    // Three independent stat tiles, each rendering "·" when its value is null.
    expect(screen.getAllByText("·")).toHaveLength(3);
  });

  it("renders real RPE, energy and body weight values when present", () => {
    setup(q({ data: fullSession({ rpe: 7, energy: 3, bodyWeight: 82 }) }));
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("3/5")).toBeInTheDocument();
    expect(screen.getByText("82 kg")).toBeInTheDocument();
  });

  it("renders the session header and content once loaded", () => {
    setup(q({ data: fullSession() }));
    expect(screen.getByText("Push day")).toBeInTheDocument();
  });

  // F-DETAIL-5
  it("translates the WHOOP card's Strain/Max HR/Cardio load/Muscular load labels", async () => {
    // Regression guard: these four labels were hardcoded English literals, never passed through
    // t() — every other label on this screen translated correctly except these.
    await i18n.changeLanguage("fr");
    setup(
      q({
        data: fullSession({ strain: 12, maxHR: 150, cardioLoad: 40, muscularLoad: 60 }),
      }),
    );
    expect(screen.getByText("Effort")).toBeInTheDocument();
    expect(screen.getByText("FC max")).toBeInTheDocument();
    expect(screen.getByText("Charge cardio")).toBeInTheDocument();
    expect(screen.getByText("Charge musculaire")).toBeInTheDocument();
  });

  // F-DETAIL-3
  it("shows a placeholder, not '0 min', for the duration tile when duration is unknown", () => {
    // Regression guard: a session logged without an explicit duration used to render "0 min"
    // (duration_sec null coerced to 0 by the old minutes() formatter) instead of the same "·"
    // placeholder used for every other unset stat on this screen.
    setup(q({ data: fullSession({ duration: null }) }));
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
    expect(screen.getAllByText("·").length).toBeGreaterThan(0);
  });

  it("renders the real duration when known", () => {
    setup(q({ data: fullSession({ duration: 45 }) }));
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  function sessionWithSet(set: Partial<Exercise["sets"][number]>): WorkoutSession {
    return fullSession({
      exercises: [
        {
          id: "ex1",
          name: "Goblet squat",
          exerciseId: "goblet_squat",
          occurrence: 1,
          sets: [{ setNumber: 1, ...set }],
        },
      ],
    });
  }

  // F-DETAIL-4
  it("renders reps-only sets (no weight) as '× reps', not as a bare, valueless 's'", () => {
    // Regression guard: a bodyweight set (weight null, reps set, duration null) fell through to
    // the "seconds" branch and rendered as a bare "s" (t("seconds", { n: undefined })) because
    // the old logic branched on `weight != null` alone.
    setup(q({ data: sessionWithSet({ weight: undefined, reps: 10, duration: undefined }) }));
    expect(screen.getByText("× 10")).toBeInTheDocument();
    expect(screen.queryByText(/^s$/)).not.toBeInTheDocument();
  });

  it("renders a timed set (no weight, no reps) in seconds", () => {
    setup(q({ data: sessionWithSet({ weight: undefined, reps: undefined, duration: 60 }) }));
    expect(screen.getByText("60 sec")).toBeInTheDocument();
  });

  it("falls back to a placeholder when a set has neither weight/reps nor duration", () => {
    setup(q({ data: sessionWithSet({ weight: undefined, reps: undefined, duration: undefined }) }));
    expect(screen.getAllByText("·").length).toBeGreaterThan(0);
  });

  it("still prefers weight × reps when both weight and reps are present", () => {
    setup(q({ data: sessionWithSet({ weight: 20, reps: 8 }) }));
    expect(screen.getByText("20 kg × 8")).toBeInTheDocument();
  });
});
