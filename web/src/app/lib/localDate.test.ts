// These helpers decide which calendar day a workout belongs to, and the muscle panel turns that
// day count straight into colour — so an off-by-one here is a visibly wrong heatmap, not a rounding
// detail. The bugs they exist to prevent (a UTC-serialized local date, a DST-shortened day, a
// future-dated session) are all invisible in the timezone a developer happens to sit in, which is
// why each one gets an explicit test rather than trusting the implementation to look right.
import { describe, expect, it } from "vitest";
import { daysAgoIso, daysBetweenIso, localIso, todayIso } from "./localDate";

describe("localIso", () => {
  it("labels a date by its LOCAL calendar day, not the UTC one", () => {
    // 23:30 local on Aug 6. toISOString() would call this Aug 7 anywhere east of UTC, and Aug 6
    // in the Americas — the panel's window start must not depend on which.
    const d = new Date(2026, 7, 6, 23, 30);
    expect(localIso(d)).toBe("2026-08-06");
  });

  it("pads single-digit months and days", () => {
    expect(localIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("daysAgoIso", () => {
  it("counts back in whole local days", () => {
    expect(daysAgoIso(0)).toBe(todayIso());
    expect(daysBetweenIso(daysAgoIso(6), todayIso())).toBe(6);
  });

  it("crosses a month boundary without arithmetic drift", () => {
    // Purely a property check, so it holds whatever today's date is.
    for (const n of [1, 7, 12, 30, 45]) {
      expect(daysBetweenIso(daysAgoIso(n), todayIso())).toBe(n);
    }
  });
});

describe("daysBetweenIso", () => {
  it("counts whole days between two ISO days", () => {
    expect(daysBetweenIso("2026-08-01", "2026-08-08")).toBe(7);
    expect(daysBetweenIso("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("is unaffected by a DST boundary (regression: timestamp maths turned a 2-day gap into 47h and shifted the decay)", () => {
    // Europe: clocks go forward on 2026-03-29.
    expect(daysBetweenIso("2026-03-28", "2026-03-30")).toBe(2);
    // Americas: clocks go forward on 2026-03-08.
    expect(daysBetweenIso("2026-03-07", "2026-03-09")).toBe(2);
    // …and back on 2026-11-01.
    expect(daysBetweenIso("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("never returns a negative age for a session dated in the future", () => {
    // Reachable whenever the device clock is behind the date the user (or their assistant) logged.
    // A negative age would make the muscle read as MORE than fully loaded.
    expect(daysBetweenIso("2026-08-10", "2026-08-06")).toBe(0);
  });

  it("returns 0 rather than NaN for a missing or malformed day", () => {
    // NaN would propagate through loadFade into the gradient index and blank the whole panel.
    for (const bad of ["", "not-a-date", "20260806"]) {
      expect(daysBetweenIso(bad, "2026-08-06")).toBe(0);
      expect(daysBetweenIso("2026-08-06", bad)).toBe(0);
    }
  });

  it("crosses a year boundary", () => {
    expect(daysBetweenIso("2025-12-30", "2026-01-02")).toBe(3);
  });
});
