import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditBodyweightSheet } from "./EditBodyweightSheet";
import { apiPost } from "../lib/api";

vi.mock("../lib/api", () => ({ apiPost: vi.fn() }));

// Plain fireEvent throughout, not @testing-library/user-event: userEvent's realistic click/type
// simulates a full pointerdown/pointerup sequence, which vaul's drag-to-dismiss release handler
// reads real getComputedStyle() transform values from — something jsdom doesn't implement, so it
// throws. fireEvent dispatches the bare DOM events these interactions need without that sequence.

afterEach(() => vi.clearAllMocks());

function setup(props: Partial<ComponentProps<typeof EditBodyweightSheet>> = {}) {
  const client = new QueryClient();
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EditBodyweightSheet open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenChange, invalidateSpy };
}

describe("EditBodyweightSheet", () => {
  // F-EDITWEIGHT-1
  it("pre-fills the input with the current value", () => {
    setup({ currentValue: 82.5 });
    expect(screen.getByRole("spinbutton")).toHaveValue(82.5);
  });

  // F-EDITWEIGHT-2
  it("saves a valid weight, invalidates the relevant queries and closes", async () => {
    vi.mocked(apiPost).mockResolvedValue({});
    const { onOpenChange, invalidateSpy } = setup({ currentValue: 82.5 });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "83.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(apiPost).toHaveBeenCalledWith("/body-metrics", { bodyweight_kg: 83.4 });
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => (c[0] as any).queryKey[0]);
    expect(invalidatedKeys).toEqual(expect.arrayContaining(["summary", "body-metrics"]));
  });

  // F-EDITWEIGHT-3
  it("shows an error and does not close when the value is not a positive number", async () => {
    const { onOpenChange } = setup({ currentValue: undefined });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  // Regression (2026-07-25): the backend accepts any weight >= 0, so a fat-fingered "7005"
  // previously saved and permanently wrecked the weight chart's Y axis.
  it("rejects an absurdly large weight instead of saving it", async () => {
    const { onOpenChange } = setup({ currentValue: 82.5 });

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "7005" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  // F-EDITWEIGHT-4
  it("shows an error and stays open when the API call fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("boom"));
    const { onOpenChange } = setup({ currentValue: 80 });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
