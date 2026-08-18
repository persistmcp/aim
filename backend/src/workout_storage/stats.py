"""Pure statistics functions: volume, estimated 1RM, progression, PRs.

All functions take plain rows (dicts) and return plain data, so they unit-test without a DB.
Set rows are expected to carry: ``date``, ``type``, ``weight_kg``, ``reps`` (extra keys ignored).
A ``None`` weight (bodyweight/timed set) contributes 0 to volume.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date
from typing import Any

from . import landmarks


def _f(x: Any) -> float:
    return float(x) if x is not None else 0.0


def epley_1rm(weight: float, reps: int | None) -> float:
    """Epley estimated one-rep max: weight * (1 + reps/30). reps<=1 → the weight itself."""
    if not weight:
        return 0.0
    if reps is None or reps <= 1:
        return float(weight)
    return float(weight) * (1 + reps / 30)


def set_volume(weight: Any, reps: Any) -> float:
    return _f(weight) * _f(reps)


def is_work_set(row: dict[str, Any]) -> bool:
    """Counts toward volume/progression. Everything except warmup sets (working, backoff, dropset,
    amrap, failure all count as real work)."""
    return (row.get("type") or "working") != "warmup"


def session_volume(set_rows: list[dict[str, Any]]) -> float:
    """Σ(weight × reps) over all non-warmup sets."""
    return sum(set_volume(r.get("weight_kg"), r.get("reps")) for r in set_rows if is_work_set(r))


def exercise_progression(set_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One point per training date for an exercise, ordered by date ascending.

    Each point: date, top_weight, best_est_1rm, volume, total_reps, sets.
    """
    by_date: dict[str, Any] = defaultdict(list)
    for r in set_rows:
        if is_work_set(r):
            by_date[r["date"]].append(r)

    points: list[dict[str, Any]] = []
    for d in sorted(by_date):
        rows = by_date[d]
        top_weight = max((_f(r.get("weight_kg")) for r in rows), default=0.0)
        best_1rm = max(
            (epley_1rm(_f(r.get("weight_kg")), r.get("reps")) for r in rows), default=0.0
        )
        points.append(
            {
                "date": d,
                "top_weight": top_weight,
                "best_est_1rm": round(best_1rm, 1),
                "volume": round(
                    sum(set_volume(r.get("weight_kg"), r.get("reps")) for r in rows), 1
                ),
                "total_reps": sum(int(r.get("reps") or 0) for r in rows),
                "sets": len(rows),
            }
        )
    return points


def trend_pct(values: list[float]) -> float | None:
    """Percent change from the first to the last value; None if not computable."""
    nonzero = [v for v in values if v is not None]
    if len(nonzero) < 2 or not nonzero[0]:
        return None
    return round((nonzero[-1] - nonzero[0]) / nonzero[0] * 100, 1)


def detect_prs(set_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Best top-set weight and best estimated 1RM for an exercise, each with its date."""
    best_weight: dict[str, Any] = {"value": 0.0, "date": None, "reps": None}
    best_1rm: dict[str, Any] = {"value": 0.0, "date": None}
    for r in set_rows:
        if not is_work_set(r):
            continue
        w = _f(r.get("weight_kg"))
        if w > best_weight["value"]:
            best_weight = {"value": w, "date": r["date"], "reps": r.get("reps")}
        e = epley_1rm(w, r.get("reps"))
        if e > best_1rm["value"]:
            best_1rm = {"value": round(e, 1), "date": r["date"]}
    return {"best_weight": best_weight, "best_est_1rm": best_1rm}


# Secondary movers get half-credit per set — the common hypertrophy heuristic ("a row trains lats
# fully, biceps partially"). Keeps the weekly per-muscle tally honest without ignoring assistance.
_SECONDARY_WEIGHT = 0.5

# Tertiary movers — stabilisers and minor assistance the pool spells out (upper back on a bench
# press, abs on a standing press). Quarter credit, and the number is a judgement call rather than a
# derivation: the fractional-volume method the 0.5 tier borrows from is binary and defines no third
# tier. Four tertiary listings sum to exactly 1.0, so the tier is NOT too small to matter — it is
# kept out of the numbers that carry a claim instead (MEV/MAV comparands, the repeated-bout
# exposure count, and the axial promotion), and it does enter the painted load, which is why the
# catalogue must not list a muscle as tertiary on half the exercises a session contains. Only the
# curated pool fills this tier; a user-authored exercise that omits it behaves exactly as before.
_TERTIARY_WEIGHT = 0.25

# Categories whose sets are real training but not muscle-building dose, and so deposit nothing on
# the figure. Both were painting things that are not true:
#   * `mobility` — a cat-cow or a hip-flexor stretch names the muscle it MOBILISES, so logging a
#     warm-up put the erectors at 43% load with a three-day countdown from work that imposes no
#     meaningful load at all.
#   * `cardio` — a run lists `full_body` AND the legs, so one set was credited twice under two
#     names; `full_body` is in no landmark or recovery table, so it silently collected every
#     default and saturated a bar the figure cannot even draw.
# They stay in the catalogue and in the program: this excludes them from ONE number, the muscle
# load, which is a resistance-training dose and was never defined for either.
_NON_DOSING_CATEGORIES = frozenset({"mobility", "cardio"})


def counts_as_dose(row: dict[str, Any]) -> bool:
    return (row.get("category") or "") not in _NON_DOSING_CATEGORIES


def weekly_muscle_load(
    rows: list[dict[str, Any]],
    *,
    secondary_weight: float = _SECONDARY_WEIGHT,
    tertiary_weight: float = _TERTIARY_WEIGHT,
) -> dict[str, Any]:
    """Aggregate working sets + reps per muscle group over a list of rows (one row per working set).

    Each row carries the exercise's ``primary_muscles`` / ``secondary_muscles`` lists and the set's
    ``reps``. A set adds 1.0 set to each primary muscle and ``secondary_weight`` to each secondary
    muscle (the "a row trains lats fully, biceps partially" heuristic). ``reps`` counts **direct
    work only** — the reps of sets where the muscle is a primary mover — so the number reads as
    "reps you actually did for this muscle" rather than being padded by fractional assistance.
    ``hard_sets`` likewise counts primary-only sets — the "direct" stimulus the 10–20 sets/week
    guidance is usually stated in.

    Returns ``{total_sets, max_sets, muscles: [{muscle, sets, reps, hard_sets}, …]}`` sorted by
    sets descending.
    """
    sets_by: dict[str, float] = defaultdict(float)
    reps_by: dict[str, int] = defaultdict(int)
    hard_by: dict[str, int] = defaultdict(int)
    total = 0
    for r in rows:
        if not counts_as_dose(r):
            continue
        reps = int(r.get("reps") or 0)
        total += 1
        prim = r.get("primary_muscles") or []
        sec = r.get("secondary_muscles") or []
        for m in prim:
            sets_by[m] += 1.0
            reps_by[m] += reps
            hard_by[m] += 1
        for m in sec:
            if m not in prim:
                sets_by[m] += secondary_weight
        # A muscle already paid at a higher tier is not paid again — the pool forbids listing one
        # in two tiers, but user-authored rows are not validated and the coach writes those.
        for m in r.get("tertiary_muscles") or []:
            if m not in prim and m not in sec:
                sets_by[m] += tertiary_weight
    muscles: list[dict[str, Any]] = [
        {
            "muscle": m,
            "sets": round(sets_by[m], 1),
            "reps": round(reps_by[m]),
            "hard_sets": hard_by.get(m, 0),
        }
        for m in sets_by
    ]
    muscles.sort(key=lambda x: (x["sets"], x["reps"]), reverse=True)
    return {
        "total_sets": total,
        "max_sets": max((x["sets"] for x in muscles), default=0.0),
        "muscles": muscles,
    }


# What the panel's *set counts* cover: a rolling week, today inclusive — NOT a calendar Mon–Sun
# week, which reset the whole heatmap to empty every Monday morning. Stays 7 days because MEV/MAV
# landmarks are stated per week, so a longer tally would read as "over target" against them.
ROLLING_WINDOW_DAYS = 7

# What the *decay* needs to see, which is strictly more than the set-count week — and much more
# than any single muscle's recovery window, which is the confusing part. A single set at base
# clears in 1.5–3.5 days. But credits STACK, the cutoff applies to the summed total, and the
# modifiers multiply the window: the slowest muscle (erectors, 84h) doing long-length work to
# failure that it is unaccustomed to gets 84 × 2.5 = 210h, and thirty such sets stay above
# RECOVERED_BELOW for over fifteen days. Fetch less than that and a visibly lit muscle snaps to
# gray overnight — the boundary failure this whole model exists to remove, just moved to day N.
#
# DERIVED, not hand-picked: a hardcoded 12 was already wrong the moment the novelty multiplier
# landed, and nothing noticed. Recomputed from the constants so it can never drift from them again.
_WORST_SESSION_SETS = 30  # more than anyone puts on one muscle in one session


def _load_window_days() -> int:
    worst_mult = min(
        landmarks.STRETCHER_RECOVERY_MULT
        * landmarks.FAILURE_RECOVERY_MULT
        * landmarks.novelty_recovery_mult(0),
        landmarks.MAX_RECOVERY_MULT,
    )
    worst = 0.0
    for muscle, base in landmarks.RECOVERY_HOURS.items():
        half_life = base * worst_mult / landmarks.HALF_LIFE_DIVISOR
        floor = landmarks.RECOVERED_BELOW * landmarks.reference_dose(muscle)
        # Each set can deposit more than 1.0 of credit once intensity is applied, so the worst
        # session is sets × the heaviest credit a set can carry, not sets alone.
        worst_credit = _WORST_SESSION_SETS * max(
            landmarks.set_credit_mult(1, rir=0), landmarks.HEAVY_SET_CREDIT
        )
        worst = max(worst, half_life * math.log2(worst_credit / floor))
    # +1 because the window is inclusive of today: the OLDEST day it reaches back to is
    # LOAD_WINDOW_DAYS - 1, and that day is the one that has to be recovered already.
    return math.ceil(worst / 24) + 1


LOAD_WINDOW_DAYS = _load_window_days()


def _to_failure(row: dict[str, Any]) -> bool:
    """Was this set taken to (or within a rep of) failure? RIR wins where logged; RPE ≥ 9.5 is the
    same statement on the other scale. Unlogged effort is treated as sub-failure — the modifier
    only ever *extends* recovery, so guessing "hard" on missing data would inflate every user's
    map. In practice almost nothing carries RIR today, which is exactly why exercise type (always
    known from the catalog) and not effort is what makes the load differ between lifts."""
    rir, rpe = row.get("rir"), row.get("rpe")
    if rir is not None:
        return float(rir) <= 0.5
    return rpe is not None and float(rpe) >= 9.5


def exposure_counts(rows: list[dict[str, Any]]) -> dict[tuple[str, str], int]:
    """Training DAYS per (muscle, movement_pattern) — how accustomed each muscle is to a movement.

    Counts distinct days rather than sets, matching how the repeated-bout literature doses
    protection (in bouts) and, practically, so a single first-ever session of four sets cannot
    credit itself with three prior exposures. Rows should span landmarks.NOVELTY_WINDOW_DAYS;
    anything older no longer protects. Mirrors repo.muscle_exposure_counts, which does the same
    aggregation in SQL for the real six-month window.
    """
    days: dict[tuple[str, str], set[Any]] = defaultdict(set)
    for r in rows:
        # A category that deposits no dose buys no protection either — otherwise a daily mobility
        # drill marks a muscle as accustomed and shortens its window on the day it is truly loaded.
        if not counts_as_dose(r):
            continue
        pattern = r.get("movement_pattern") or "other"
        for m in (r.get("primary_muscles") or []) + (r.get("secondary_muscles") or []):
            days[(m, pattern)].add(r.get("date"))
    return {k: len(v) for k, v in days.items()}


def current_muscle_load(
    rows: list[dict[str, Any]],
    *,
    today: date,
    secondary_weight: float = _SECONDARY_WEIGHT,
    exposures: dict[tuple[str, str], int] | None = None,
) -> dict[str, float]:
    """Current decayed load per muscle, 0 (recovered) → 1 (one hard session's worth, fresh).

    Each working set contributes its muscle credit (1.0 primary / ``secondary_weight`` secondary),
    decaying exponentially with a half-life of a quarter of that muscle's recovery window
    (landmarks.RECOVERY_HOURS, stretched or shortened per exercise type, extended for sets taken
    to failure, and extended again when the muscle is unaccustomed to that movement). Credits sum
    — two sessions three days apart stack — and the total is normalized by the muscle's reference
    dose (landmarks.reference_dose) and clamped at 1. A muscle under ``RECOVERED_BELOW`` is
    dropped: an exponential never reaches zero, and a permanently faint glow would read as
    "never recovers".

    ``exposures`` comes from ``exposure_counts`` over the last landmarks.NOVELTY_WINDOW_DAYS and
    enables the repeated-bout stretch. Omitting it treats every muscle as fully accustomed, which
    is the conservative default: assuming novelty instead would silently lengthen every window by
    half for every caller that never opted in.

    Session dates carry no time of day, so ages are whole days — today's work is fully fresh.
    Deliberately monotone: real force deficit dips *further* through the 24–48h DOMS window, but a
    muscle turning redder the day after training reads as a bug, so the curve only ever fades.

    This is what the body heatmap paints — load lingers exactly as long as the physiology says the
    muscle is still recovering, instead of vanishing at a calendar-week boundary.
    """
    return {
        m: load
        for m, load in (
            (m, _normalized(m, sum(c * 0.5 ** (0 / hl) for c, hl in contribs)))
            for m, contribs in _load_contributions(
                rows, today=today, secondary_weight=secondary_weight, exposures=exposures
            ).items()
        )
        if load >= landmarks.RECOVERED_BELOW
    }


def _normalized(muscle: str, credit: float) -> float:
    return round(min(1.0, credit / landmarks.reference_dose(muscle)), 3)


def _load_contributions(
    rows: list[dict[str, Any]],
    *,
    today: date,
    secondary_weight: float = _SECONDARY_WEIGHT,
    tertiary_weight: float = _TERTIARY_WEIGHT,
    exposures: dict[tuple[str, str], int] | None = None,
) -> dict[str, list[tuple[float, float]]]:
    """Per muscle, the list of (credit remaining now, half-life hours) each set contributes.

    Keeping the pieces instead of only their sum is what lets ``hours_until_recovered`` answer
    "when is this clear" using the SAME windows that produced the colour. Collapsing to one number
    first forced the countdown to guess a single half-life, and it guessed the unmodified one —
    telling a user a muscle was clear in 3.8 days while the bar stayed lit for 9.5.
    """
    contribs: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for r in rows:
        if not counts_as_dose(r):
            continue
        age_h = max(0, (today - r["date"]).days) * 24
        prim = r.get("primary_muscles") or []
        sec = r.get("secondary_muscles") or []
        ter = r.get("tertiary_muscles") or []
        ex_mult = landmarks.exercise_recovery_mult(
            r.get("category"),
            r.get("movement_pattern"),
            # Tertiary counts here too: the fallback asks "how many muscles does this lift claim
            # to work", and a custom exercise naming three tiers is not a two-muscle movement.
            muscles_involved=len(prim) + len(sec) + len(ter),
            long_length=r.get("long_length"),
        )
        failure = _to_failure(r)
        pattern = r.get("movement_pattern") or "other"
        # How heavy this set was, from reps (always logged) or effort (rarely). Scales the credit,
        # not the window: a top single deposits more than a back-off set, it does not linger
        # proportionally longer.
        intensity = landmarks.set_credit_mult(r.get("reps"), r.get("rir"), r.get("rpe"))
        # A muscle listed as both primary and secondary on one exercise would otherwise be paid
        # 1.5 sets for one set — reachable, since the catalog is LLM-authored.
        sec_only = [m for m in sec if m not in prim]
        ter_only = [m for m in ter if m not in prim and m not in sec]
        axial_session = pattern in landmarks.AXIAL_PATTERNS
        for tier, (base_credit, muscles) in enumerate(
            (
                (1.0, prim),
                (secondary_weight, sec_only),
                (tertiary_weight, ter_only),
            )
        ):
            for m in muscles:
                # The erectors carry the bar on every hinge and back-loaded squat; treating them as
                # a half-credit synergist there left the one tissue a coach actually rations below
                # half full after a week of axial work. Computed per muscle, NOT by reassigning the
                # loop variable: doing that leaked full credit to every muscle listed after
                # lower_back in the same secondary list, so a muscle's painted load depended on the
                # ordering of an LLM-authored catalog field.
                #
                # Restricted to the two dosed tiers. Tier-blind, it billed a standing cable glute
                # kickback for the erectors exactly as heavily as a 5×3 deadlift (both 0.121),
                # while a loaded hip thrust — which does not list them at all — read zero. A
                # stabiliser listing is the catalogue saying "barely involved"; the axial rule
                # exists to stop a real axial load being under-counted, not to invent one.
                axial = axial_session and m == landmarks.AXIAL_MUSCLE and tier < 2
                credit = 1.0 if axial else base_credit
                if exposures is None:
                    # No exposure history supplied → assume accustomed. Defaulting the other way
                    # would silently stretch every window by 1.5× for every caller that hasn't
                    # opted in.
                    novelty = 1.0
                else:
                    # Subtract this session itself, so a muscle is not counted as accustomed to
                    # the very bout being weighed — otherwise a first-ever lift protects itself.
                    novelty = landmarks.novelty_recovery_mult(
                        max(0, exposures.get((m, pattern), 0) - 1)
                    )
                window = landmarks.recovery_hours_for(
                    m, exercise_mult=ex_mult, to_failure=failure, novelty_mult=novelty
                )
                half_life = window / landmarks.HALF_LIFE_DIVISOR
                contribs[m].append((credit * intensity * (0.5 ** (age_h / half_life)), half_life))
    return dict(contribs)


# Nothing may stay lit longer than the fetch window reaches back, so the search is bounded by it.
def hours_until_recovered(
    rows: list[dict[str, Any]],
    *,
    today: date,
    secondary_weight: float = _SECONDARY_WEIGHT,
    exposures: dict[tuple[str, str], int] | None = None,
) -> dict[str, float]:
    """Hours until each muscle's summed load falls under RECOVERED_BELOW.

    Solved numerically because the total is a sum of exponentials with DIFFERENT half-lives (a
    squat set and a curl set on the same muscle decay at different rates), which has no closed
    form. Monotone decreasing, so a bisection is exact to the hour.
    """
    out: dict[str, float] = {}
    horizon = float(LOAD_WINDOW_DAYS * 24)
    for m, contribs in _load_contributions(
        rows, today=today, secondary_weight=secondary_weight, exposures=exposures
    ).items():

        def load_at(t: float, contribs: list[tuple[float, float]] = contribs, m: str = m) -> float:
            return _normalized(m, sum(c * 0.5 ** (t / hl) for c, hl in contribs))

        if load_at(0.0) < landmarks.RECOVERED_BELOW:
            continue
        lo, hi = 0.0, horizon
        for _ in range(24):
            mid = (lo + hi) / 2
            if load_at(mid) >= landmarks.RECOVERED_BELOW:
                lo = mid
            else:
                hi = mid
        out[m] = round(hi, 1)
    return out


def muscle_panel(
    rows: list[dict[str, Any]],
    *,
    today: date,
    sets_from: date,
    exposures: dict[tuple[str, str], int] | None = None,
) -> dict[str, Any]:
    """The Home muscle panel's payload: per-muscle set counts over the rolling week PLUS each
    muscle's current decayed load, which is computed over a longer window.

    Kept pure (and separate from the DB fetch in services.get_muscle_volume) because the seam
    between the two windows is where this feature breaks: a muscle whose work predates the
    set-count window is still glowing and must be reported with zero sets rather than dropped,
    or the figure lights up a muscle the response never mentions.
    """
    result = weekly_muscle_load([r for r in rows if r["date"] >= sets_from])
    load = current_muscle_load(rows, today=today, exposures=exposures)
    # Solved from the same contributions that produced `load`, so a row's countdown can never
    # disagree with its own bar.
    ready = hours_until_recovered(rows, today=today, exposures=exposures)
    for m in result["muscles"]:
        m["load"] = load.pop(m["muscle"], 0.0)
        m["ready_in_h"] = ready.get(m["muscle"], 0.0)
    result["muscles"].extend(
        {
            "muscle": m,
            "sets": 0.0,
            "reps": 0,
            "hard_sets": 0,
            "load": v,
            "ready_in_h": ready.get(m, 0.0),
        }
        for m, v in sorted(load.items(), key=lambda kv: -kv[1])
    )
    return result


def volume_over_time(volume_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Order per-session volumes by date and report the overall trend %."""
    ordered = sorted(volume_rows, key=lambda r: r["date"])
    series = [{"date": r["date"], "volume_kg": round(_f(r.get("volume_kg")), 1)} for r in ordered]
    return {"series": series, "trend_pct": trend_pct([p["volume_kg"] for p in series])}
