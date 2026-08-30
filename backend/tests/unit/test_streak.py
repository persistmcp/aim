"""Unit tests for the consistency-flame formula (services._streak) — pure function, `today`
passed in explicitly so nothing is date-flaky. The invariants under test are the product
decisions, not incidental numbers: the score is measured against the user's OWN cadence (light
and heavy trainees rank equally), the fire decays continuously so nothing ever resets, the level
can NEVER rise on a day without training, one session back is worth a full band at any cadence,
and the volume floor only ever caps the level down.

Rewritten 2026-08-29 with the fuel-gauge model (docs/FLAME_REDESIGN_PLAN.md). Three invariants
from the 2026-08-09 ratio model are deliberately reversed and their tests replaced in place: the
~14% "one missed session still holds the top band" tolerance, the 7-day withholding of the flame
from new users, and level 0 for a long-lapsed user (now an ember at 1)."""

import random
from datetime import date, timedelta

import pytest

from workout_storage.services import _local_today, _own_cadence, _streak

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


def test_a_brand_new_user_sees_the_flame_from_their_very_first_session():
    # REVERSAL of the 2026-08-09 rule that withheld the flame for 7 days. That rule existed only
    # because the ratio model needed a span to divide by, and its effect was that the person most
    # worth encouraging — someone who just signed up and logged their first workout — saw nothing
    # at all. A fuel gauge needs no span. Each of the first five sessions is worth a band.
    first = TODAY - timedelta(days=4)
    ladder = []
    for n in range(1, 4):
        vols = _vols([(4 - 2 * i, 5000) for i in range(n)])
        ladder.append(_streak(vols, first_session=first, training_days_per_week=3, today=TODAY))
    assert [o["level"] for o in ladder] == [2, 3, 4]
    assert all(o["basis"] == "stated_target" for o in ladder)


def test_no_sessions_at_all_is_still_insufficient_not_a_cold_flame():
    # The one remaining null: signed up, nothing logged. "We have not seen you yet" is not the
    # same statement as "your fire is out", and Home falls back to the tile grid on it.
    assert _streak([], first_session=None, training_days_per_week=3, today=TODAY) == {
        "level": None,
        "basis": "insufficient_data",
    }


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


def test_missing_your_own_sessions_costs_a_band_each_and_never_more_than_one_at_a_time():
    # REVERSAL of the 2026-08-09 "~14% tolerance" rule, which held the top band through one missed
    # session in four weeks. The owner's complaint on 2026-08-29 was that ten idle days moved the
    # flame by one band; the tolerance was a deliberate part of why. Grace is now exactly one
    # expected interval (the fuel clip), after which each further missed session costs about a
    # band — graded, never a cliff, and never more than one band per interval.
    first = TODAY - timedelta(days=200)
    vols = _regular(3, weeks=16)
    levels = [
        _streak(
            [v for v in vols if v["date"] <= TODAY - timedelta(days=idle)],
            first_session=first,
            training_days_per_week=3,
            today=TODAY,
        )["level"]
        for idle in (0, 3, 5, 7, 10, 14)
    ]
    assert levels == sorted(levels, reverse=True), f"must fall monotonically, got {levels}"
    assert levels[0] == 6, "on rhythm is the top"
    assert levels[-1] <= 3, f"two idle weeks must be deep in the scale, got {levels[-1]}"
    steps = [a - b for a, b in zip(levels, levels[1:], strict=False)]
    assert max(steps) <= 1, f"no single step may cost more than one band, got {steps}"


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


def test_cold_start_ramps_and_reaches_the_top_on_the_fifth_session():
    # A new user is not penalised for having no history — but neither is the fire full before it
    # has been fed. Five sessions on plan take a cold fire from nothing to the top, identically at
    # any cadence (the per-session gain is a constant fraction of a full fire).
    for target, spacing in ((3, 2), (6, 1)):
        first = TODAY - timedelta(days=spacing * 4)
        levels = [
            _streak(
                _vols([(spacing * (n - 1 - i), 5000) for i in range(n)]),
                first_session=first,
                training_days_per_week=target,
                today=TODAY,
            )["level"]
            for n in range(1, 6)
        ]
        assert levels == [2, 3, 4, 5, 6], f"target {target}: got {levels}"


def test_future_dated_sessions_do_not_count_as_training_already_done():
    # Nothing constrains a session's date to the past, and a coach asked to log next week's plan
    # writes real future-dated rows. They must not light the flame.
    vols = _vols([(-i, 5000) for i in range(1, 15)])  # all dated after TODAY
    first = TODAY - timedelta(days=60)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out == {"level": 0, "basis": "stated_target", "heat": 0.0}


def test_two_sessions_on_one_day_count_as_one_training_day():
    """The cadence is stated in DAYS per week, so the numerator must be days too — otherwise a
    coach that splits a training day into a morning and an evening row doubles the fuel, and the
    level disagrees with the day-ring on the same card.

    Deliberately measured at a level the cap does NOT pin: an earlier version of this test used a
    dense on-rhythm history, where both sides sat at _FUEL_CAP and the equality held no matter how
    the numerator was written. A sparse history is what actually distinguishes days from rows."""
    sparse = _vols([(2, 5000.0), (9, 5000.0), (17, 5000.0), (26, 5000.0)])
    doubled = sparse + [dict(v, id=f"{v['id']}b", volume_kg=3000.0) for v in sparse]
    first = TODAY - timedelta(days=120)
    one_a_day = _streak(sparse, first_session=first, training_days_per_week=3, today=TODAY)
    assert one_a_day["level"] < 6, "fixture must not sit at the cap or it proves nothing"
    assert one_a_day == _streak(doubled, first_session=first, training_days_per_week=3, today=TODAY)


def test_a_long_lapse_leaves_an_ember_not_a_dead_flame():
    # REVERSAL of "no sessions in the last 4 weeks → level 0". Exponential decay never reaches
    # zero, so a lapsed user with real history reads 1, and the widget draws an ember rather than
    # the grey dead outline. The moment someone opens the app after weeks away is the moment they
    # are doing the one thing that can bring them back; a picture of their failure is the worst
    # possible answer, and level 1 is honest without being a verdict.
    vols = _vols([(40, 5000), (45, 5000), (50, 5000)])
    first = TODAY - timedelta(days=50)
    out = _streak(vols, first_session=first, training_days_per_week=3, today=TODAY)
    assert out["level"] == 1
    assert 0 < out["heat"] < 0.34


def test_level_zero_is_reserved_for_nothing_at_all_in_the_fetch_window():
    # Level 0 still exists and still means something specific: real history, but not one session
    # inside the window callers fetch. Distinct from both the ember and insufficient_data.
    first = TODAY - timedelta(days=400)
    out = _streak([], first_session=first, training_days_per_week=3, today=TODAY)
    assert out == {"level": 0, "basis": "stated_target", "heat": 0.0}


# --- continuous heat ----------------------------------------------------------


def test_heat_is_continuous_and_the_top_band_is_not_flat():
    """heat must move on EVERY idle day, including inside the top band.

    It previously saturated: `fractional` got its sub-band term only for levels 1-5, so every
    score from 0.86 to 1.0 published heat exactly 1.0. One flame level is worth ~3.4 rendered
    pixels, so a once-a-week trainee watched a real, monotone decline render as five consecutive
    days of identical pixels — half of the original complaint, and a half no change to the score
    could have fixed. The top band now has its own segment and the normalizer is 7, not 6."""
    first = TODAY - timedelta(days=300)
    for rate in (1, 2, 3, 6):
        heats, levels = [], []
        for idle in range(0, 14):
            last = TODAY - timedelta(days=idle)
            days = [last - timedelta(days=int(i * 7 / rate)) for i in range(40)]
            out = _streak(
                [{"id": str(i), "date": d, "volume_kg": 5000.0} for i, d in enumerate(days)],
                first_session=first,
                training_days_per_week=rate,
                today=TODAY,
            )
            heats.append(out["heat"])
            levels.append(out["level"])
        # floor(fractional) == level must still hold exactly, at every sample
        for h, lv in zip(heats, levels, strict=True):
            assert int(h * 7) == lv or (h == 1.0 and lv == 6), f"heat {h} disagrees with level {lv}"
        assert heats == sorted(heats, reverse=True), f"{rate}/wk: heat must fall, got {heats}"
        # Grace is real and is one expected interval, so a short flat head is CORRECT...
        flat_head = next(i for i, h in enumerate(heats) if h < 1.0)
        assert flat_head <= round(7 / rate) + 1, f"{rate}/wk: grace too long ({flat_head} days)"
        # ...but past it, every single day must move the number.
        tail = heats[flat_head:]
        assert all(b < a for a, b in zip(tail, tail[1:], strict=False)), f"{rate}/wk flat: {tail}"


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


def test_volume_plays_no_part_in_the_level():
    """Removed 2026-08-29. The floor capped the level down when recent tonnage cratered against
    the user's own median, and it could not be made honest: the baseline is a median of the
    user's own recent weeks, so it drifts onto whatever they are doing now — a permanent halving
    read as capped for two months and then released with a two-level jump (4 -> 6 on day 63), and
    making the windows disjoint only moved the jump from week 7 to week 9. It was also a sliding
    today-anchored comparison that could flip on a day with no training, which is the one thing
    this metric may never do (see the fuzz test below). It had never executed on a real user.

    The flame is a regularity instrument. A real volume decline is the coach's to raise in the
    weekly review, where the actual numbers are."""
    first = TODAY - timedelta(days=300)
    days = [d for d in range(300) if d % 7 in (0, 2, 4)]
    normal = _vols([(d, 10000.0) for d in days])
    crashed = _vols([(d, 500.0 if d <= 28 else 10000.0) for d in days])
    halved_forever = _vols([(d, 5000.0) for d in days])
    out = [
        _streak(v, first_session=first, training_days_per_week=3, today=TODAY)
        for v in (normal, crashed, halved_forever)
    ]
    assert {o["level"] for o in out} == {6}, f"volume must not move the level, got {out}"


def test_stated_target_zero_or_missing_days_guard():
    # training_days_per_week=0 is falsy → falls through to insufficient_data, never divides.
    vols = _vols([(i, 5000.0) for i in range(0, 14, 2)])
    first = TODAY - timedelta(days=14)
    out = _streak(vols, first_session=first, training_days_per_week=0, today=TODAY)
    assert out == {"level": None, "basis": "insufficient_data"}


# --- structural invariants ----------------------------------------------------
# These are the properties the 2026-08-29 review was built around. Each one is a whole class of
# bug that the pre-rework model shipped to production, so they are asserted over families of
# histories rather than single hand-picked cases.


def _train(rate: float, *, days: int, offset: int = 0) -> list[dict]:
    """`rate` sessions/week, evenly spaced, ending today (offset = idle days at the end)."""
    step = 7.0 / rate
    out, n = [], 0
    while round(n * step) + offset < days:
        out.append((round(n * step) + offset, 5000.0))
        n += 1
    return _vols(out)


def test_the_level_never_rises_on_an_idle_day_across_random_histories():
    """The flagship invariant, fuzzed — because the hand-built version missed a real bug.

    The earlier version of this test gave every session an identical volume, and the volume floor
    (removed 2026-08-29) was a sliding today-anchored comparison that could release on a day with
    no training and jump the level up. With realistic volume spread this fuzz found 329 such days;
    with the floor gone it finds none. Randomised deliberately: the defect lived in the INTERACTION
    of two components, which is exactly what hand-picked cases do not reach."""
    rng = random.Random(20260829)
    first = TODAY - timedelta(days=240)
    for _ in range(60):
        # Inter-session gaps, not a uniform sample: `rng.sample(range(240), 90)` never produces a
        # gap longer than ~18 days, and the branches that break during a layoff (the cadence
        # baseline sliding off the fetched rows, the store decaying below every band) only wake up
        # after six weeks of silence. Draw the gaps directly, with a heavy tail.
        days, cursor = [], rng.randrange(0, 30)
        while cursor < 240:
            days.append(cursor)
            cursor += rng.choice([1, 2, 2, 3, 3, 4, 7, 14, 30, 45, 60])
        if len(days) < 4:
            continue
        vols = _vols([(d, rng.choice([500.0, 2000.0, 5000.0, 12000.0, 20000.0])) for d in days])
        trained = {v["date"] for v in vols}
        target = rng.choice([None, 2, 3, 4, 6])
        previous = None
        for idle in range(150, 0, -1):
            day = TODAY - timedelta(days=idle)
            level = _streak(vols, first_session=first, training_days_per_week=target, today=day)[
                "level"
            ]
            if previous is not None and level is not None and day not in trained:
                assert level <= previous, f"level rose {previous} -> {level} on idle day {day}"
            previous = level


def test_the_level_can_never_rise_on_a_day_without_training():
    # THE defect that started the rework: the old 84-day baseline contained the 28-day window it
    # was judged against, so idling shrank numerator and denominator together. In production on
    # 2026-08-27 the owner's level went 5 -> 6 on the ninth day of a layoff. A score that improves
    # while you do nothing is not a consistency score.
    first = TODAY - timedelta(days=400)
    for rate in (1, 2, 3, 4, 6):
        vols = _train(rate, days=400)
        levels = [
            _streak(
                [v for v in vols if v["date"] <= TODAY - timedelta(days=idle)],
                first_session=first,
                training_days_per_week=int(rate),
                today=TODAY,
            )["level"]
            for idle in range(0, 60)
        ]
        assert levels == sorted(levels, reverse=True), f"{rate}/wk rises while idle: {levels}"


def test_every_cadence_holds_the_top_band_without_flicker():
    # The scale is relative to the user's OWN rhythm, so a 1x/week and a 7x/week trainee who never
    # miss must both read 6 — and must read it on every day of the week, not only on the days they
    # happen to train.
    first = TODAY - timedelta(days=400)
    for rate in (1, 2, 3, 4, 5, 6, 7):
        vols = _train(rate, days=400)
        levels = {
            _streak(
                [v for v in vols if v["date"] <= TODAY - timedelta(days=d)],
                first_session=first,
                training_days_per_week=int(rate),
                today=TODAY - timedelta(days=d),
            )["level"]
            for d in range(28)
        }
        assert levels == {6}, f"{rate}/wk on rhythm must be a flat 6, got {levels}"


def test_cramming_a_month_of_sessions_into_five_days_is_not_top_consistency():
    # The ratio model counted days in a window and did not care how they were distributed, so five
    # sessions crammed into five days and then three weeks of nothing read as top consistency at
    # every phase of the cycle. On the last day of the binge a hot fire is honest — the person did
    # just train five days running — so the invariant is about the CYCLE, not a single day: a
    # binger must not live at the top the way someone on rhythm does.
    first = TODAY - timedelta(days=200)
    binge = _vols([(d, 5000) for cycle in range(0, 200, 28) for d in range(cycle, cycle + 5)])
    levels = [
        _streak(
            [v for v in binge if v["date"] <= TODAY - timedelta(days=d)],
            first_session=first,
            training_days_per_week=3,
            today=TODAY - timedelta(days=d),
        )["level"]
        for d in range(28)
    ]
    assert sum(1 for x in levels if x == 6) <= 7, f"binger sits at the top too often: {levels}"
    assert min(levels) <= 2, f"three idle weeks must show, got {levels}"


def test_one_session_back_is_worth_a_band_at_every_cadence():
    # The seeded coaching prompt promises the user that the flame "recovers by simply training
    # again, nothing is broken". That promise has to be true in the arithmetic, not just the copy.
    first = TODAY - timedelta(days=200)
    for rate in (2, 3, 4, 6):
        lapsed = _train(rate, days=200, offset=14)
        before = _streak(
            lapsed, first_session=first, training_days_per_week=int(rate), today=TODAY
        )["level"]
        after = _streak(
            lapsed + _vols([(0, 5000)]),
            first_session=first,
            training_days_per_week=int(rate),
            today=TODAY,
        )["level"]
        assert after >= before + 1, f"{rate}/wk: {before} -> {after} after training again"


def test_you_can_never_be_scored_against_less_than_you_actually_train():
    """The protection `max(stated, behaviour)` actually gives, stated precisely.

    An earlier version of this test asserted the stronger "restating a lower target cannot raise
    the level", and passed only because it chose a case where `stated == behaviour`. That stronger
    claim is false, and it is false because it SHOULD be: lowering your stated target is a
    legitimate plan change, and someone who trains twice a week and now says their plan is twice a
    week is genuinely on rhythm. The coach is instructed to lower `training_days_per_week` when
    reality diverges (COACHING_PLAN §9.2); the flame following it is the feature.

    What `max()` does buy is the half that matters: nobody can be judged against LESS than they
    actually do, so a five-a-week trainee cannot claim a one-a-week plan and coast on it."""
    first = TODAY - timedelta(days=200)
    busy = _train(5, days=200, offset=3)
    honest = _streak(busy, first_session=first, training_days_per_week=5, today=TODAY)["level"]
    claimed = _streak(busy, first_session=first, training_days_per_week=1, today=TODAY)["level"]
    assert claimed == honest, f"claiming an easy target must change nothing: {honest} -> {claimed}"


def test_deleting_history_cannot_raise_the_level_while_a_stated_target_stands():
    """`delete_session` is an exposed MCP tool, and under the old ratio model deleting everything
    older than the window sent the score to its arithmetic maximum — the baseline was measured
    from the very rows being deleted. It cannot do that here while a stated target stands, which
    is 6 of 7 production profiles.

    KNOWN AND ACCEPTED: with NO stated target the cadence is the behavioural term alone, so
    deleting old rows can lower the bar. It is the user's own training log, the number is visible
    only to them, and the only person deceived is the one doing it."""
    first = TODAY - timedelta(days=200)
    full = _train(2, days=200)
    trimmed = [v for v in full if (TODAY - v["date"]).days <= 28]
    before = _streak(full, first_session=first, training_days_per_week=2, today=TODAY)["level"]
    after = _streak(trimmed, first_session=first, training_days_per_week=2, today=TODAY)["level"]
    assert after <= before, f"deleting history raised the level {before} -> {after}"


def test_a_baseline_window_that_runs_off_the_fetched_rows_is_refused_not_guessed():
    """Regression for a rise-while-idle defect found in review on 2026-08-29.

    Callers fetch a bounded slice of history. Once a layoff is long enough the cadence baseline
    window ([anchor-83, anchor-28]) slides off the front of that slice, and counting whatever
    remains yields a collapsing rate, hence a ballooning interval and half-life, hence a fire that
    decays SLOWER every day. On a real 2x/week history with no stated target the level climbed
    1 -> 3 -> 4 across days 140-150 of doing nothing, then vanished to null on day 160. Both
    halves are wrong: it must not rise while idle, and it must not disappear from someone who had
    a level yesterday."""
    first = TODAY - timedelta(days=500)
    fetched_from = TODAY - timedelta(days=180)
    every_fourth = [TODAY - timedelta(days=d) for d in range(0, 400, 4)]
    levels = []
    for idle in range(80, 200, 5):
        vols = [
            {"id": str(i), "date": d - timedelta(days=idle), "volume_kg": 5000.0}
            for i, d in enumerate(every_fourth)
        ]
        vols = [v for v in vols if fetched_from <= v["date"] <= TODAY]
        out = _streak(
            vols,
            first_session=first,
            training_days_per_week=None,
            today=TODAY,
            fetched_from=fetched_from,
        )
        assert out["level"] is not None, f"the flame vanished at {idle} idle days: {out}"
        levels.append(out["level"])
    assert levels == sorted(levels, reverse=True), f"level rose during a layoff: {levels}"
    assert levels[-1] == 0, f"after months away the fire is out, got {levels[-1]}"


def test_the_fuel_store_is_clipped_so_out_training_your_plan_banks_no_credit():
    """The clip on the STORE (not just the published score) is what makes grace exactly one
    expected interval for everyone. Without it, someone who trains far above their own plan
    accumulates invisible headroom and the first days of a layoff cost them nothing — which is
    precisely the inertia the 2026-08-29 rework existed to remove.

    Measured as: a month of daily training against a 3x/week plan must decay on the same schedule
    as a month of exactly-3x/week training. The two must not diverge once the fire is full."""
    first = TODAY - timedelta(days=200)
    for idle in (5, 8, 12):
        # Both people have the SAME cadence — 3x/week over the 8 weeks the baseline reads, so both
        # are judged against 3. The only difference is a burst of daily training in the last few
        # weeks, which is inside the scored stretch and outside the baseline. Without the clip on
        # the store that burst banks headroom the idle days then have to eat through first.
        older = [(idle + 28 + int(i * 7 / 3), 5000.0) for i in range(80)]
        on_plan = _vols(older + [(idle + int(i * 7 / 3), 5000.0) for i in range(12)])
        burst = _vols(older + [(idle + d, 5000.0) for d in range(28)])
        a = _streak(on_plan, first_session=first, training_days_per_week=3, today=TODAY)
        b = _streak(burst, first_session=first, training_days_per_week=3, today=TODAY)
        assert a["basis"] == b["basis"], (a, b)  # same cadence, so the same yardstick
        assert a["level"] == b["level"], (
            f"after {idle} idle days: on-plan {a['level']} vs burst {b['level']} — credit banked"
        )


def test_own_cadence_window_is_disjoint_from_the_scored_window_at_the_boundary():
    """Off-by-one here silently changes the decay speed for everybody, and no behavioural test
    would notice. The baseline must be exactly [anchor-83, anchor-28] — no overlap with the 28-day
    window it is compared against, and no gap either — and it must refuse to answer before it has
    a fortnight of disjoint history to answer from."""
    anchor = TODAY
    trained = {TODAY - timedelta(days=d) for d in range(0, 120)}  # every single day
    for history, expected in ((41, None), (42, 7.0), (84, 7.0), (200, 7.0)):
        got = _own_cadence(
            trained, anchor=anchor, first_session=TODAY - timedelta(days=history - 1)
        )
        assert got == expected, f"history {history}: expected {expected}, got {got}"
    # Nothing inside the baseline window, everything inside the scored one → no cadence to infer.
    recent_only = {TODAY - timedelta(days=d) for d in range(0, 28)}
    assert (
        _own_cadence(recent_only, anchor=anchor, first_session=TODAY - timedelta(days=199)) is None
    )
    # A single day on each edge proves the bounds are inclusive and land where they should.
    assert _own_cadence(
        {anchor - timedelta(days=28)}, anchor=anchor, first_session=TODAY - timedelta(days=199)
    ) == pytest.approx(7 / 56)
    assert _own_cadence(
        {anchor - timedelta(days=83)}, anchor=anchor, first_session=TODAY - timedelta(days=199)
    ) == pytest.approx(7 / 56)
    assert (
        _own_cadence(
            {anchor - timedelta(days=84)}, anchor=anchor, first_session=TODAY - timedelta(days=199)
        )
        is None
    )


def test_a_layoff_is_monotone_even_with_no_stated_target():
    """The structural tests all pass a `training_days_per_week`, which is the branch that CANNOT
    drift — `max(stated, behaviour)` keeps the cadence pinned. Without a stated target the cadence
    is the behavioural term alone, and every defect that has bitten this metric has lived in a
    baseline that moves while the user does not."""
    first = TODAY - timedelta(days=300)
    fetched_from = TODAY - timedelta(days=180)
    for rate in (2, 3, 5):
        levels = []
        for idle in range(0, 120, 3):
            sessions = [TODAY - timedelta(days=idle + int(i * 7 / rate)) for i in range(120)]
            vols = [
                {"id": str(i), "date": d, "volume_kg": 5000.0}
                for i, d in enumerate(sessions)
                if fetched_from <= d <= TODAY
            ]
            out = _streak(
                vols,
                first_session=first,
                training_days_per_week=None,
                today=TODAY,
                fetched_from=fetched_from,
            )
            assert out["level"] is not None, f"{rate}/wk vanished at {idle} idle days"
            levels.append(out["level"])
        assert levels == sorted(levels, reverse=True), f"{rate}/wk rose while idle: {levels}"


# --- the user's own date ------------------------------------------------------


def test_local_today_prefers_the_caller_then_the_stored_timezone_then_utc():
    client = date(2026, 3, 14)
    assert _local_today({"timezone": "Europe/Lisbon"}, client) == client, "caller's clock wins"
    assert _local_today(None, client) == client
    # No caller date → the stored timezone decides. Kiritimati is UTC+14, so it is reliably a day
    # ahead of the server for most of the UTC day; asserting the offset rather than a fixed date
    # keeps this from being a clock-flaky test.
    ahead = _local_today({"timezone": "Pacific/Kiritimati"}, None)
    behind = _local_today({"timezone": "Pacific/Midway"}, None)
    assert (ahead - behind).days in (0, 1, 2), f"{ahead} vs {behind}"
    assert behind <= date.today() <= ahead


def test_local_today_never_raises_on_a_bad_timezone():
    """`users.timezone` is free text written from a client. A dashboard must not 500 because of
    it, and the fallback must be the server's date rather than a guess."""
    for bad in ("not/a/zone", "GMT+5", "+03:00", "Moscow", "", "../../etc/passwd", "x" * 300):
        assert _local_today({"timezone": bad}, None) == date.today(), bad
    assert _local_today({}, None) == date.today()
    assert _local_today(None, None) == date.today()
