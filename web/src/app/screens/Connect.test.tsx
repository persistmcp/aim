import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Connect } from "./Connect";
import { track } from "../lib/analytics";
import { useConnection } from "../lib/queries";
import { getToken } from "../lib/token";

vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/token", () => ({ getToken: vi.fn() }));
vi.mock("../lib/queries", () => ({ useConnection: vi.fn() }));

const TOKEN = "abcDEF123abcDEF123abcDEF";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getToken).mockReturnValue(TOKEN);
  // Default: no connection data yet (loading) — the status card renders nothing, so it stays
  // out of the way of tests that only care about the MCP-URL card / Claude guide below.
  vi.mocked(useConnection).mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as ReturnType<typeof useConnection>);
});

afterEach(() => {
  // @ts-expect-error test-only cleanup of a stub we install per-test
  delete navigator.clipboard;
});

const mcpUrl = () => `${window.location.origin}/${TOKEN}/mcp`;

/**
 * @testing-library/user-event's setup() unconditionally installs its own clipboard stub
 * (a getter on navigator.clipboard) so it can emulate copy/paste — it clobbers any mock
 * assigned before setup() runs. Must be called (a) after userEvent.setup(), if a test uses
 * it, and (b) via defineProperty (configurable, plain value) so it wins over that getter.
 */
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("Connect", () => {
  it("renders the MCP URL built from the token and origin", () => {
    render(<Connect />);
    expect(screen.getByText(mcpUrl())).toBeInTheDocument();
  });

  it("copies the URL, tracks success, and reverts the button label after 1.5s", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    vi.useFakeTimers();
    try {
      render(<Connect />);
      const button = screen.getByRole("button", { name: "Copy" });

      await act(async () => {
        fireEvent.click(button);
        // Flush the microtask queue so the awaited clipboard promise resolves under fake timers.
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith(mcpUrl());
      expect(track).toHaveBeenCalledWith("mcp_url_copied");
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // F-CONNECT-1
  it("tracks a copy-failed event and does not crash when the clipboard write is denied", async () => {
    render(<Connect />);
    const user = userEvent.setup();
    // Stub AFTER userEvent.setup(): setup() installs its own clipboard getter, which would
    // otherwise silently replace this mock and make the write look like it succeeded.
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    const button = screen.getByRole("button", { name: "Copy" });

    await user.click(button);

    expect(writeText).toHaveBeenCalledWith(mcpUrl());
    expect(track).toHaveBeenCalledWith("mcp_url_copy_failed");
    expect(track).not.toHaveBeenCalledWith("mcp_url_copied");
    // Button must stay in its non-copied state — the rejection must not be swallowed into a
    // false "success" UI, and must not surface as an unhandled promise rejection either.
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("shows the Claude connection guide", () => {
    render(<Connect />);
    expect(screen.getByText("Step by step")).toBeInTheDocument();
  });

  describe("connection status", () => {
    it("renders nothing while the connection check is loading", () => {
      vi.mocked(useConnection).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as ReturnType<typeof useConnection>);
      render(<Connect />);
      expect(screen.queryByText(/Waiting for your first message/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Assistant connected/)).not.toBeInTheDocument();
    });

    it("shows the waiting card with a copyable test prompt when not yet connected", () => {
      vi.mocked(useConnection).mockReturnValue({
        data: { connected: false, last_tool: null, last_call_at: null },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useConnection>);
      render(<Connect />);
      expect(screen.getByText("Waiting for your first message")).toBeInTheDocument();
      expect(screen.getByText("Show my workouts")).toBeInTheDocument();
    });

    it("shows the connected card with last-activity time once a tool call has been seen", () => {
      vi.mocked(useConnection).mockReturnValue({
        data: {
          connected: true,
          last_tool: "get_sessions",
          last_call_at: new Date().toISOString(),
        },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useConnection>);
      render(<Connect />);
      expect(screen.getByText("Assistant connected")).toBeInTheDocument();
      expect(screen.getByText("Last activity: today")).toBeInTheDocument();
      expect(screen.queryByText(/Waiting for your first message/)).not.toBeInTheDocument();
    });

    it("tracks connection_verified exactly once on the disconnected→connected transition", () => {
      vi.mocked(useConnection).mockReturnValue({
        data: { connected: false, last_tool: null, last_call_at: null },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useConnection>);
      const { rerender } = render(<Connect />);
      expect(track).not.toHaveBeenCalledWith("connection_verified");

      vi.mocked(useConnection).mockReturnValue({
        data: {
          connected: true,
          last_tool: "get_sessions",
          last_call_at: new Date().toISOString(),
        },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useConnection>);
      rerender(<Connect />);
      expect(track).toHaveBeenCalledWith("connection_verified");
      expect(track).toHaveBeenCalledTimes(1);

      // A further re-render while already connected must not re-fire the event.
      rerender(<Connect />);
      expect(track).toHaveBeenCalledTimes(1);
    });

    it("does not track connection_verified when the user is already connected on first load", () => {
      vi.mocked(useConnection).mockReturnValue({
        data: {
          connected: true,
          last_tool: "get_sessions",
          last_call_at: new Date().toISOString(),
        },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useConnection>);
      render(<Connect />);
      expect(track).not.toHaveBeenCalledWith("connection_verified");
    });
  });
});
