import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { Tools } from "./Tools";
import { track } from "../../lib/analytics";
import { isDemo } from "../../lib/demo";
import { getToken } from "../../lib/token";

vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../../lib/demo", () => ({ isDemo: vi.fn() }));
vi.mock("../../lib/token", () => ({ getToken: vi.fn() }));

// getToken() reads window.location.pathname for real when unmocked — its default in a bare
// jsdom environment (no path segment) makes exportUrl build "//api/export" (protocol-relative:
// the URL parser reads "api" as the host, not the path), silently passing some environments and
// failing others. Mock it to a realistic token so this test suite doesn't depend on jsdom's
// default location.
const TOKEN = "abcDEF123abcDEF123abcDEF";

beforeEach(() => {
  vi.mocked(isDemo).mockReturnValue(false);
  vi.mocked(getToken).mockReturnValue(TOKEN);
});

function Probe({ label }: { label: string }) {
  return <div>{label}</div>;
}

function renderTools() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <Routes>
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/stopwatch" element={<Probe label="stopwatch screen" />} />
        <Route path="/tools/timer" element={<Probe label="timer screen" />} />
        <Route path="/connect" element={<Probe label="connect screen" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Tools", () => {
  it("lists all three entries: AI connection, stopwatch and timer", () => {
    renderTools();
    expect(screen.getByRole("button", { name: /AI connection/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stopwatch/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timer/ })).toBeInTheDocument();
  });

  it("navigates to the stopwatch screen on click", async () => {
    const user = userEvent.setup();
    renderTools();
    await user.click(screen.getByRole("button", { name: /Stopwatch/ }));
    expect(screen.getByText("stopwatch screen")).toBeInTheDocument();
  });

  it("navigates to the timer screen on click", async () => {
    const user = userEvent.setup();
    renderTools();
    await user.click(screen.getByRole("button", { name: /Timer/ }));
    expect(screen.getByText("timer screen")).toBeInTheDocument();
  });

  // F-TOOLS-1
  it("navigates entries via keyboard (Enter/Space), matching their button role", async () => {
    const user = userEvent.setup();
    renderTools();
    const stopwatchEntry = screen.getByRole("button", { name: /Stopwatch/ });
    stopwatchEntry.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("stopwatch screen")).toBeInTheDocument();
  });

  describe("data export", () => {
    // Regression: the download is a plain <a href> navigation to the real backend, which can't
    // go through apiGet's isDemo()/demoGet interception like every other data read — without an
    // explicit guard it would link straight to a 404 for a /demo visitor.
    it("hides the export section entirely in demo mode", () => {
      vi.mocked(isDemo).mockReturnValue(true);
      renderTools();
      expect(screen.queryByText("Data export")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Download Excel/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /JSON for backup/ })).not.toBeInTheDocument();
    });

    // The five spelled-out ranges ("6 months", "All time") could not fit one row as a segmented
    // toggle and wrapped onto a second line. One labelled select, five options, one row.
    it("offers the five ranges as a single labelled select, not a row of buttons", () => {
      renderTools();
      const select = screen.getByLabelText("Period");
      expect(select.tagName).toBe("SELECT");
      expect(within(select).getAllByRole("option")).toHaveLength(5);
      expect(select).toHaveValue("all");
    });

    it("defaults to 'All time' with no date params on the Excel link", () => {
      renderTools();
      const link = screen.getByRole("link", { name: /Download Excel/ });
      const url = new URL(link.getAttribute("href")!, "http://localhost");
      expect(url.pathname.endsWith("/api/export")).toBe(true);
      expect(url.searchParams.get("format")).toBe("xlsx");
      expect(url.searchParams.get("lang")).toBe("en");
      expect(url.searchParams.has("from")).toBe(false);
    });

    // The JSON document is what import_document restores from — it must stay reachable even
    // though Excel is the headline format now.
    it("keeps a secondary JSON link without the xlsx params", () => {
      renderTools();
      const link = screen.getByRole("link", { name: /JSON for backup/ });
      const url = new URL(link.getAttribute("href")!, "http://localhost");
      expect(url.pathname.endsWith("/api/export")).toBe(true);
      expect(url.searchParams.has("format")).toBe(false);
      expect(link).toHaveAttribute("download");
    });

    it("adds a from= param scoped to the selected period", async () => {
      const user = userEvent.setup();
      renderTools();
      await user.selectOptions(screen.getByLabelText("Period"), "3m");
      for (const name of [/Download Excel/, /JSON for backup/]) {
        const link = screen.getByRole("link", { name });
        const url = new URL(link.getAttribute("href")!, "http://localhost");
        expect(url.searchParams.has("from")).toBe(true);
      }
    });

    it("carries the download attribute so the browser saves rather than navigates", () => {
      renderTools();
      expect(screen.getByRole("link", { name: /Download Excel/ })).toHaveAttribute("download");
    });

    it("tracks export_download with the selected period and format on click", async () => {
      const user = userEvent.setup();
      renderTools();
      await user.selectOptions(screen.getByLabelText("Period"), "year");
      await user.click(screen.getByRole("link", { name: /Download Excel/ }));
      expect(track).toHaveBeenCalledWith("export_download", { period: "year", format: "xlsx" });
      await user.click(screen.getByRole("link", { name: /JSON for backup/ }));
      expect(track).toHaveBeenCalledWith("export_download", { period: "year", format: "json" });
    });
  });
});
