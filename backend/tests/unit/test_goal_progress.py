"""Unit tests for the featured-goal rich progress dispatcher (services._featured_goal_progress)
and its week-bucketing helpers — pure functions, no DB. Weekly-bucket tests use
_last_n_week_starts so they're never date-flaky (never hardcode "this week")."""

from workout_storage.services import _featured_goal_progress, _last_n_week_starts

CHEST_SET = {"primary_muscles": ["chest"], "secondary_muscles": ["triceps"]}


def _e1rm_points(*values):
    return [
        {"date": f"2026-0{i + 1}-01", "best_est_1rm": v, "top_weight": v}
        for i, v in enumerate(values)
    ]


# --- weekly_volume -------------------------------------------------------------


def test_weekly_volume_zero_fills_missing_weeks_and_classifies_current():
    weeks = _last_n_week_starts(6)
    rows = [{"date": weeks[-1], "reps": 10, **CHEST_SET} for _ in range(10)]  # chest MEV = 8
    goal = {"target": {"goal_type": "weekly_volume", "muscle": "chest", "band": "mev"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=rows, session_volume_rows=None
    )
    assert out["type"] == "weekly_bands"
    assert len(out["history"]) == 6
    assert out["history"][-1]["sets"] == 10.0
    assert out["history"][-1]["status"] == "in_range"
    # Every earlier week has no logged rows — zero-filled (a real 0, not skipped), and correctly
    # "under" rather than some third "no data" state — there's genuinely no streak to break here.
    assert all(h["sets"] == 0.0 and h["status"] == "under" for h in out["history"][:-1])
    assert out["current_status"] == "in_range"
    assert out["current_sets"] == 10.0
    assert out["landmark"] == {"mev": 8, "mav": 20}


def test_weekly_volume_without_a_muscle_returns_none():
    goal = {"target": {"goal_type": "weekly_volume"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=[], session_volume_rows=None
    )
    assert out is None


def test_weekly_volume_unlandmarked_muscle_returns_null_status_not_a_crash():
    """A muscle with no MEV/MAV entry (e.g. "neck") must degrade gracefully — every week's status
    is None ("no landmark data", per status_for's own docstring), never a crash or a fabricated
    in_range/under guess. landmark itself is also None for the same reason."""
    weeks = _last_n_week_starts(6)
    rows = [{"date": weeks[-1], "reps": 10, "primary_muscles": ["neck"], "secondary_muscles": []}]
    goal = {"target": {"goal_type": "weekly_volume", "muscle": "neck", "band": "mev"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=rows, session_volume_rows=None
    )
    assert out["type"] == "weekly_bands"
    assert out["landmark"] is None
    assert out["current_status"] is None
    assert all(h["status"] is None for h in out["history"])


def test_weekly_volume_mev_mav_band_flags_over_the_ceiling():
    weeks = _last_n_week_starts(6)
    rows = [{"date": weeks[-1], "reps": 10, **CHEST_SET} for _ in range(25)]  # chest MAV = 20
    goal = {"target": {"goal_type": "weekly_volume", "muscle": "chest", "band": "mev_mav"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=rows, session_volume_rows=None
    )
    assert out["current_status"] == "over"


# --- trend -----------------------------------------------------------------------


def test_trend_reports_direction_and_never_a_fixed_percent():
    goal = {"target": {"goal_type": "trend", "exercise_id": "sq1", "metric": "e1rm"}}
    out = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0, 110.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert out["type"] == "trend"
    assert out["direction"] == "up"
    assert out["trend_pct"] == 10.0
    assert "progress_pct" not in out  # no fixed finish line, by design
    assert len(out["series"]) == 2


def test_trend_flat_and_down_directions():
    goal = {"target": {"goal_type": "trend", "exercise_id": "sq1", "metric": "e1rm"}}
    flat = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0, 101.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    down = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0, 80.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert flat["direction"] == "flat"
    assert down["direction"] == "down"


def test_trend_needs_at_least_two_points():
    goal = {"target": {"goal_type": "trend", "exercise_id": "sq1", "metric": "e1rm"}}
    out = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert out is None


def test_trend_without_exercise_id_returns_none():
    goal = {"target": {"goal_type": "trend", "metric": "e1rm"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=None
    )
    assert out is None


# --- maintenance -------------------------------------------------------------------


def test_maintenance_exercise_scoped_tolerance_band():
    goal = {
        "target": {
            "goal_type": "maintenance",
            "exercise_id": "sq1",
            "metric": "weight",
            "baseline_value": 100.0,
            "tolerance_pct": 20,
        }
    }
    out = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0, 70.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert out["type"] == "tolerance"
    assert out["current"] == 70.0
    assert out["drop_pct"] == 30.0
    assert out["status"] == "warn"  # 30% drop > 20% tolerance


def test_maintenance_default_tolerance_is_20_pct_and_within_band_is_ok():
    goal = {
        "target": {
            "goal_type": "maintenance",
            "exercise_id": "sq1",
            "metric": "weight",
            "baseline_value": 100.0,
        }
    }
    out = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(100.0, 90.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert out["tolerance_pct"] == 20.0
    assert out["status"] == "ok"  # 10% drop <= 20% default tolerance


def test_maintenance_muscle_scoped_uses_weekly_history():
    weeks = _last_n_week_starts(5)
    rows = [{"date": weeks[-1], "reps": 10, **CHEST_SET} for _ in range(4)]
    goal = {
        "target": {
            "goal_type": "maintenance",
            "muscle": "chest",
            "baseline_value": 10.0,
            "tolerance_pct": 20,
        }
    }
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=rows, session_volume_rows=None
    )
    assert out["type"] == "tolerance"
    assert out["current"] == 4.0
    assert out["drop_pct"] == 60.0
    assert out["status"] == "warn"


def test_maintenance_total_volume_when_no_exercise_or_muscle_set():
    # `current` is the better of the in-progress week (8000) and the last completed one
    # (10000): a partial week can only improve the reading, never count against it.
    weeks = _last_n_week_starts(5)
    rows = [{"date": weeks[-1], "volume_kg": 8000.0}, {"date": weeks[-2], "volume_kg": 10000.0}]
    goal = {"target": {"goal_type": "maintenance", "baseline_value": 10000.0, "tolerance_pct": 15}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=rows
    )
    assert out["type"] == "tolerance"
    assert out["current"] == 10000.0
    assert out["drop_pct"] == 0.0
    assert out["status"] == "ok"


def test_maintenance_empty_current_week_judged_on_last_completed_week():
    # Monday-morning case: the current ISO week has no sessions yet. Judging its raw 0 against
    # a full-week baseline used to flag a spurious ~100% drop ("warn") at the start of EVERY
    # week — the last completed week is the honest current level.
    weeks = _last_n_week_starts(5)
    rows = [{"date": weeks[-2], "volume_kg": 9500.0}, {"date": weeks[-3], "volume_kg": 10200.0}]
    goal = {"target": {"goal_type": "maintenance", "baseline_value": 10000.0, "tolerance_pct": 15}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=rows
    )
    assert out["current"] == 9500.0
    assert out["status"] == "ok"


def test_maintenance_partial_week_already_above_floor_counts_immediately():
    # The other direction: last completed week was bad, but the in-progress week has already
    # recovered past it — say so now instead of waiting for the week to close.
    weeks = _last_n_week_starts(5)
    rows = [{"date": weeks[-1], "volume_kg": 9800.0}, {"date": weeks[-2], "volume_kg": 4000.0}]
    goal = {"target": {"goal_type": "maintenance", "baseline_value": 10000.0, "tolerance_pct": 15}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=rows
    )
    assert out["current"] == 9800.0
    assert out["status"] == "ok"


def test_maintenance_missing_baseline_returns_none():
    goal = {"target": {"goal_type": "maintenance"}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=None
    )
    assert out is None


def test_maintenance_zero_baseline_returns_none_not_a_division_by_zero():
    """baseline_value=0 is nonsensical (can't 'maintain zero') but must degrade to no rich
    progress, not a ZeroDivisionError from drop_pct's baseline denominator."""
    goal = {
        "target": {
            "goal_type": "maintenance",
            "exercise_id": "sq1",
            "baseline_value": 0,
            "tolerance_pct": 20,
        }
    }
    out = _featured_goal_progress(
        goal,
        progressions={"sq1": _e1rm_points(50.0, 60.0)},
        weekly_muscle_rows=None,
        session_volume_rows=None,
    )
    assert out is None


def test_maintenance_missing_required_data_returns_none_not_a_crash():
    goal = {"target": {"goal_type": "maintenance", "baseline_value": 100.0}}
    out = _featured_goal_progress(
        goal, progressions={}, weekly_muscle_rows=None, session_volume_rows=None
    )
    assert out is None


# --- milestone / frequency: nothing for the rich path to add ---------------------


def test_milestone_and_frequency_have_no_rich_progress():
    milestone = {
        "target": {"goal_type": "milestone", "exercise_id": "sq1", "metric": "e1rm", "value": 100}
    }
    frequency = {"target": {"metric": "sessions_per_week", "value": 4}}
    assert (
        _featured_goal_progress(
            milestone, progressions={}, weekly_muscle_rows=None, session_volume_rows=None
        )
        is None
    )
    assert (
        _featured_goal_progress(
            frequency, progressions={}, weekly_muscle_rows=None, session_volume_rows=None
        )
        is None
    )
