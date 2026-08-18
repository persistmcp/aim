"""U-STATS-1..4: pure statistics functions."""

import math
from datetime import date, timedelta

import pytest

from workout_storage import landmarks, stats


def test_epley_1rm():
    """U-STATS-1."""
    assert stats.epley_1rm(100, 1) == 100
    assert stats.epley_1rm(100, 10) == 100 * (1 + 10 / 30)
    assert stats.epley_1rm(0, 5) == 0
    assert stats.epley_1rm(60, 0) == 60  # reps<=1 → weight itself


def test_session_volume_ignores_warmup_and_null_weight():
    """U-STATS-2."""
    rows = [
        {"type": "working", "weight_kg": 55, "reps": 12},  # 660
        {"type": "working", "weight_kg": 55, "reps": 10},  # 550
        {"type": "warmup", "weight_kg": 40, "reps": 10},  # ignored
        {"type": "working", "weight_kg": None, "reps": None},  # bodyweight → 0
    ]
    assert stats.session_volume(rows) == 660 + 550


def test_volume_counts_all_non_warmup_types():
    """U-STATS-2b: backoff/amrap/dropset count as work; only warmup is excluded."""
    rows = [
        {"type": "working", "weight_kg": 100, "reps": 5},  # 500
        {"type": "backoff", "weight_kg": 80, "reps": 8},  # 640
        {"type": "amrap", "weight_kg": 60, "reps": 20},  # 1200
        {"type": "warmup", "weight_kg": 40, "reps": 10},  # excluded
    ]
    assert stats.session_volume(rows) == 500 + 640 + 1200


def test_progression_top_weight_includes_backoff_excludes_warmup():
    """U-STATS-4b: a heavy backoff set counts toward top weight; a warmup single does not."""
    rows = [
        {"date": date(2026, 6, 1), "type": "warmup", "weight_kg": 120, "reps": 1},
        {"date": date(2026, 6, 1), "type": "backoff", "weight_kg": 90, "reps": 5},
    ]
    points = stats.exercise_progression(rows)
    assert points[0]["top_weight"] == 90


def test_detect_prs_picks_max_top_set():
    """U-STATS-3."""
    rows = [
        {"date": date(2026, 6, 1), "type": "working", "weight_kg": 50, "reps": 10},
        {"date": date(2026, 6, 6), "type": "working", "weight_kg": 60, "reps": 8},
        {"date": date(2026, 6, 6), "type": "warmup", "weight_kg": 80, "reps": 3},  # ignored
    ]
    prs = stats.detect_prs(rows)
    assert prs["best_weight"]["value"] == 60
    assert prs["best_weight"]["date"] == date(2026, 6, 6)


def test_progression_ordered_with_trend():
    """U-STATS-4."""
    rows = [
        {"date": date(2026, 6, 6), "type": "working", "weight_kg": 60, "reps": 10},
        {"date": date(2026, 6, 1), "type": "working", "weight_kg": 50, "reps": 10},
        {"date": date(2026, 6, 1), "type": "working", "weight_kg": 50, "reps": 8},
    ]
    points = stats.exercise_progression(rows)
    assert [p["date"] for p in points] == [date(2026, 6, 1), date(2026, 6, 6)]
    assert points[0]["top_weight"] == 50
    assert points[1]["top_weight"] == 60
    assert stats.trend_pct([p["top_weight"] for p in points]) == 20.0


def test_volume_over_time():
    rows = [
        {"date": date(2026, 6, 6), "volume_kg": 1200},
        {"date": date(2026, 6, 1), "volume_kg": 1000},
    ]
    out = stats.volume_over_time(rows)
    assert [p["date"] for p in out["series"]] == [date(2026, 6, 1), date(2026, 6, 6)]
    assert out["trend_pct"] == 20.0


def test_weekly_muscle_load_primary_full_secondary_half():
    """U-STATS-5: primary → full set + full reps; secondary → half a set, no reps (direct only)."""
    rows = [
        # bench press: chest primary, triceps + front_delts secondary
        {"reps": 10, "primary_muscles": ["chest"], "secondary_muscles": ["triceps", "front_delts"]},
        {"reps": 8, "primary_muscles": ["chest"], "secondary_muscles": ["triceps", "front_delts"]},
        # row: lats primary, biceps secondary
        {"reps": 12, "primary_muscles": ["lats"], "secondary_muscles": ["biceps"]},
    ]
    out = stats.weekly_muscle_load(rows)
    by = {m["muscle"]: m for m in out["muscles"]}
    assert out["total_sets"] == 3
    # chest: 2 full sets, 18 reps, 2 hard sets
    assert by["chest"]["sets"] == 2.0
    assert by["chest"]["reps"] == 18
    assert by["chest"]["hard_sets"] == 2
    # triceps: 2 secondary sets → 1.0 weighted set, 0 direct reps, 0 hard sets
    assert by["triceps"]["sets"] == 1.0
    assert by["triceps"]["reps"] == 0
    assert by["triceps"]["hard_sets"] == 0
    # max_sets == 2.0 (chest); sorted by sets desc → chest first
    assert out["max_sets"] == 2.0
    assert out["muscles"][0]["muscle"] == "chest"


def test_weekly_muscle_load_empty():
    """U-STATS-5b: no sets → empty, zero max (no divide-by-zero downstream)."""
    out = stats.weekly_muscle_load([])
    assert out == {"total_sets": 0, "max_sets": 0.0, "muscles": []}


# --- current_muscle_load (decayed body heatmap) ------------------------------

TODAY = date(2026, 8, 6)


def _sets(n, *, primary, secondary=(), day=TODAY, **kw):
    return [
        {
            "reps": 10,
            "primary_muscles": list(primary),
            "secondary_muscles": list(secondary),
            "date": day,
            **kw,
        }
        for _ in range(n)
    ]


def test_current_muscle_load_fresh_hard_session_saturates():
    """U-STATS-6: the reference dose is what saturates the map — one set under it must NOT."""
    dose = landmarks.reference_dose("chest")
    assert (
        stats.current_muscle_load(_sets(round(dose + 1), primary=["chest"]), today=TODAY)["chest"]
        == 1.0
    )
    assert (
        stats.current_muscle_load(_sets(round(dose) - 1, primary=["chest"]), today=TODAY)["chest"]
        < 1.0
    )


def test_current_muscle_load_half_life_is_a_quarter_of_the_recovery_window():
    """U-STATS-6j: the decay SHAPE, pinned. Without this the whole map can be made to glow for
    days (or vanish in hours) by editing one constant with a fully green suite."""
    dose = landmarks.reference_dose("chest")
    fresh = _sets(round(dose), primary=["chest"], day=TODAY)
    # A quarter-window old → half the credit. chest's window is 66h, so 16.5h ≈ not a whole number
    # of days; use quads (48h → 12h half-life) where 24h is exactly two half-lives.
    quad_dose = landmarks.reference_dose("quads")
    two_half_lives = stats.current_muscle_load(
        _sets(round(quad_dose), primary=["quads"], day=TODAY - timedelta(days=1)), today=TODAY
    )["quads"]
    assert stats.current_muscle_load(fresh, today=TODAY)["chest"] == 1.0
    assert two_half_lives == pytest.approx(0.25, abs=0.01)


def test_current_muscle_load_decays_with_age_never_upward():
    """U-STATS-6b: the same session fades monotonically day by day — never a redder day 2 (the
    real DOMS force deficit does dip further, but a muscle heating up after rest reads as a bug)."""
    loads = [
        stats.current_muscle_load(
            _sets(4, primary=["chest"], day=TODAY - timedelta(days=d)), today=TODAY
        ).get("chest", 0.0)
        for d in range(6)
    ]
    assert loads == sorted(loads, reverse=True)
    assert loads[0] > loads[-1]


def test_current_muscle_load_recovery_speed_differs_by_muscle():
    """U-STATS-6c: identical work fades faster in a fast-recovering muscle. Calves (36h) clear
    well ahead of hamstrings (72h) — the ordering follows the damage literature, not muscle size."""
    two_days_ago = TODAY - timedelta(days=2)
    calves = stats.current_muscle_load(_sets(5, primary=["calves"], day=two_days_ago), today=TODAY)
    hams = stats.current_muscle_load(
        _sets(5, primary=["hamstrings"], day=two_days_ago), today=TODAY
    )
    assert hams["hamstrings"] > calves.get("calves", 0.0)


def test_current_muscle_load_drops_a_muscle_exactly_at_the_recovered_threshold():
    """U-STATS-6d: past its window a muscle is gone from the map, not left faintly glowing — an
    exponential never actually reaches zero. Pins WHERE the cutoff sits by bracketing it, instead
    of picking an age so old that any threshold would pass."""
    dose = landmarks.reference_dose("calves")
    half_lives_to_cutoff = math.log(landmarks.RECOVERED_BELOW, 0.5)
    hours = half_lives_to_cutoff * landmarks.RECOVERY_HOURS["calves"] / landmarks.HALF_LIFE_DIVISOR
    just_under = TODAY - timedelta(days=math.ceil(hours / 24))
    still_lit = TODAY - timedelta(days=math.floor(hours / 24))
    assert "calves" not in stats.current_muscle_load(
        _sets(round(dose), primary=["calves"], day=just_under), today=TODAY
    )
    assert "calves" in stats.current_muscle_load(
        _sets(round(dose), primary=["calves"], day=still_lit), today=TODAY
    )


def test_current_muscle_load_compound_and_failure_sets_linger_longer():
    """U-STATS-6e: same muscle, same age — a compound set and a set taken to failure both hold
    more residual load than plain sub-failure isolation work."""
    yesterday = TODAY - timedelta(days=1)
    iso = stats.current_muscle_load(_sets(4, primary=["quads"], day=yesterday, rir=3), today=TODAY)[
        "quads"
    ]
    compound = stats.current_muscle_load(
        _sets(4, primary=["quads"], secondary=["glutes", "hamstrings"], day=yesterday, rir=3),
        today=TODAY,
    )["quads"]
    failure = stats.current_muscle_load(
        _sets(4, primary=["quads"], day=yesterday, rir=0), today=TODAY
    )["quads"]
    assert compound > iso
    assert failure > iso


def test_current_muscle_load_stacks_across_sessions():
    """U-STATS-6f: two sessions on the same muscle sum — a second chest day while the first is
    still fading reads as more loaded than either alone."""
    rows = _sets(3, primary=["chest"], day=TODAY - timedelta(days=2)) + _sets(
        3, primary=["chest"], day=TODAY
    )
    both = stats.current_muscle_load(rows, today=TODAY)["chest"]
    one = stats.current_muscle_load(_sets(3, primary=["chest"], day=TODAY), today=TODAY)["chest"]
    assert both > one


def test_current_muscle_load_secondary_work_counts_half():
    """U-STATS-6g: indirect work loads a muscle, at half a set's credit."""
    prim = stats.current_muscle_load(_sets(4, primary=["biceps"]), today=TODAY)["biceps"]
    sec = stats.current_muscle_load(_sets(4, primary=["lats"], secondary=["biceps"]), today=TODAY)[
        "biceps"
    ]
    assert 0 < sec < prim


def test_current_muscle_load_empty():
    """U-STATS-6h: no sets → no glowing muscles."""
    assert stats.current_muscle_load([], today=TODAY) == {}


# --- muscle_panel (the two-window seam behind the Home panel) -----------------


def _panel(rows, *, today=None):
    today = today or TODAY
    return stats.muscle_panel(
        rows,
        today=today,
        sets_from=today - timedelta(days=stats.ROLLING_WINDOW_DAYS - 1),
    )


def test_muscle_panel_counts_sets_only_inside_the_rolling_week():
    """U-STATS-7: the two windows differ on purpose — sets are a weekly tally judged against
    weekly MEV/MAV landmarks, so work older than the week must not inflate them."""
    inside = _sets(3, primary=["chest"], day=TODAY - timedelta(days=2))
    outside = _sets(3, primary=["chest"], day=TODAY - timedelta(days=9))
    by = {m["muscle"]: m for m in _panel(inside + outside)["muscles"]}
    assert by["chest"]["sets"] == 3.0


def test_muscle_panel_reports_a_still_loaded_muscle_that_has_no_sets_this_week():
    """U-STATS-7b: the seam that breaks the feature. Work from just outside the set-count window
    can still be glowing; if the panel omitted that muscle the figure would light up a muscle the
    response never mentions, and the list could never explain it."""
    old = _sets(
        22,
        primary=["lower_back"],
        day=TODAY - timedelta(days=stats.ROLLING_WINDOW_DAYS),
        category="isolation",
        movement_pattern="hinge",
        rir=0,
    )
    by = {m["muscle"]: m for m in _panel(old)["muscles"]}
    assert by["lower_back"]["sets"] == 0.0
    assert by["lower_back"]["reps"] == 0
    assert by["lower_back"]["load"] > 0


def test_muscle_panel_marks_a_recovered_muscle_that_was_trained_this_week():
    """U-STATS-7c: the mirror case — sets to show, nothing left to glow."""
    rows = _sets(4, primary=["calves"], day=TODAY - timedelta(days=5))
    by = {m["muscle"]: m for m in _panel(rows)["muscles"]}
    assert by["calves"]["sets"] == 4.0
    assert by["calves"]["load"] == 0.0


def test_muscle_panel_lists_every_muscle_once():
    rows = _sets(4, primary=["chest"], secondary=["triceps"], day=TODAY)
    muscles = [m["muscle"] for m in _panel(rows)["muscles"]]
    assert len(muscles) == len(set(muscles))


def test_load_window_outlasts_the_biggest_plausible_session_including_a_novel_one():
    """U-STATS-8: the invariant LOAD_WINDOW_DAYS exists for. By the time work falls out of the
    fetched rows it must ALREADY read as recovered — otherwise a lit muscle snaps to gray
    overnight, which is the boundary failure this whole model removes, just moved to day 12.

    Asserts on computed load, not on window length: credits stack, so "window <= N days" proves
    nothing about a 30-set session. Worst case throughout — slowest muscle, longest-lingering
    exercise class, taken to failure.
    """
    edge = TODAY - timedelta(days=stats.LOAD_WINDOW_DAYS - 1)
    for muscle in landmarks.RECOVERY_HOURS:
        rows = _sets(
            30,
            primary=[muscle],
            day=edge,
            category="compound",
            movement_pattern="hinge",
            rir=0,
        )
        # exposures={} → first-ever bout, the longest window the model can produce. Omitting this
        # is what let a hardcoded 12-day window look correct while novelty stretched the real tail
        # to 15 days.
        assert muscle not in stats.current_muscle_load(rows, today=TODAY, exposures={}), muscle


def test_load_window_is_longer_than_the_set_count_window():
    """They are two different windows on purpose; collapsing them re-creates the truncation."""
    assert stats.LOAD_WINDOW_DAYS > stats.ROLLING_WINDOW_DAYS


def test_muscle_panel_counts_the_oldest_day_of_the_rolling_week():
    """U-STATS-7d: the boundary day itself. A `>` instead of `>=` silently drops the oldest day,
    so a Monday session vanishes from the tally the following Monday while still glowing."""
    oldest = TODAY - timedelta(days=stats.ROLLING_WINDOW_DAYS - 1)
    by = {m["muscle"]: m for m in _panel(_sets(3, primary=["chest"], day=oldest))["muscles"]}
    assert by["chest"]["sets"] == 3.0
    # …and the day before it is outside: no sets credited (the muscle is only listed at all if it
    # still carries load, which after a full week of chest recovery it does not).
    just_outside = TODAY - timedelta(days=stats.ROLLING_WINDOW_DAYS)
    by2 = {m["muscle"]: m for m in _panel(_sets(3, primary=["chest"], day=just_outside))["muscles"]}
    assert by2.get("chest", {"sets": 0.0})["sets"] == 0.0


def test_current_muscle_load_treats_a_future_dated_session_as_fresh_not_overloaded():
    """U-STATS-6k: server clock behind the logged date (timezone skew, or an assistant logging
    tomorrow's session). A negative age would make 0.5**negative exceed 1 — more than fully
    loaded — instead of clamping to fresh."""
    future = stats.current_muscle_load(
        _sets(2, primary=["chest"], day=TODAY + timedelta(days=3)), today=TODAY
    )
    today = stats.current_muscle_load(_sets(2, primary=["chest"], day=TODAY), today=TODAY)
    assert future == today
    assert future["chest"] <= 1.0


# --- repeated-bout / novelty -------------------------------------------------


def test_exposure_counts_keys_on_muscle_and_movement_not_globally():
    """U-STATS-9: protection is movement-specific — a squatter is not accustomed to hinging — and
    is counted in BOUTS, so four sets on one day are one exposure, not four."""
    rows = (
        _sets(3, primary=["quads"], secondary=["glutes"], movement_pattern="squat", day=TODAY)
        + _sets(
            4,
            primary=["quads"],
            secondary=["glutes"],
            movement_pattern="squat",
            day=TODAY - timedelta(days=3),
        )
        + _sets(2, primary=["hamstrings"], movement_pattern="hinge", day=TODAY)
    )
    counts = stats.exposure_counts(rows)
    assert counts[("quads", "squat")] == 2  # two training days, seven sets
    assert counts[("glutes", "squat")] == 2  # secondary movers are exposed too
    assert counts[("hamstrings", "hinge")] == 1
    assert ("hamstrings", "squat") not in counts


def test_a_whole_first_session_still_reads_as_novel():
    """U-STATS-9g: counting sets let a first-ever four-set session credit itself with three prior
    exposures and read as nearly accustomed. Bouts are the unit."""
    yesterday = TODAY - timedelta(days=1)
    rows = _sets(4, primary=["hamstrings"], day=yesterday, movement_pattern="hinge")
    first_ever = stats.current_muscle_load(
        rows, today=TODAY, exposures=stats.exposure_counts(rows)
    )["hamstrings"]
    naive = stats.current_muscle_load(rows, today=TODAY, exposures={})["hamstrings"]
    assert first_ever == naive


def test_unaccustomed_movement_lingers_longer_than_a_familiar_one():
    """U-STATS-9b: the repeated-bout effect, the one personalization the evidence supports."""
    yesterday = TODAY - timedelta(days=1)
    rows = _sets(4, primary=["hamstrings"], day=yesterday, movement_pattern="hinge")
    novel = stats.current_muscle_load(rows, today=TODAY, exposures={})["hamstrings"]
    accustomed = stats.current_muscle_load(
        rows, today=TODAY, exposures={("hamstrings", "hinge"): 60}
    )["hamstrings"]
    assert novel > accustomed


def test_a_session_does_not_count_as_its_own_prior_exposure():
    """U-STATS-9c: exposures include the very sets being weighed, so a first-ever lift would
    otherwise protect itself and never read as novel."""
    yesterday = TODAY - timedelta(days=1)
    rows = _sets(1, primary=["hamstrings"], day=yesterday, movement_pattern="hinge")
    first_ever = stats.current_muscle_load(
        rows, today=TODAY, exposures=stats.exposure_counts(rows)
    )["hamstrings"]
    naive = stats.current_muscle_load(rows, today=TODAY, exposures={})["hamstrings"]
    assert first_ever == naive


def test_omitting_exposures_treats_every_muscle_as_accustomed():
    """U-STATS-9d: the safe default. Assuming novelty instead would stretch every window by half
    for every caller that never opted in."""
    yesterday = TODAY - timedelta(days=1)
    rows = _sets(4, primary=["hamstrings"], day=yesterday, movement_pattern="hinge")
    assert (
        stats.current_muscle_load(rows, today=TODAY)["hamstrings"]
        == stats.current_muscle_load(rows, today=TODAY, exposures={("hamstrings", "hinge"): 99})[
            "hamstrings"
        ]
    )


def test_novelty_only_ever_lengthens_recovery():
    """U-STATS-9e: the asymmetry rule. Shortening a window tells someone to train; a wrong short
    guess costs an injury, a wrong long one costs a rest day."""
    assert all(m >= 1.0 for _, m in landmarks.NOVELTY_RECOVERY_MULT)
    assert landmarks.novelty_recovery_mult(0) > landmarks.novelty_recovery_mult(100)


def test_novelty_can_stack_with_long_length_work_without_being_clipped():
    """U-STATS-9f: a first-ever Romanian deadlift is the case that most deserves a long window;
    the old ×2.0 cap clipped exactly it."""
    combined = landmarks.STRETCHER_RECOVERY_MULT * landmarks.novelty_recovery_mult(0)
    assert combined <= landmarks.MAX_RECOVERY_MULT


def test_hours_until_recovered_uses_the_same_windows_that_lit_the_bar():
    """U-STATS-10: the countdown must agree with the colour. Computing it from the muscle's BASE
    window instead of the modified one told users a first-ever hinge to failure was clear in ~4
    days while the model kept it lit for ~9."""
    yesterday = TODAY - timedelta(days=1)
    rows = _sets(
        8,
        primary=["lower_back"],
        day=yesterday,
        category="compound",
        movement_pattern="hinge",
        rir=0,
    )
    hours = stats.hours_until_recovered(rows, today=TODAY, exposures={})["lower_back"]
    # Ages are whole days, so check the day either side of the predicted crossing.
    cleared = math.ceil(hours / 24)
    assert "lower_back" not in stats.current_muscle_load(
        rows, today=TODAY + timedelta(days=cleared), exposures={}
    )
    assert (
        stats.current_muscle_load(
            rows, today=TODAY + timedelta(days=cleared - 1), exposures={}
        ).get("lower_back", 0)
        > 0
    )
    # And it is far longer than the unmodified window would suggest — that gap was the bug.
    assert hours > landmarks.RECOVERY_HOURS["lower_back"] * 2


def test_hours_until_recovered_is_zero_for_a_recovered_muscle():
    old = _sets(4, primary=["calves"], day=TODAY - timedelta(days=9))
    assert "calves" not in stats.hours_until_recovered(old, today=TODAY)


def test_muscle_panel_carries_the_countdown_for_every_row():
    rows = _sets(5, primary=["chest"], day=TODAY, category="compound")
    for m in _panel(rows)["muscles"]:
        assert "ready_in_h" in m
        assert (m["ready_in_h"] > 0) == (m["load"] > 0)


# --- intensity and the axial budget ------------------------------------------


def test_intensity_separates_a_heavy_session_from_a_pump_session():
    """U-STATS-11: the model used to treat 5×5 heavy and 5×20 pump as the identical session — it
    read neither weight nor reps. Reps carry the signal because effort is logged on ~0.3% of real
    sets."""
    heavy = stats.current_muscle_load(
        _sets(5, primary=["quads"], reps=5, movement_pattern="squat"), today=TODAY
    )["quads"]
    normal = stats.current_muscle_load(
        _sets(5, primary=["quads"], reps=8, movement_pattern="squat"), today=TODAY
    )["quads"]
    pump = stats.current_muscle_load(
        _sets(5, primary=["quads"], reps=20, movement_pattern="squat"), today=TODAY
    )["quads"]
    assert heavy > normal > pump


def test_logged_effort_overrides_the_rep_guess():
    """U-STATS-11b: 20 reps looks like pump work until someone tells us it went to failure."""
    guessed = stats.current_muscle_load(_sets(5, primary=["quads"], reps=20), today=TODAY)["quads"]
    told = stats.current_muscle_load(_sets(5, primary=["quads"], reps=20, rir=0), today=TODAY)[
        "quads"
    ]
    assert told > guessed


def test_erectors_are_charged_in_full_for_axial_work():
    """U-STATS-11c: the erectors carry the bar on every hinge and back-loaded squat. Charged as a
    half-credit synergist they never passed half full across a week of axial work — the one tissue
    a coach actually rations."""
    hinge = stats.current_muscle_load(
        _sets(5, primary=["hamstrings"], secondary=["lower_back"], movement_pattern="hinge"),
        today=TODAY,
    )["lower_back"]
    press = stats.current_muscle_load(
        _sets(
            5,
            primary=["chest"],
            secondary=["lower_back"],
            movement_pattern="horizontal_push",
        ),
        today=TODAY,
    )["lower_back"]
    assert hinge > press


def test_a_muscle_listed_as_both_primary_and_secondary_is_paid_once():
    """U-STATS-11d: the catalog is LLM-authored and an exercise can list the same muscle twice;
    it would otherwise be credited 1.5 sets for one set."""
    doubled = stats.current_muscle_load(
        _sets(4, primary=["chest"], secondary=["chest", "triceps"]), today=TODAY
    )["chest"]
    once = stats.current_muscle_load(
        _sets(4, primary=["chest"], secondary=["triceps"]), today=TODAY
    )["chest"]
    assert doubled == once


def test_axial_credit_does_not_leak_to_muscles_listed_after_it():
    """U-STATS-11e: the axial override was written by reassigning the loop's credit variable, so
    every muscle listed AFTER lower_back in the same secondary list inherited full credit — a 2×
    error in painted load decided purely by field ordering in an LLM-authored catalog, and the
    TypeScript mirror computed it correctly, so the two sides painted different figures."""
    first = stats.current_muscle_load(
        _sets(
            1,
            primary=["quads"],
            secondary=["lower_back", "glutes", "hamstrings"],
            movement_pattern="squat",
        ),
        today=TODAY,
    )
    last = stats.current_muscle_load(
        _sets(
            1,
            primary=["quads"],
            secondary=["glutes", "hamstrings", "lower_back"],
            movement_pattern="squat",
        ),
        today=TODAY,
    )
    assert first == last
    # …and the ordinary synergists really are on half credit, not the axial one.
    assert first["glutes"] < first["lower_back"]
