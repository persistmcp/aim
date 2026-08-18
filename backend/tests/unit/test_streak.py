"""Unit tests for the consistency-flame formula (services._streak) — pure function, `today`
passed in explicitly so nothing is date-flaky. The invariants under test are the product
decisions, not incidental numbers: ratio against the user's OWN baseline (light and heavy
trainees rank equally), a rolling window with no reset cliff, median (not mean) volume baseline,
and a volume floor that only ever caps the level down."""

from datetime import date, timedelta

from workout_storage.services import _streak

TODAY = date(2026, 7, 20)


def _vols(days_ago_and_volume: list[tuple[int, float]]) -> list[dict]:
    return [
        {"id": f"s{i}", "date": TODAY - timedelta(days=ago), "volume_kg": vol}
        for i, (ago, vol) in enumerate(days_ago_and_volume)
    ]


def _regular(times_per_week: int, *, weeks: int, volume: float = 5000.0) -> list[dict]:
    """`times_per_week` evenly spread sessions per week for `weeks` back from today."""
    out = []
    for w in range(weeks):
        for k in range(times_per_week):
            out.append((w * 7 + k * (7 // max(times_per_week, 1)), volume))
    return _vols(out)


# --- insufficient data --------------------------------------------------------


def test_no_sessions_ever_is_insufficient():
    assert _streak([], first_session=None, training_days_per_week=3, today=TODAY) == {
        "level": None,
        "basis": "insufficient_data",
    }


def test_under_seven_days_of_history_is_insufficient_even_with_sessions():
    vols = _vols([(0, 5000), (2, 5000)])
    first = TODAY - timedelta(days=2)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out == {"level": None, "basis": "insufficient_data"}


def test_no_baseline_and_no_stated_target_is_insufficient():
    vols = _vols([(i * 3, 5000) for i in range(5)])  # 2 weeks of history, no intake target
    first = TODAY - timedelta(days=14)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out == {"level": None, "basis": "insufficient_data"}


# --- stated-target cold start -------------------------------------------------


def test_cold_start_uses_stated_target_and_matching_rhythm_hits_top_band():
    # 3x/week for 3 weeks, stated target 3x/week → ratio 1.0 → level 6. Doing exactly what you
    # said you would do IS the top of the scale; the old vector put the top at 1.3 and this case
    # read 5, so a user who never missed a session could not reach the top at any target.
    vols = _regular(3, weeks=3)
    first = TODAY - timedelta(days=20)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out["basis"] == "stated_target"
    assert out["level"] == 6
    assert out["heat"] == 1.0


def test_one_missed_session_in_four_weeks_still_holds_the_top_band():
    # The top band opens at 0.86, not 1.0, so it carries a proportional ~14% tolerance: at a
    # 3x/week plan that is 11 of 12 days. Two missed days drops a level — the tolerance is one
    # session, not a free pass.
    vols = _regular(3, weeks=4)[:-1]  # 11 of 12 training days
    first = TODAY - timedelta(days=60)
    assert _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)["level"] == 6
    assert (
        _streak(vols[:-1], first_session=first, training_days_per_week=3, today=TODAY)["level"] == 5
    )


def test_a_stationary_trainee_reads_the_same_level_on_every_day_of_the_week():
    # The window is 28 days, not 30, precisely for this: 30 days is 4.286 weeks, so the same
    # fixed weekly schedule fell 12, 13 or 14 sessions inside it depending only on which weekday
    # `today` was, and the level flickered between two values with no change in behaviour.
    vols = _regular(3, weeks=16)
    first = TODAY - timedelta(days=200)
    levels = {
        _streak(
            [v for v in vols if v["date"] <= TODAY - timedelta(days=d)],
            first_session=first,
            training_days_per_week=3,
            today=TODAY - timedelta(days=d),
        )["level"]
        for d in range(14)
    }
    assert levels == {6}, f"stationary rhythm must not flicker across window phases, got {levels}"


def test_cold_start_short_history_uses_shortened_span_not_the_full_window():
    # 10 days of history, 4 sessions, target 3 → per-week rate uses a 10-day span, not 28 —
    # otherwise a brand-new consistent user would read as far below their own actual rhythm.
    vols = _vols([(0, 5000), (3, 5000), (6, 5000), (9, 5000)])
    first = TODAY - timedelta(days=9)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out["basis"] == "stated_target"
    # 4 days over a 10-day span = 2.8/week vs target 3 → ratio 0.93 → level 6. Divided by a full
    # 28-day window instead, the same data reads 1.0/week → ratio 0.33 → level 2; the shortened
    # span is what keeps a brand-new consistent user honest.
    assert out["level"] == 6


def test_future_dated_sessions_do_not_count_as_training_already_done():
    # Nothing constrains a session's date to the past, and a coach asked to log next week's plan
    # writes real future-dated rows. They must not light the flame.
    vols = _vols([(-i, 5000) for i in range(1, 15)])  # all dated after TODAY
    first = TODAY - timedelta(days=60)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out == {"level": 0, "basis": "stated_target", "heat": 0.0}


def test_two_sessions_on_one_day_count_as_one_training_day():
    # The stated baseline is DAYS per week, so the numerator must be days too — otherwise a coach
    # that splits a training day into a morning and an evening row doubles the ratio, and the
    # level disagrees with the day-ring on the same card.
    one_row = _regular(3, weeks=4)
    two_rows = one_row + [dict(v, id=f"{v['id']}b", volume_kg=3000.0) for v in one_row]
    first = TODAY - timedelta(days=60)
    assert _streak(one_row, first_session=first, training_days_per_week=3, today=TODAY) == _streak(
        two_rows, first_session=first, training_days_per_week=3, today=TODAY
    )


def test_zero_recent_sessions_is_level_zero_not_null():
    # Real history and a real target, but nothing in the last 4 weeks → flame is out (0),
    # which is a statement about now — not "insufficient data".
    vols = _vols([(40, 5000), (45, 5000), (50, 5000)])
    first = TODAY - timedelta(days=50)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out == {"level": 0, "basis": "stated_target", "heat": 0.0}


# --- continuous heat ----------------------------------------------------------


def test_heat_is_continuous_within_a_band_and_agrees_with_level():
    # Same level, more sessions → hotter flame. heat is the banded ratio kept fractional; the
    # published value is rounded to 3 decimals, so it can sit a hair either side of a band edge —
    # allow that tolerance rather than pretending the level is recoverable from it exactly.
    first = TODAY - timedelta(days=60)
    seen = []
    for n in (2, 3, 4, 5, 6):
        days = [5 + i * 4 for i in range(n)]
        vols = _vols([(d, 5000) for d in days])
        out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
        scaled = out["heat"] * 6
        assert out["level"] - 0.003 <= scaled <= out["level"] + 1.003, (out["level"], out["heat"])
        seen.append(out["heat"])
    assert seen == sorted(seen), "heat must grow monotonically with session count"
    assert len(set(seen)) == len(seen), "each extra session must raise heat, not just the band"


# --- behavioral baseline ------------------------------------------------------


def test_behavioral_baseline_steady_rhythm_reaches_the_top_band():
    # 12+ weeks at a steady 3x/week: recent-4-weeks rate vs own 12-week average = 1.0 → level 6.
    # Holding your own rhythm is the top under the behavioural basis too — the old vector needed
    # 1.3, i.e. accelerating past your own trailing average every month, forever.
    vols = _regular(3, weeks=14)
    first = TODAY - timedelta(days=120)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out["basis"] == "behavioral"
    assert out["level"] == 6


def test_light_and_heavy_trainees_rank_equally_at_the_same_rhythm():
    light = _regular(3, weeks=14, volume=800.0)
    heavy = _regular(3, weeks=14, volume=20000.0)
    first = TODAY - timedelta(days=120)
    out_light = _streak(light, first_session=first, training_days_per_week=None, today=TODAY)
    out_heavy = _streak(heavy, first_session=first, training_days_per_week=None, today=TODAY)
    assert out_light["level"] == out_heavy["level"]


def test_training_above_own_normal_also_reaches_level_six():
    # Above your own normal is still the top — the scale saturates at "holding your rhythm"
    # rather than reserving its last band for people who keep accelerating.
    older = [(30 + w * 7, 5000.0) for w in range(9)] + [(33 + w * 7, 5000.0) for w in range(9)]
    recent = [(d, 5000.0) for d in range(0, 28, 2)]
    vols = _vols(older + recent)
    first = TODAY - timedelta(days=95)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out["basis"] == "behavioral"
    assert out["level"] == 6


def test_dropoff_degrades_gradually_not_to_zero():
    # ~3/week baseline, then only 2 sessions in the whole last 30 days → a LOW level, not 0 —
    # the anti-cliff invariant: one bad stretch dims the flame, it never extinguishes history.
    older = [(30 + w * 7 + k, 5000.0) for w in range(9) for k in (0, 2, 4)]
    recent = [(5, 5000.0), (20, 5000.0)]
    vols = _vols(older + recent)
    first = TODAY - timedelta(days=95)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out["level"] is not None and 1 <= out["level"] <= 2


def test_volume_crater_caps_level_down():
    # Same steady 3x/week rhythm, but recent sessions at ~30% of the usual volume — session
    # count alone would say level 6; the volume floor caps it two levels down, to 4.
    older = [(d, 6000.0) for d in range(30, 91, 2)]
    recent = [(d, 1500.0) for d in range(0, 28, 2)]
    vols = _vols(older + recent)
    first = TODAY - timedelta(days=100)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out["basis"] == "behavioral"
    assert out["level"] == 4


def test_outlier_week_in_baseline_does_not_falsely_cap_a_normal_user():
    # Steady 3x/week rhythm, but ONE week's sessions carry a massive outlier volume (same
    # session count — a volume outlier only, so frequency stays clean). Mean baseline math would
    # read the recent normal weeks as < 50% of "usual" volume and cap the level to 4; the median
    # baseline ignores the outlier week entirely, so the steady rhythm keeps its uncapped level.
    vols = _regular(3, weeks=14, volume=5000.0)
    for v in vols:
        if 42 <= (TODAY - v["date"]).days <= 48:
            v["volume_kg"] = 100000.0
    first = TODAY - timedelta(days=120)
    out = _streak(vols, first_session=first, training_days_per_week=None, today=TODAY)
    assert out["basis"] == "behavioral"
    assert out["level"] == 6  # same as the no-outlier steady case — no false cap


def test_stated_target_zero_or_missing_days_guard():
    # training_days_per_week=0 is falsy → falls through to insufficient_data, never divides.
    vols = _vols([(i, 5000.0) for i in range(0, 14, 2)])
    first = TODAY - timedelta(days=14)
    out = _streak(vols, first_session=first, training_days_per_week=0, today=TODAY)
    assert out == {"level": None, "basis": "insufficient_data"}
