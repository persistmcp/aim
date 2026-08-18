import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "./Landing";
import { signup } from "../lib/publicApi";
import { track } from "../lib/analytics";
import { reportError } from "../lib/telemetry";

vi.mock("../lib/publicApi", () => ({ signup: vi.fn() }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../lib/telemetry", () => ({ reportError: vi.fn() }));

// jsdom doesn't implement IntersectionObserver; Landing uses one to toggle the sticky mobile
// CTA. A minimal stub is enough — the sticky-CTA visibility itself isn't under test here.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

beforeEach(() => {
  vi.clearAllMocks();
});

// There are two identical EmailCapture instances on the page (hero + footer CTA); pin down the
// hero one via its known id rather than an ambiguous role/text query.
function getHeroForm() {
  const input = document.getElementById("hero-email") as HTMLInputElement;
  const form = input.closest("form") as HTMLFormElement;
  return { input, form, submit: within(form).getByRole("button") };
}

describe("Landing", () => {
  it("submits a valid email and shows a success confirmation", async () => {
    vi.mocked(signup).mockResolvedValue(undefined);
    render(<Landing />);
    const user = userEvent.setup();
    const { input, submit } = getHeroForm();

    await user.type(input, "athlete@example.com");
    await user.click(submit);

    expect(signup).toHaveBeenCalledWith("athlete@example.com");
    expect(track).toHaveBeenCalledWith("signup_submitted", { outcome: "success" });
    expect(screen.getByText(/Check your inbox/i)).toBeInTheDocument();
  });

  it("catches an invalid email client-side without calling the signup endpoint", async () => {
    render(<Landing />);
    const user = userEvent.setup();
    const { input, form } = getHeroForm();

    await user.type(input, "not-an-email");
    fireEvent.submit(form);

    expect(signup).not.toHaveBeenCalled();
    expect(within(form).getByRole("alert")).toHaveTextContent("Enter a valid email");
  });

  it("surfaces the server error message and reports it, without crashing, on a failed signup", async () => {
    vi.mocked(signup).mockRejectedValue(
      new Error("Couldn't send the email. Check the address and try again."),
    );
    render(<Landing />);
    const user = userEvent.setup();
    const { input, submit, form } = getHeroForm();

    await user.type(input, "athlete@example.com");
    await user.click(submit);

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { source: "signup" });
    expect(track).toHaveBeenCalledWith("signup_submitted", { outcome: "error" });
    expect(within(form).getByRole("alert")).toHaveTextContent(
      "Couldn't send the email. Check the address and try again.",
    );
  });

  // F-LANDING-1
  it("guards against a double submit (e.g. two Enter presses) firing two signup requests", async () => {
    let resolveSignup!: () => void;
    vi.mocked(signup).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignup = resolve;
      }),
    );
    render(<Landing />);
    const user = userEvent.setup();
    const { input, form, submit } = getHeroForm();

    await user.type(input, "athlete@example.com");
    // Two form submits in a row, before the first request resolves — the button also disables
    // while loading, but fireEvent.submit bypasses that (mirrors a real double Enter-keypress).
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(signup).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    await act(async () => {
      resolveSignup();
      await Promise.resolve();
    });
  });

  it("disables the submit button and shows a submitting label while the request is in flight", async () => {
    let resolveSignup!: () => void;
    vi.mocked(signup).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignup = resolve;
      }),
    );
    render(<Landing />);
    const user = userEvent.setup();
    const { input, submit } = getHeroForm();

    await user.type(input, "athlete@example.com");
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Sending…");

    await act(async () => {
      resolveSignup();
      await Promise.resolve();
    });
  });
});
