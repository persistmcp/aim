import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ToolHeader } from "./ToolHeader";

function Probe() {
  return <div>tools hub</div>;
}

function renderHeader(initialPath = "/tools/timer") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/tools/timer" element={<ToolHeader title="Timer" />} />
        <Route path="/tools" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ToolHeader", () => {
  it("renders the given title for screen readers only", () => {
    renderHeader();
    // sr-only heading — present in the DOM, not meant to duplicate visibly, but still queryable.
    expect(screen.getByRole("heading", { name: "Timer" })).toBeInTheDocument();
  });

  // F-TOOLHEADER-1
  it("back button navigates to /tools", async () => {
    const user = userEvent.setup();
    renderHeader();
    expect(screen.queryByText("tools hub")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to tools" }));
    expect(screen.getByText("tools hub")).toBeInTheDocument();
  });
});
