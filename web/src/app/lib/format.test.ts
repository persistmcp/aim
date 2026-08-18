import { describe, expect, it } from "vitest";
import { minutes } from "./format";

describe("minutes", () => {
  // F-FORMAT-1
  it("distinguishes an unset duration (null/undefined) from a real 0-minute session", () => {
    // Regression guard: the old `sec ? ... : 0` fallback coerced null/undefined AND 0 all into
    // 0, so History/SessionDetail rendered "0 min" for sessions the coach never asked a duration
    // for — indistinguishable from a workout that genuinely took 0 minutes.
    expect(minutes(null)).toBeNull();
    expect(minutes(undefined)).toBeNull();
    expect(minutes(0)).toBe(0);
  });

  it("rounds seconds to the nearest minute", () => {
    expect(minutes(90)).toBe(2);
    expect(minutes(3600)).toBe(60);
  });
});
