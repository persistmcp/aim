import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditSetSheet, type EditSetTarget } from "./EditSetSheet";
import { apiPatch } from "../lib/api";

vi.mock("../lib/api", () => ({ apiPatch: vi.fn() }));

// Plain fireEvent, not @testing-library/user-event: userEvent's realistic click/type simulates a
// full pointerdown/pointerup sequence, which vaul's drag-to-dismiss release handler reads real
// getComputedStyle() transform values from — jsdom doesn't implement that, so it throws.

afterEach(() => vi.clearAllMocks());

const TARGET: EditSetTarget = {
  sessionId: "sess-1",
  exerciseId: "ex_lat_pulldown",
  occurrence: 1,
  setNumber: 2,
  weight: 55,
  reps: 10,
  rir: 2,
};

function setup(target: EditSetTarget | null = TARGET) {
  const client = new QueryClient();
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EditSetSheet target={target} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange, invalidateSpy };
}

describe("EditSetSheet", () => {
  // F-EDITSET-1
  it("pre-fills weight, reps and RIR from the target set", () => {
    setup();
    expect(screen.getByLabelText("Weight, kg")).toHaveValue(55);
    expect(screen.getByLabelText("Reps")).toHaveValue(10);
    expect(screen.getByLabelText("RIR")).toHaveValue(2);
  });

  // F-EDITSET-2
  it("PATCHes /sets with the session/exercise/occurrence/set_number and only the changed fields, then invalidates the session query", async () => {
    vi.mocked(apiPatch).mockResolvedValue({});
    const { onOpenChange, invalidateSpy } = setup();

    fireEvent.change(screen.getByLabelText("Weight, kg"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiPatch).toHaveBeenCalledWith("/sets", {
      session_id: "sess-1",
      exercise_id: "ex_lat_pulldown",
      set_number: 2,
      occurrence: 1,
      patch: { weight_kg: 60, reps: 10, rir: 2 },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["session", "sess-1"] });
  });

  // F-EDITSET-3
  it("sends null for a field the user clears, not a dropped key", async () => {
    vi.mocked(apiPatch).mockResolvedValue({});
    setup();

    fireEvent.change(screen.getByLabelText("RIR"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch).toHaveBeenCalledWith(
      "/sets",
      expect.objectContaining({ patch: expect.objectContaining({ rir: null }) }),
    );
  });

  // F-EDITSET-4
  it("shows an error and does not close when the PATCH fails", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("boom"));
    const { onOpenChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // F-EDITSET-5
  it("is closed (no dialog content) when target is null", () => {
    setup(null);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
