import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState, ErrorState, Loading, Query } from "./States";

describe("ErrorState", () => {
  // F-STATES-2
  it("announces itself via role=alert so it's never mistaken for an empty account", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("only renders a retry button when onRetry is provided", () => {
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<ErrorState onRetry={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Loading", () => {
  it("is announced politely via aria-live, not role=alert (not an error)", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

describe("EmptyState", () => {
  it("renders title without a hint when hint is omitted", () => {
    render(<EmptyState title="No sessions yet" />);
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    render(<EmptyState title="No sessions yet" hint="Log your first workout" />);
    expect(screen.getByText("Log your first workout")).toBeInTheDocument();
  });
});

describe("Query", () => {
  const refetch = vi.fn();

  // F-STATES-1
  it("renders Loading while isLoading is true, even if data is already present", () => {
    render(
      <Query q={{ isLoading: true, isError: false, data: ["x"], refetch }}>
        {() => <div>data</div>}
      </Query>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("data")).not.toBeInTheDocument();
  });

  it("renders ErrorState when isError, even if data is present (error wins)", () => {
    render(
      <Query q={{ isLoading: false, isError: true, data: ["x"], refetch }}>
        {() => <div>data</div>}
      </Query>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders ErrorState when data is undefined without isError set (network layer swallowed it)", () => {
    render(
      <Query q={{ isLoading: false, isError: false, data: undefined, refetch }}>
        {() => <div>data</div>}
      </Query>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the empty state only when the `when` predicate matches the loaded data", () => {
    render(
      <Query
        q={{ isLoading: false, isError: false, data: [] as string[], refetch }}
        empty={{ title: "Nothing here", when: (d) => d.length === 0 }}
      >
        {(data) => <div>{data.length} items</div>}
      </Query>,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders children with data when nothing else applies", () => {
    render(
      <Query q={{ isLoading: false, isError: false, data: [1, 2, 3], refetch }}>
        {(data) => <div>{data.length} items</div>}
      </Query>,
    );
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });
});
