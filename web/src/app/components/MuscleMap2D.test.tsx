import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuscleMap2D, loadColor } from "./MuscleMap2D";
import { loadHeat } from "../lib/muscle";
import type { MuscleStat } from "../lib/muscleVolume";

// `load` is what the figure paints (current decayed load); `sets` only feeds the list rows, so
// tests state the load they mean and let sets follow.
const stat = (muscle: string, sets: number, load = sets > 0 ? 1 : 0): MuscleStat => ({
  muscle,
  sets,
  reps: sets * 8,
  hardSets: sets,
  readyInH: load > 0 ? 48 : 0,
  load,
});

describe("MuscleMap2D", () => {
  it("colors the mapped body-part slug by the muscle's current load", () => {
    // chest (our taxonomy) -> "chest" slug on the front figure, at full fresh load.
    render(<MuscleMap2D muscles={[stat("chest", 20, 1)]} onSelectMuscle={vi.fn()} />);
    const paths = document.querySelectorAll('path[id="chest"]');
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.getAttribute("fill")).toBe(loadColor(1)));
  });

  it("paints a partly-recovered muscle a visibly different color from a fresh one (regression: the panel used to read as two or three shades)", () => {
    const { unmount } = render(
      <MuscleMap2D muscles={[stat("chest", 8, 0.25)]} onSelectMuscle={vi.fn()} />,
    );
    const partial = document.querySelector('path[id="chest"]')!.getAttribute("fill");
    unmount();
    render(<MuscleMap2D muscles={[stat("chest", 8, 1)]} onSelectMuscle={vi.fn()} />);
    const fresh = document.querySelector('path[id="chest"]')!.getAttribute("fill");
    expect(partial).not.toBe(fresh);
    expect(partial).toBe(loadColor(loadHeat(0.25)));
  });

  // F-MUSCLEMAP-1
  it("aggregates several of our muscles onto one shared body-part slug by taking the strongest heat, not whichever was processed last (regression: a naive Map.set overwrite would let a later zero-set muscle blank out an earlier fully-trained one)", () => {
    // front_delts and side_delts both fold onto the library's single "deltoids" slug. Order the
    // fully-trained one first and the untrained one second so a last-write-wins bug would show up
    // as gray instead of red.
    const muscles = [stat("front_delts", 12, 1), stat("side_delts", 0, 0)];
    render(<MuscleMap2D muscles={muscles} onSelectMuscle={vi.fn()} />);
    const paths = document.querySelectorAll('path[id="deltoids"]');
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.getAttribute("fill")).toBe(loadColor(1)));
  });

  it("skips a muscle key it doesn't recognize instead of crashing (backend taxonomy ahead of the frontend map)", () => {
    expect(() =>
      render(<MuscleMap2D muscles={[stat("some_future_muscle", 10)]} onSelectMuscle={vi.fn()} />),
    ).not.toThrow();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("highlights the selected muscle in a colour outside the load ramp, even at zero sets", () => {
    render(<MuscleMap2D muscles={[]} selectedMuscle="chest" onSelectMuscle={vi.fn()} />);
    const paths = document.querySelectorAll('path[id="chest"]');
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.getAttribute("fill")).toBe("#60a5fa"));
  });

  it("clicking a body-part path reports our taxonomy's muscle name, not the library's slug", async () => {
    const onSelectMuscle = vi.fn();
    const user = userEvent.setup();
    render(<MuscleMap2D muscles={[stat("chest", 10)]} onSelectMuscle={onSelectMuscle} />);
    const [path] = document.querySelectorAll('path[id="chest"]');
    await user.click(path);
    expect(onSelectMuscle).toHaveBeenCalledWith("chest");
  });

  it("defaults to the front view and switches to back via the Front/Back toggle without crashing", async () => {
    const user = userEvent.setup();
    render(<MuscleMap2D muscles={[stat("chest", 10)]} onSelectMuscle={vi.fn()} />);
    expect(screen.getByRole("img", { name: "male-body-front" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("img", { name: "male-body-back" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Front" }));
    expect(screen.getByRole("img", { name: "male-body-front" })).toBeInTheDocument();
  });

  it("flips to the back view automatically when a back-side muscle becomes selected", () => {
    const { rerender } = render(
      <MuscleMap2D muscles={[stat("glutes", 10)]} onSelectMuscle={vi.fn()} />,
    );
    expect(screen.getByRole("img", { name: "male-body-front" })).toBeInTheDocument();

    rerender(
      <MuscleMap2D
        muscles={[stat("glutes", 10)]}
        selectedMuscle="glutes"
        onSelectMuscle={vi.fn()}
      />,
    );
    expect(screen.getByRole("img", { name: "male-body-back" })).toBeInTheDocument();
  });
});
