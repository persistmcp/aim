import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRBadge } from "./PRBadge";

describe("PRBadge", () => {
  it("renders the exercise name and weight×reps", () => {
    render(<PRBadge exerciseName="Bench press" weight={100} reps={5} />);
    expect(screen.getByText("Bench press")).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("is not clickable when onClick is omitted", () => {
    const { container } = render(<PRBadge exerciseName="Squat" weight={80} reps={8} />);
    expect(container.firstChild).not.toHaveClass("cursor-pointer");
  });

  it("fires onClick when tapped", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<PRBadge exerciseName="Deadlift" weight={140} reps={3} onClick={onClick} />);
    await user.click(screen.getByText("Deadlift"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not crash on a very long exercise name (truncation, not overflow)", () => {
    const long = "A".repeat(200);
    render(<PRBadge exerciseName={long} weight={50} reps={10} />);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  // Regression guard (same root cause as Stopwatch's lap rows, found during a mobile-viewport
  // pass 2026-07-12): `Card`'s own base class is `flex flex-col`, which silently wins over this
  // component's `items-center gap-2` (no explicit direction), stacking the trophy icon above the
  // text instead of beside it. jsdom has no real layout engine so nothing else here would catch
  // this — assert the className explicitly claims `flex-row`.
  it("renders as an explicit flex-row (regression: Card's flex-col default silently won without it)", () => {
    const { container } = render(<PRBadge exerciseName="Bench press" weight={100} reps={5} />);
    expect(container.firstChild).toHaveClass("flex-row");
  });

  it("stays in its plain treatment when celebratory is omitted (additive prop, no regression)", () => {
    const { container } = render(<PRBadge exerciseName="Bench press" weight={100} reps={5} />);
    expect(container.firstChild).toHaveClass("border-accent/20");
    expect(container.firstChild).not.toHaveClass("animate-in");
  });

  it("adds the pop-in animation and a stronger accent treatment when celebratory", () => {
    const { container } = render(
      <PRBadge exerciseName="Bench press" weight={100} reps={5} celebratory />,
    );
    expect(container.firstChild).toHaveClass("animate-in", "zoom-in-95", "border-accent");
    expect(container.firstChild).not.toHaveClass("border-accent/20");
  });

  it("shows no close button without onDismiss (History's plain listing stays untouched)", () => {
    render(<PRBadge exerciseName="Bench press" weight={100} reps={5} />);
    expect(screen.queryByRole("button", { name: "Dismiss record" })).not.toBeInTheDocument();
  });

  it("fires onDismiss from the close button after the slide-out animation", async () => {
    const onDismiss = vi.fn();
    render(
      <PRBadge
        exerciseName="Bench press"
        weight={100}
        reps={5}
        celebratory
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss record" }));
    expect(onDismiss).not.toHaveBeenCalled(); // waits for the slide-out to play first
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it("close button does not bubble into the card's onClick", () => {
    const onClick = vi.fn();
    render(
      <PRBadge
        exerciseName="Bench press"
        weight={100}
        reps={5}
        onClick={onClick}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss record" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  // jsdom has no PointerEvent constructor, and testing-library's fireEvent.pointerMove silently
  // drops clientX/pointerId with it — dispatch MouseEvent-based pointer events by hand instead.
  function firePointer(el: HTMLElement, type: string, x: number, y: number, id: number) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(ev, "pointerId", { value: id });
    el.dispatchEvent(ev);
  }

  it("dismisses on a decisive horizontal swipe but springs back from a short drag", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <PRBadge
        exerciseName="Bench press"
        weight={100}
        reps={5}
        celebratory
        onDismiss={onDismiss}
      />,
    );
    const card = container.firstChild as HTMLElement;

    // Short drag: 40px < the 72px threshold — must spring back, not dismiss.
    firePointer(card, "pointerdown", 100, 10, 1);
    firePointer(card, "pointermove", 140, 12, 1);
    firePointer(card, "pointerup", 140, 12, 1);
    await new Promise((r) => setTimeout(r, 250));
    expect(onDismiss).not.toHaveBeenCalled();

    // Decisive swipe well past the threshold.
    firePointer(card, "pointerdown", 100, 10, 2);
    firePointer(card, "pointermove", 250, 14, 2);
    firePointer(card, "pointerup", 250, 14, 2);
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it("a vertical drag never claims the gesture (scrolling stays scrolling)", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <PRBadge
        exerciseName="Bench press"
        weight={100}
        reps={5}
        celebratory
        onDismiss={onDismiss}
      />,
    );
    const card = container.firstChild as HTMLElement;
    firePointer(card, "pointerdown", 100, 10, 3);
    firePointer(card, "pointermove", 110, 200, 3);
    firePointer(card, "pointerup", 110, 200, 3);
    await new Promise((r) => setTimeout(r, 250));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
