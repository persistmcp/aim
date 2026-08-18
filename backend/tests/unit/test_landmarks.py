"""Parity guard: server-side MEV/MAV landmarks must match the frontend copy in muscle.ts.

The server (landmarks.py) is the source of truth consumed by coaching prompts and exposed at
GET /api/landmarks; the web app still carries a mirror in web/src/app/lib/muscle.ts until it
switches to the endpoint. This test fails if the two drift.
"""

import json
import re
from pathlib import Path

import pytest

from workout_storage import landmarks as landmarks_mod
from workout_storage import stats as stats_mod
from workout_storage.landmarks import (
    COMPOUND_RECOVERY_MULT,
    FAILURE_RECOVERY_MULT,
    ISOLATION_RECOVERY_MULT,
    LANDMARK_ALIAS,
    MAX_RECOVERY_MULT,
    RECOVERY_HOURS,
    SET_LANDMARKS,
    STRETCHER_RECOVERY_MULT,
    annotate_weekly_sets,
    exercise_recovery_mult,
    landmarks_for,
    recovery_hours_for,
    reference_dose,
    set_credit_mult,
    status_for,
)

MUSCLE_TS = Path(__file__).parents[3] / "web" / "src" / "app" / "lib" / "muscle.ts"


def _parse_ts():
    src = MUSCLE_TS.read_text(encoding="utf-8")
    landmarks_src = src.split("export const SET_LANDMARKS")[1].split("};")[0]
    landmarks = {
        m.group(1): {"mev": int(m.group(2)), "mav": int(m.group(3))}
        for m in re.finditer(r"(\w+):\s*\{\s*mev:\s*(\d+),\s*mav:\s*(\d+)\s*\}", landmarks_src)
    }
    alias_src = src.split("const LANDMARK_ALIAS")[1].split("};")[0]
    aliases = {m.group(1): m.group(2) for m in re.finditer(r'(\w+):\s*"(\w+)"', alias_src)}
    recovery_src = src.split("export const RECOVERY_HOURS")[1].split("};")[0]
    recovery = {m.group(1): int(m.group(2)) for m in re.finditer(r"(\w+):\s*(\d+),", recovery_src)}
    scalars = {
        m.group(1): float(m.group(2))
        for m in re.finditer(r"(?:export )?const ([A-Z][A-Z0-9_]+) = ([\d.]+);", src)
    }
    patterns_src = src.split("STRETCHER_PATTERNS = new Set(")[1].split(")")[0]
    scalars["STRETCHER_PATTERNS"] = frozenset(re.findall(r'"(\w+)"', patterns_src))
    return landmarks, aliases, recovery, scalars


def test_landmarks_match_frontend():
    ts_landmarks, ts_aliases, _, _ = _parse_ts()
    assert ts_landmarks, "failed to parse SET_LANDMARKS from muscle.ts"
    assert ts_landmarks == SET_LANDMARKS
    assert ts_aliases == LANDMARK_ALIAS


def test_recovery_windows_match_frontend():
    """The body heatmap's decay is computed on BOTH sides (server endpoint + client fallback for
    older deployments and demo mode), so drift here would paint two different maps."""
    _, _, ts_recovery, ts_scalars = _parse_ts()
    assert ts_recovery, "failed to parse RECOVERY_HOURS from muscle.ts"
    assert ts_recovery == RECOVERY_HOURS
    # EVERY constant the decay depends on, not just the windows: the modifiers decide whether a
    # hinge outlasts a curl, the divisor decides the whole decay shape, and the cutoff decides when
    # a muscle goes gray. Drift in any of them paints two different maps (server vs the client
    # fallback that runs in demo mode and against older deployments) with a green suite.
    expected = {
        "STRETCHER_RECOVERY_MULT": landmarks_mod.STRETCHER_RECOVERY_MULT,
        "COMPOUND_RECOVERY_MULT": landmarks_mod.COMPOUND_RECOVERY_MULT,
        "ISOLATION_RECOVERY_MULT": landmarks_mod.ISOLATION_RECOVERY_MULT,
        "FAILURE_RECOVERY_MULT": landmarks_mod.FAILURE_RECOVERY_MULT,
        "MAX_RECOVERY_MULT": landmarks_mod.MAX_RECOVERY_MULT,
        "HALF_LIFE_DIVISOR": landmarks_mod.HALF_LIFE_DIVISOR,
        "RECOVERED_BELOW": landmarks_mod.RECOVERED_BELOW,
        "DEFAULT_RECOVERY_HOURS": landmarks_mod.DEFAULT_RECOVERY_HOURS,
        "MIN_REFERENCE_DOSE": landmarks_mod.MIN_REFERENCE_DOSE,
        "DEFAULT_REFERENCE_DOSE": landmarks_mod.DEFAULT_REFERENCE_DOSE,
        "ROLLING_WINDOW_DAYS": float(stats_mod.ROLLING_WINDOW_DAYS),
        "LOAD_WINDOW_DAYS": float(stats_mod.LOAD_WINDOW_DAYS),
        "STRETCHER_PATTERNS": landmarks_mod.STRETCHER_PATTERNS,
    }
    missing = {k for k in expected if k not in ts_scalars}
    assert not missing, f"muscle.ts is missing (or renamed) {sorted(missing)}"
    assert {k: ts_scalars[k] for k in expected} == expected


# --- recovery kinetics -------------------------------------------------------


def test_recovery_hours_resolve_sub_region_alias():
    assert recovery_hours_for("rhomboids") == RECOVERY_HOURS["upper_back"]
    assert recovery_hours_for("upper_chest") == RECOVERY_HOURS["chest"]


def test_recovery_ordering_is_about_train_again_time_not_damage_magnitude():
    """The table answers "when is the next bout reasonable", which is not the same question as
    "how much damage did this bout cause". Arms are the most damage-prone limb muscles (Chen 2011)
    and yet sit BELOW quads here, because 48h between direct arm work is routine — a coaching
    review corrected an earlier version that followed the damage ranking directly."""
    assert RECOVERY_HOURS["biceps"] < RECOVERY_HOURS["quads"]
    assert RECOVERY_HOURS["hamstrings"] > RECOVERY_HOURS["quads"]
    assert RECOVERY_HOURS["lower_back"] == max(RECOVERY_HOURS.values())


def test_compound_and_failure_extend_recovery():
    base = RECOVERY_HOURS["quads"]
    assert recovery_hours_for("quads", exercise_mult=COMPOUND_RECOVERY_MULT) > base
    assert recovery_hours_for("quads", to_failure=True) > base


def test_no_combination_of_modifiers_exceeds_the_cap():
    """The cap is a guard for future modifiers: assert over EVERY combination the model can
    actually produce, not one hand-picked pair that happens to sit under it."""
    worst = max(
        exercise_recovery_mult(cat, pat, muscles_involved=n)
        * (FAILURE_RECOVERY_MULT if failed else 1.0)
        for cat in (None, "compound", "isolation", "core", "cardio", "mobility")
        for pat in (None, "hinge", "lunge", "squat", "horizontal_push", "isolation")
        for n in (1, 3, 6)
        for failed in (False, True)
    )
    assert worst <= MAX_RECOVERY_MULT


def test_long_length_work_outranks_the_category_it_is_catalogued_under():
    """Deliberate precedence: a Nordic curl / back extension is catalogued isolation but is the
    canonical long-length eccentric, so the pattern decides. Guards against someone 'fixing' the
    order to check category first."""
    nordic = exercise_recovery_mult("isolation", "hinge", muscles_involved=1)
    curl = exercise_recovery_mult("isolation", "isolation", muscles_involved=1)
    assert nordic > curl
    assert nordic == STRETCHER_RECOVERY_MULT


def test_core_and_cardio_are_classified_rather_than_guessed():
    """Real ExerciseCategory members that used to fall through to the muscle-count guess — a
    hanging leg raise listing abs+obliques+hip flexors would have been billed as a compound."""
    assert exercise_recovery_mult("core", "core", muscles_involved=3) == ISOLATION_RECOVERY_MULT
    assert exercise_recovery_mult("cardio", "cardio", muscles_involved=4) == 1.0
    assert exercise_recovery_mult("mobility", None, muscles_involved=4) == 1.0


PARITY_FIXTURE = (
    Path(__file__).parents[3] / "web" / "src" / "app" / "lib" / "recoveryParity.fixture.json"
)


def test_exercise_recovery_mult_matches_the_shared_parity_fixture():
    """The multiplier is a BRANCHING decision (pattern beats category, five categories, a
    muscle-count fallback), and both sides run in production. Comparing scalar constants alone let
    the client handle two of the five categories while the server handled all five, so both suites
    assert the same case table. muscle.test.ts asserts the other half."""
    cases = json.loads(PARITY_FIXTURE.read_text(encoding="utf-8"))["cases"]
    assert cases, "parity fixture is empty"
    for c in cases:
        got = exercise_recovery_mult(
            c["category"],
            c["pattern"],
            muscles_involved=c["muscles"],
            long_length=c.get("long_length"),
        )
        assert got == pytest.approx(c["expected"]), (
            f"category={c['category']} pattern={c['pattern']} muscles={c['muscles']} "
            f"long_length={c.get('long_length')}: expected {c['expected']}, got {got}"
        )


def test_tier_credit_matches_the_shared_parity_fixture():
    """The per-tier credit a single set deposits — including the axial promotion and the categories
    that deposit nothing — is duplicated in web/src/app/lib/muscleVolume.ts. Nothing compared the
    two until a review found the axial rule paying a stabiliser listing like a primary mover on
    both sides at once."""
    from datetime import date

    cases = json.loads(PARITY_FIXTURE.read_text(encoding="utf-8"))["creditCases"]
    assert cases
    today = date(2026, 1, 15)
    for c in cases:
        row = {
            "date": today,
            "category": c["category"],
            "movement_pattern": c["pattern"],
            "primary_muscles": c["primary"],
            "secondary_muscles": c["secondary"],
            "tertiary_muscles": c["tertiary"],
            "reps": 10,
            "rir": 3,
        }
        contribs = stats_mod._load_contributions([row], today=today)
        # One set, aged zero days: the remaining credit IS the tier weight times the intensity
        # multiplier, so dividing it back out leaves the tier weight itself.
        intensity = landmarks_mod.set_credit_mult(10, 3, None)
        got = sum(credit for credit, _ in contribs.get(c["muscle"], [])) / intensity
        assert got == pytest.approx(c["expected"]), (
            f"{c['_why']}: expected {c['expected']}, got {got}"
        )


def test_set_credit_matches_the_shared_parity_fixture():
    """Intensity scales how much a set deposits, and both copies run in production."""
    cases = json.loads(PARITY_FIXTURE.read_text(encoding="utf-8"))["setCreditCases"]
    assert cases
    for c in cases:
        got = set_credit_mult(c["reps"], c["rir"], c["rpe"])
        assert got == pytest.approx(c["expected"]), c


def test_heavy_sets_deposit_more_than_long_pump_sets():
    assert set_credit_mult(3) > set_credit_mult(8) > set_credit_mult(25)
    # Logged effort beats the rep guess: 20 reps to failure is not pump work.
    assert set_credit_mult(20, 0) > set_credit_mult(20)


def test_exercise_type_is_read_from_the_catalog_not_guessed_from_muscle_count():
    """Both real cases the muscle-count guess gets wrong in the production catalog: a hip thrust
    is a compound lift that lists only 2 muscles, a face pull is isolation work that lists 3."""
    hip_thrust = exercise_recovery_mult("compound", "hinge", muscles_involved=2)
    face_pull = exercise_recovery_mult("isolation", "horizontal_pull", muscles_involved=3)
    assert hip_thrust > 1.0
    assert face_pull < 1.0


def test_long_length_work_lingers_longest():
    """Hinges and lunges load the muscle at long length — the slowest-recovering exercise class."""
    rdl = exercise_recovery_mult("compound", "hinge", muscles_involved=3)
    press = exercise_recovery_mult("compound", "horizontal_push", muscles_involved=3)
    curl = exercise_recovery_mult("isolation", "isolation", muscles_involved=1)
    assert rdl > press > curl


def test_uncatalogued_exercise_falls_back_to_counting_muscles():
    assert exercise_recovery_mult(None, None, muscles_involved=4) == COMPOUND_RECOVERY_MULT
    assert exercise_recovery_mult(None, None, muscles_involved=1) == 1.0


def test_reference_dose_is_one_hard_session_not_a_whole_week():
    assert reference_dose("chest") < SET_LANDMARKS["chest"]["mav"]
    assert reference_dose("full_body") > 0  # unlandmarked muscles still get a usable denominator


def test_alias_resolution():
    assert landmarks_for("upper_chest") == SET_LANDMARKS["chest"]
    assert landmarks_for("rotator_cuff") == SET_LANDMARKS["rear_delts"]
    assert landmarks_for("full_body") is None


# --- status_for (weekly_volume goal classification) --------------------------


def test_status_for_unlandmarked_muscle_is_none():
    assert status_for("full_body", 10, "mev") is None


def test_status_for_mev_band_is_floor_only():
    mev = SET_LANDMARKS["chest"]["mev"]
    assert status_for("chest", mev - 1, "mev") == "under"
    assert status_for("chest", mev, "mev") == "in_range"
    assert status_for("chest", SET_LANDMARKS["chest"]["mav"] + 10, "mev") == "in_range"


def test_status_for_mev_mav_band_has_a_ceiling():
    mev, mav = SET_LANDMARKS["chest"]["mev"], SET_LANDMARKS["chest"]["mav"]
    assert status_for("chest", mev - 1, "mev_mav") == "under"
    assert status_for("chest", mev, "mev_mav") == "in_range"
    assert status_for("chest", mav, "mev_mav") == "in_range"
    assert status_for("chest", mav + 1, "mev_mav") == "over"


def test_status_for_mav_band_requires_the_ceiling():
    mav = SET_LANDMARKS["chest"]["mav"]
    assert status_for("chest", mav - 1, "mav") == "under"
    assert status_for("chest", mav, "mav") == "in_range"


def test_status_for_resolves_sub_region_alias():
    mev = SET_LANDMARKS["chest"]["mev"]
    assert status_for("upper_chest", mev, "mev") == "in_range"


def test_mev_mav_is_compared_against_direct_sets_not_assistance_padded_ones():
    """The landmarks are published in direct hard sets. Comparing them against the tally that
    credits a synergist half a set read biceps as "in range" off rows and pulldowns while its
    direct volume sat under the minimum effective dose — and the coach would then stop prescribing
    the curls those numbers were asking for."""
    rows = [{"muscle": "biceps", "sets": 7.0, "reps": 30, "hard_sets": 3}]
    annotated = annotate_weekly_sets(rows)[0]
    assert annotated["direct_sets_last_7d"] == 3
    assert annotated["with_assistance_last_7d"] == 7.0
    # The comparand must fall on the "under" side of MEV, the padded one must not.
    assert status_for("biceps", annotated["direct_sets_last_7d"], "mev") == "under"
    assert status_for("biceps", annotated["with_assistance_last_7d"], "mev") == "in_range"
