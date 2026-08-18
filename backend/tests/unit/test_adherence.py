"""Unit tests for the adherence pill-row helpers (services._week_day_states /
services._adherence_tone) — pure functions, dates passed in explicitly so nothing is
today()-flaky."""

from datetime import date

from workout_storage.services import _adherence_tone, _week_day_states

MON = date(2026, 7, 13)  # a Monday


def _vols(*days: date) -> list[dict]:
    return [{"id": f"s{i}", "date": d, "volume_kg": 1000.0} for i, d in enumerate(days)]


# --- _week_day_states ---------------------------------------------------------


def test_week_day_states_marks_done_today_future_rest():
    today = date(2026, 7, 16)  # Thursday
    out = _week_day_states(_vols(MON, date(2026, 7, 15)), MON, today)
    assert [d["state"] for d in out] == [
        "done",  # Mon trained
        "rest",  # Tue passed, no session
        "done",  # Wed trained
        "today",  # Thu is today, not yet trained
        "future",
        "future",
        "future",
    ]
    assert [d["date"] for d in out] == [date(2026, 7, 13 + i) for i in range(7)]


def test_week_day_states_trained_today_reads_done_not_today():
    today = date(2026, 7, 16)
    out = _week_day_states(_vols(today), MON, today)
    assert out[3]["state"] == "done"  # the session wins over the "today" marker


def test_week_day_states_empty_week_is_today_plus_future_on_monday():
    out = _week_day_states([], MON, MON)
    assert [d["state"] for d in out] == ["today"] + ["future"] * 6


def test_week_day_states_two_sessions_same_day_still_one_done_pill():
    today = date(2026, 7, 17)
    out = _week_day_states(_vols(MON, MON), MON, today)
    assert out[0]["state"] == "done"
    assert len(out) == 7


# --- _adherence_tone ----------------------------------------------------------


def test_tone_none_without_target():
    assert _adherence_tone(0, None, date(2026, 7, 19)) is None  # Sunday, no target — still None


def test_tone_none_when_target_met():
    assert _adherence_tone(3, 3, date(2026, 7, 19)) is None
    assert _adherence_tone(4, 3, date(2026, 7, 19)) is None  # exceeded


def test_tone_none_early_in_week_even_when_behind():
    assert _adherence_tone(0, 4, MON) is None  # Monday: 7 days left
    assert _adherence_tone(0, 4, date(2026, 7, 17)) is None  # Friday: 3 days left


def test_tone_tense_when_behind_with_two_days_or_fewer_left():
    assert _adherence_tone(1, 4, date(2026, 7, 18)) == "tense"  # Saturday: 2 days left
    assert _adherence_tone(1, 4, date(2026, 7, 19)) == "tense"  # Sunday: 1 day left
