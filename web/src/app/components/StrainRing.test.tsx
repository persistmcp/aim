import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrainRing } from "./StrainRing";

// Purely presentational: an SVG ring (two <circle>s, background + progress) whose strokeDashoffset
// is derived from strain/21, plus a centered numeric label. No clamping logic in the component.
describe("StrainRing", () => {
  it.each([0, 10.5, 21])(
    "renders the numeric label and both circles without crashing at strain=%s",
    (strain) => {
      const { container } = render(<StrainRing strain={strain} />);
      expect(screen.getByText(String(strain))).toBeInTheDocument();
      expect(container.querySelectorAll("circle")).toHaveLength(2);
    },
  );

  // F-STRAINRING-1
  it("does not clamp or crash for out-of-range strain (negative or above the 21 max)", () => {
    const { container: low } = render(<StrainRing strain={-5} />);
    expect(screen.getByText("-5")).toBeInTheDocument();
    expect(low.querySelectorAll("circle")).toHaveLength(2);

    const { container: high } = render(<StrainRing strain={40} />);
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(high.querySelectorAll("circle")).toHaveLength(2);
  });

  it("uses the default 48px size when none is given, and respects a custom size", () => {
    const { container: def } = render(<StrainRing strain={5} />);
    const defSvg = def.querySelector("svg");
    expect(defSvg).toHaveAttribute("width", "48");
    expect(defSvg).toHaveAttribute("height", "48");

    const { container: custom } = render(<StrainRing strain={5} size={80} />);
    const customSvg = custom.querySelector("svg");
    expect(customSvg).toHaveAttribute("width", "80");
    expect(customSvg).toHaveAttribute("height", "80");
  });
});
