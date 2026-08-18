import { describe, expect, it } from "vitest";
import {
  COMPOUND_RECOVERY_MULT,
  RECOVERED_BELOW,
  STRETCHER_RECOVERY_MULT,
  exerciseRecoveryMult,
  setCreditMult,
  RECOVERY_HOURS,
  ROLLING_WINDOW_DAYS,
  loadFade,
  loadHeat,
  normalizeLoad,
  prioritizeFocus,
  recoveryHoursFor,
  referenceDose,
  setStatus,
  skippedGroups,
  SET_LANDMARKS,
  SET_TARGET,
} from "./muscle";
import parityCases from "./recoveryParity.fixture.json";

// The decay model is the product-critical bit: the figure must mean "how loaded is this muscle
// right now", fading over each muscle's own recovery window — not "sets since Monday".
describe("recovery windows", () => {
  it("resolves sub-regions to their parent group", () => {
    expect(recoveryHoursFor("rhomboids")).toBe(RECOVERY_HOURS.upper_back);
    expect(recoveryHoursFor("upper_chest")).toBe(RECOVERY_HOURS.chest);
  });

  it("falls back to a generic window for an unmapped muscle", () => {
    expect(recoveryHoursFor("full_body")).toBeGreaterThan(0);
  });

  it("answers 'when is the next bout reasonable', not 'how much damage did this cause'", () => {
    // Arms are the most damage-prone limb muscles (Chen 2011) yet sit BELOW quads here: 48h
    // between direct arm work is routine, and a coaching review corrected an earlier version that
    // followed the damage ranking directly.
    expect(RECOVERY_HOURS.biceps).toBeLessThan(RECOVERY_HOURS.quads);
    expect(RECOVERY_HOURS.hamstrings).toBeGreaterThan(RECOVERY_HOURS.quads);
    expect(RECOVERY_HOURS.lower_back).toBe(Math.max(...Object.values(RECOVERY_HOURS)));
  });

  it("stretches the window for compound work", () => {
    expect(recoveryHoursFor("quads", { exerciseMult: COMPOUND_RECOVERY_MULT })).toBeCloseTo(
      RECOVERY_HOURS.quads * COMPOUND_RECOVERY_MULT,
      5,
    );
  });

  it("never lets a set linger past twice its window, however it was performed", () => {
    expect(
      recoveryHoursFor("quads", { exerciseMult: STRETCHER_RECOVERY_MULT, toFailure: true }),
    ).toBeLessThanOrEqual(RECOVERY_HOURS.quads * 2);
  });

  it("fits every muscle's decay tail inside the panel's fetch window", () => {
    // Otherwise a still-loaded muscle would fall outside the rows we fetch and read as recovered.
    for (const m of Object.keys(RECOVERY_HOURS)) {
      expect(
        recoveryHoursFor(m, { exerciseMult: STRETCHER_RECOVERY_MULT, toFailure: true }),
      ).toBeLessThanOrEqual(ROLLING_WINDOW_DAYS * 24);
    }
  });
});

describe("exerciseRecoveryMult", () => {
  // The shared fixture is the parity contract with backend landmarks.exercise_recovery_mult;
  // test_landmarks.py asserts the same rows. Comparing only the constants let the client silently
  // handle two of the five categories while the server handled all five.
  it.each(parityCases.cases)(
    "matches the shared parity fixture: category=$category pattern=$pattern muscles=$muscles",
    ({ category, pattern, muscles, expected, long_length: longLength }) => {
      expect(exerciseRecoveryMult(category, pattern, muscles, longLength)).toBeCloseTo(
        expected,
        10,
      );
    },
  );

  it("reads the catalog instead of guessing from muscle count (the two cases the guess gets wrong in production: a 2-muscle hip thrust is compound, a 3-muscle face pull is isolation)", () => {
    expect(exerciseRecoveryMult("compound", "hinge", 2)).toBeGreaterThan(1);
    expect(exerciseRecoveryMult("isolation", "horizontal_pull", 3)).toBeLessThan(1);
  });

  it("ranks long-length work above other compounds and isolation last", () => {
    expect(exerciseRecoveryMult("compound", "hinge", 3)).toBeGreaterThan(
      exerciseRecoveryMult("compound", "horizontal_push", 3),
    );
    expect(exerciseRecoveryMult("compound", "horizontal_push", 3)).toBeGreaterThan(
      exerciseRecoveryMult("isolation", "isolation", 1),
    );
  });

  it("falls back to counting muscles for an uncatalogued exercise", () => {
    expect(exerciseRecoveryMult(null, null, 4)).toBe(COMPOUND_RECOVERY_MULT);
    expect(exerciseRecoveryMult(undefined, undefined, 1)).toBe(1);
  });
});

describe("setCreditMult", () => {
  it.each(parityCases.setCreditCases)(
    "matches the shared parity fixture: reps=$reps rir=$rir rpe=$rpe",
    ({ reps, rir, rpe, expected }) => {
      expect(setCreditMult(reps, rir, rpe)).toBeCloseTo(expected, 10);
    },
  );

  it("makes a heavy set count for more than a long pump set", () => {
    expect(setCreditMult(3)).toBeGreaterThan(setCreditMult(8));
    expect(setCreditMult(8)).toBeGreaterThan(setCreditMult(25));
  });

  it("lets logged effort override the rep guess", () => {
    // 20 reps looks like pump work, but taken to failure it is not.
    expect(setCreditMult(20, 0)).toBeGreaterThan(setCreditMult(20));
  });
});

describe("loadFade", () => {
  it("is full credit for work logged today", () => {
    expect(loadFade("chest", 0)).toBe(1);
  });

  it("halves every quarter-window", () => {
    expect(loadFade("chest", RECOVERY_HOURS.chest / 4)).toBeCloseTo(0.5, 5);
    expect(loadFade("chest", RECOVERY_HOURS.chest / 2)).toBeCloseTo(0.25, 5);
  });

  it("has spent almost all of its credit by the end of the window", () => {
    expect(loadFade("chest", RECOVERY_HOURS.chest)).toBeLessThan(0.07);
  });

  it("fades faster in a fast-recovering muscle", () => {
    expect(loadFade("calves", 24)).toBeLessThan(loadFade("hamstrings", 24));
  });

  it("never rises with age — a muscle must not turn redder the day after training", () => {
    let prev = Infinity;
    for (let h = 0; h <= 168; h += 6) {
      const f = loadFade("chest", h);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });
});

describe("normalizeLoad", () => {
  it("saturates at one hard session's worth of fresh sets", () => {
    expect(normalizeLoad("chest", referenceDose("chest"))).toBe(1);
    expect(normalizeLoad("chest", referenceDose("chest") * 3)).toBe(1); // clamps
  });

  it("reads a nearly-spent residual as fully recovered, never a permanent faint glow", () => {
    expect(normalizeLoad("chest", referenceDose("chest") * (RECOVERED_BELOW / 2))).toBe(0);
  });

  it("judges the same credit against each muscle's own reference dose", () => {
    // Reference dose is MAV/3 floored at 5: chest (20) needs more sets than triceps (14).
    expect(normalizeLoad("triceps", 5)).toBeGreaterThan(normalizeLoad("chest", 5));
  });
});

describe("loadHeat", () => {
  it("keeps the ordering of the underlying loads", () => {
    expect(loadHeat(0.1)).toBeLessThan(loadHeat(0.4));
    expect(loadHeat(0.4)).toBeLessThan(loadHeat(1));
  });

  it("pins both ends of the ramp", () => {
    expect(loadHeat(0)).toBe(0);
    expect(loadHeat(1)).toBe(1);
  });

  it("puts the faintest paintable load at the very start of the ramp, so no part of the gradient goes unused", () => {
    // Nothing under RECOVERED_BELOW is ever drawn, so without the rescale the bottom fifth of the
    // carefully-chosen colour stops would never appear on screen.
    expect(loadHeat(RECOVERED_BELOW)).toBe(0);
    expect(loadHeat(RECOVERED_BELOW * 2)).toBeGreaterThan(0);
  });

  it("spreads the low loads exponential decay produces across the ramp, so a training week reads as more than two or three shades", () => {
    // A day-old and a three-day-old chest session (raw loads ~0.27 and ~0.05) must land on
    // visibly different parts of the gradient.
    const spread = loadHeat(0.27) - loadHeat(0.05);
    expect(spread).toBeGreaterThan(0.25);
  });
});

describe("setStatus", () => {
  it("uses [MEV, MAV] as the productive band", () => {
    const [mev, mav] = SET_TARGET.chest;
    expect(setStatus("chest", mev - 1)).toBe("low");
    expect(setStatus("chest", mev)).toBe("ok");
    expect(setStatus("chest", mav)).toBe("ok");
    expect(setStatus("chest", mav + 1)).toBe("high");
  });

  it("returns null for muscles with no target", () => {
    expect(setStatus("neck", 10)).toBeNull();
  });

  it("keeps SET_TARGET in sync with SET_LANDMARKS", () => {
    for (const [m, { mev, mav }] of Object.entries(SET_LANDMARKS)) {
      expect(SET_TARGET[m]).toEqual([mev, mav]);
    }
  });
});

describe("skippedGroups", () => {
  it("lists big groups with zero worked members", () => {
    const skipped = skippedGroups(new Set(["chest"]));
    expect(skipped).toContain("back");
    expect(skipped).not.toContain("chest");
  });

  it("credits a group as worked if any sub-region member was trained", () => {
    // "back"'s members include lower_traps, not just the parent "traps"/"lats"/"upper_back".
    expect(skippedGroups(new Set(["lower_traps"]))).not.toContain("back");
  });

  it("sorts a skipped group containing a focus muscle first, without dropping the rest", () => {
    const withoutFocus = skippedGroups(new Set(["chest"]));
    const withFocus = skippedGroups(new Set(["chest"]), ["hamstrings"]);
    expect(withFocus[0]).toBe("hamstrings");
    expect(new Set(withFocus)).toEqual(new Set(withoutFocus)); // same members, different order
  });

  it("is unaffected by a focus muscle whose group wasn't skipped", () => {
    const skipped = skippedGroups(new Set(["chest"]), ["chest"]);
    expect(skipped).not.toContain("chest"); // chest was worked, so it's not in the list at all
  });
});

describe("prioritizeFocus", () => {
  it("returns rows unchanged when there are no focus muscles", () => {
    const rows = [{ muscle: "chest" }, { muscle: "biceps" }];
    expect(prioritizeFocus(rows, [])).toEqual(rows);
  });

  it("moves focus-muscle rows first, stable otherwise", () => {
    const rows = [{ muscle: "chest" }, { muscle: "quads" }, { muscle: "triceps" }];
    const sorted = prioritizeFocus(rows, ["triceps"]);
    expect(sorted.map((r) => r.muscle)).toEqual(["triceps", "chest", "quads"]);
  });

  it("does not mutate the input array", () => {
    const rows = [{ muscle: "chest" }, { muscle: "triceps" }];
    const original = [...rows];
    prioritizeFocus(rows, ["triceps"]);
    expect(rows).toEqual(original);
  });
});
