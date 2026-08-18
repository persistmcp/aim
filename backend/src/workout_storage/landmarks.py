"""Per-muscle weekly hard-set volume landmarks — the server-side source of truth.

Grounded in the Renaissance Periodization hypertrophy guides and Schoenfeld et al.'s dose-response
meta-analyses (growth climbs steeply to ~10 sets/week, diminishing returns toward ~20+):
  mev — Minimum Effective Volume: below this a muscle barely grows (maintenance at best).
  mav — top of the Maximum Adaptive Volume range: ceiling of the productive zone.

The web app carries a mirror in web/src/app/lib/muscle.ts (SET_LANDMARKS); a parity test
(tests/unit/test_landmarks.py) guards the two copies until the frontend switches to
GET /api/landmarks. Both prompt assembly (coaching context) and the muscle heat map read these
numbers, so the coach and the UI always agree on what "enough volume" means.
"""

from __future__ import annotations

from typing import Any

SET_LANDMARKS: dict[str, dict[str, int]] = {
    "chest": {"mev": 8, "mav": 20},
    "lats": {"mev": 8, "mav": 20},
    "upper_back": {"mev": 8, "mav": 20},
    "traps": {"mev": 6, "mav": 20},
    "side_delts": {"mev": 8, "mav": 20},
    "front_delts": {"mev": 6, "mav": 12},  # heavy indirect work from pressing → low direct need
    "rear_delts": {"mev": 6, "mav": 18},
    "biceps": {"mev": 6, "mav": 16},
    "triceps": {"mev": 6, "mav": 14},
    "forearms": {"mev": 4, "mav": 14},
    "abs": {"mev": 6, "mav": 20},
    "obliques": {"mev": 4, "mav": 14},
    "quads": {"mev": 8, "mav": 18},
    "hamstrings": {"mev": 6, "mav": 16},
    "glutes": {"mev": 4, "mav": 16},
    "calves": {"mev": 8, "mav": 16},
    "lower_back": {"mev": 4, "mav": 12},  # trained heavily as a synergist on most compounds
    "adductors": {"mev": 4, "mav": 12},
}

# Sub-region → parent group, so a muscle without its own landmark inherits its group's numbers.
LANDMARK_ALIAS: dict[str, str] = {
    "upper_chest": "chest",
    "lower_chest": "chest",
    "rhomboids": "upper_back",
    "lower_traps": "traps",
    "rotator_cuff": "rear_delts",
    "abductors": "glutes",
}


def landmarks_for(muscle: str) -> dict[str, int] | None:
    """MEV/MAV for a muscle, resolving sub-regions to their parent group."""
    return SET_LANDMARKS.get(muscle) or SET_LANDMARKS.get(LANDMARK_ALIAS.get(muscle, ""))


# ── Recovery kinetics ────────────────────────────────────────────────────────
# How long a hard session's work keeps loading each muscle: RECOVERY_HOURS[m] is the point where
# residual load is effectively gone (~6% left, see HALF_LIFE_DIVISOR). This is a *train-again*
# threshold, not a "100% supercompensated" one — Fitbod's published 6–7 days is the latter and
# does not contradict these numbers.
#
# HONESTY NOTE, after an adversarial literature review (2026-08-06): treat this table as a
# PRACTITIONER HEURISTIC, not as literature-derived per-muscle recovery times. No study measures
# time-to-recovery muscle by muscle; what exists measures damage magnitude, in a handful of
# muscles, and damage magnitude is not recovery time. Two earlier justifications were withdrawn:
#   • An appeal to fibre type ("slow-twitch groups recover in ~1.5 days") cited Johnson et al.
#     1973, whose own data REFUTES the grouping — rectus abdominis 46% type I, gastrocnemius
#     ~47–51%, forearm flexors ~40–47%, i.e. at or below the whole-body average, while the rows
#     here called slowest score HIGHER (biceps femoris 67%, erectors 57%). Citation removed. No
#     human study correlates a muscle's fibre composition with its recovery after resistance work.
#   • Chen et al. 2011 (Eur J Appl Physiol 111:211-23) ranks arms as the most damage-prone limb
#     muscles and knee extensors the least. The table USED to follow that ranking; it no longer
#     does. A coaching review pointed out that damage magnitude is not training frequency: 48h
#     between direct arm work is routine for anyone, so arms sit at 42h, BELOW quads at 48h. Chen
#     measured how much damage a bout causes, never how long until the next bout is reasonable,
#     and the numbers here answer the second question.
# What does hold up: "legs need 72h" is an artefact of squats being a systemically expensive
# *exercise* (the modifiers below carry that, not the tissue); hamstrings are slow on Nordic-curl
# data (−25.6% peak torque at 48h, CK peaking at 96h); Belcher et al. 2019 found deadlifts need no
# more recovery than squats, so heavy pulls get no penalty here; and lower_back at 84h is RP's
# "axial fatigue" consensus with no controlled time course behind it at all.
#   • calves 48h, not the 36h first written here: the single row is dominated by gastrocnemius in
#     standing work, which is ~47-51% type I — dead average, not the slow-twitch outlier the
#     original grouping assumed. (Soleus at ~88% genuinely is one, but it is not what this row
#     tracks.)
#   • adductors, neck and obliques were never verified against any source at all — they are placed
#     by analogy with their neighbours. Treat them as the softest rows after lower_back.
#   • biceps/triceps 42h, hamstrings 60h, front_delts 60h: moved on coaching review against real
#     programming. 60h for arms blocked the second pull day of a 6-day split every week, and 48h
#     between direct arm work is routine; hamstrings at 72h discouraged the Friday lower session
#     after a Tuesday RDL, and the ×1.4 long-length premium already carries the case that earns a
#     long window; front_delts went UP because the anterior shoulder, not the pec, is what limits
#     pressing frequency on a 6-day split.
# Mirrored in web/src/app/lib/muscle.ts (RECOVERY_HOURS), parity-guarded like SET_LANDMARKS.
RECOVERY_HOURS: dict[str, int] = {
    "calves": 48,
    "abs": 36,
    "obliques": 36,
    "forearms": 36,
    "neck": 36,
    "traps": 40,
    "side_delts": 40,
    "rear_delts": 40,
    "quads": 48,
    "front_delts": 60,
    "glutes": 54,
    "lats": 60,
    "upper_back": 60,
    "biceps": 42,
    "triceps": 42,
    "chest": 66,
    "adductors": 66,
    "hamstrings": 60,
    "lower_back": 84,
}
DEFAULT_RECOVERY_HOURS = 60

# Load decays exponentially (the standard for training-load models — Banister's impulse-response,
# Garmin's Acute Load, TrainingPeaks' ATL/CTL — and the shape of first-order biological clearance:
# CK, edema, glycogen resynthesis). Exponentials also superpose, so overlapping sessions sum
# without per-session bookkeeping. Half-life = window / 4 leaves 6.25% at the window's end, a
# clean "recovered" reading with no linear-decay kink.
HALF_LIFE_DIVISOR = 4.0

# Per-set duration modifiers, applied to the window and capped so a set can never linger past 2×.
#   • Multi-joint work costs more than single-joint — Dourado 2022 measured 48h torque / 96h edema
#     recovery after leg press vs 24h / 48h after knee extension.
#   • Hinges and lunges load the muscle hardest at long length, the eccentric-emphasized
#     "stretcher" class in Contreras' SRA framework (3–4 days vs 1–2 for short-ROM pump work);
#     Sousa 2024 ties long-length eccentrics to markedly more damage.
#   • Failure costs an extra 24–48h (Morán-Navarro 2017).
# Exercise type is read off the catalog's own `category` / `movement_pattern` rather than guessed
# from how many muscles a lift lists: 71 of 75 catalogued exercises carry both, and the muscle-count
# guess disagrees with the stated category on hip thrusts (compound, 2 muscles) and face pulls
# (isolation, 3 muscles). The guess survives only as the fallback for an uncatalogued exercise.
STRETCHER_PATTERNS = frozenset({"hinge", "lunge"})
# 1.2 / 1.05, down from 1.4 / 1.25 on a coaching re-review: the compound multiplier fires on ~80%
# of all logged sets, so at 1.25 it was not a differentiator but a global +25% bias — a table
# saying chest = 66h produced an 85h bench countdown, and every compound lift came out late
# against when a coach would actually train it again. At 1.05/1.2 the same scenarios land in band
# (bench 71h, RDL 71h, OHP 72h, row 62h, deadlift 93h) with the base table untouched.
STRETCHER_RECOVERY_MULT = 1.2
COMPOUND_RECOVERY_MULT = 1.05
ISOLATION_RECOVERY_MULT = 0.85
# 1.1, down from 1.25: a set to failure already deposits 1.3× the credit, so charging 1.25 on the
# window as well double-counted one signal — and it made the RPE 9.4→9.5 step worth more than the
# entire graded ramp below it.
FAILURE_RECOVERY_MULT = 1.1
# Raised from 2.0 so novelty can stack with a long-length lift: a first-ever Romanian deadlift is
# precisely the case where the longest window is justified, and the old cap clipped it.
MAX_RECOVERY_MULT = 2.5
# Below this a muscle's window is already short enough that discounts do more harm than good.
SHORT_WINDOW_HOURS = 48

# A muscle that has not done this movement recently is damaged far more by it — the repeated-bout
# effect, and the ONLY personalization the evidence supports. It beats every demographic factor,
# and unlike them it is measured within-subject, so it is not drowned by the 3–100× spread between
# people. Damas 2016 (J Physiol 594:5209): Z-band damage highest in week 1, attenuated by week 3,
# minimal by week 10 at constant relative load. Tang 2008: in the SAME subject at the SAME relative
# intensity, the untrained leg was still +70% MPS at 28h while the trained leg had returned to
# baseline. Chen 2019: after one prior bout, plasma damage markers were not significantly elevated
# at all. Nosaka 2001: protection lasts ≥6 months and is gone by 9–12.
#
# Keyed on prior exposures of this muscle to this movement pattern in the recent past — NOT global
# training age: Chen 2019 measured 16–57% day-1 strength loss across nine muscle groups in the same
# men on the same protocol, and the protection transfers between muscles only partially.
#
# Deliberately capped at 1.5 where the raw literature would justify 2.0+: this window is a
# train-again threshold rather than a fully-repaired one, and a truly naive muscle is rare after a
# user's first weeks of logging. Erring low here is also the safe direction — see the note on
# asymmetry below.
NOVELTY_RECOVERY_MULT: list[tuple[int, float]] = [  # (min exposures, multiplier), descending
    (10, 1.0),
    (5, 1.05),
    (2, 1.15),
    (1, 1.25),
    (0, 1.5),
]
NOVELTY_WINDOW_DAYS = 180  # exposures older than this no longer protect (Nosaka 2001)


def novelty_recovery_mult(exposures: int) -> float:
    """Recovery stretch for how unaccustomed this muscle is to this movement.

    Only ever ≥ 1.0. The asymmetry matters: shortening a window tells someone to train, lengthening
    it only tells them to wait, so a wrong long guess costs a rest day and a wrong short one costs
    an injury. Every multiplier in this model is therefore allowed to extend recovery and none may
    shorten it below the base window except the isolation modifier, which is measured.
    """
    for threshold, mult in NOVELTY_RECOVERY_MULT:
        if exposures >= threshold:
            return mult
    return NOVELTY_RECOVERY_MULT[-1][1]


# How much a single set deposits, before the muscle's own credit weighting. The window says how
# long work lingers; THIS says how much there was — a top single and a back-off set are not the
# same set, and the model used to treat them identically.
#
# Driven by reps, because reps are always logged: effort (RIR/RPE) is present on ~0.3% of real
# sets (2 of 768 working sets in production), so a model keyed on it would be inert.
#
# HONESTY: the rep brackets are a WEAK PROXY and a review argued they may be signed wrong. There
# is no published mapping from rep bracket to per-set recovery cost. A Lieber & Fridén citation
# that used to sit here was withdrawn: their finding is that damage tracks active STRAIN, not
# force — which is orthogonal to rep count, and which this model already carries separately as
# STRETCHER_PATTERNS. Against that, damage protocols dose in eccentric actions, and a 20-rep set
# has four times as many as a 5-rep set, so the sign is contestable. The brackets are kept
# because a top single and a back-off set were previously identical to the model, and the span
# (1.44×) is small next to the model's other uncertainties; they are tuning, not evidence.
# Effort, WHERE it is logged, overrides the rep guess — that path is the defensible one.
HEAVY_REPS = 5
HIGH_REPS = 15
VERY_HIGH_REPS = 20
HEAVY_SET_CREDIT = 1.15
HIGH_REP_CREDIT = 0.9
VERY_HIGH_REP_CREDIT = 0.8
# RPE → credit. Anchored at RPE 8 = 1.0, the effort most working sets are actually written for.
_EFFORT_CREDIT: list[tuple[float, float]] = [  # (min RPE, credit), descending
    (9.5, 1.3),
    (8.5, 1.15),
    (7.5, 1.0),
    (6.5, 0.85),
    (0.0, 0.7),
]


def set_credit_mult(reps: int | None, rir: float | None = None, rpe: float | None = None) -> float:
    """How heavily one set counts, from how it was actually performed."""
    if rir is not None:
        rpe = 10.0 - float(rir)
    if rpe is not None:
        for threshold, credit in _EFFORT_CREDIT:
            if float(rpe) >= threshold:
                return credit
    if not reps:
        return 1.0
    if reps <= HEAVY_REPS:
        return HEAVY_SET_CREDIT
    if reps > VERY_HIGH_REPS:
        return VERY_HIGH_REP_CREDIT
    if reps >= HIGH_REPS:
        return HIGH_REP_CREDIT
    return 1.0


# The erectors are a shared axial budget, not a synergist that happens to come along: they carry
# the bar on every hinge and every back-loaded squat, and a heavy pull is the single most common
# injury pathway a coach actually manages. Crediting them at half a set left them below half full
# after four axially loaded days in five. Full credit from those patterns, with a dose raised to
# match, so the bar has resolution once it can actually fill.
AXIAL_PATTERNS = frozenset({"hinge", "squat"})
AXIAL_MUSCLE = "lower_back"
# 7, not 9: at 9 a 5×3 deadlift read 0.36 the next morning — a green light for a heavy squat,
# which is the exact week this special case exists to catch. At 7 it reads 0.47 and an axial week
# peaks at a clean 1.0 instead of pinning there indefinitely.
AXIAL_REFERENCE_DOSE = 7.0


def exercise_recovery_mult(
    category: str | None,
    movement_pattern: str | None,
    *,
    muscles_involved: int,
    long_length: bool | None = None,
) -> float:
    """How much longer (or shorter) than the muscle's base window this exercise's work lingers.

    ``long_length`` — does the exercise load the muscle in a stretched position — is stated by the
    catalogue per exercise, and it decides before anything else. It used to be inferred from the
    movement pattern, and the inference was wrong for a third of the class it selected: hip
    thrusts, glute bridges, kettlebell swings and rack pulls are all `hinge`, and every one of them
    is defined by the ABSENCE of a loaded stretch — a rack pull literally deletes the stretched
    half of a deadlift, yet collected the long-length premium for it. Meanwhile the Nordic curl,
    named in this docstring for a year as the reason pattern outranks category, is catalogued
    `(isolation, isolation)` and never triggered the rule at all.

    ``None`` means the caller has no per-exercise flag (a user-authored exercise, or a stored row
    written before the column existed). Those fall back to the old pattern inference, which is
    wrong for the same third of hinges but is still better than treating every hinge as short.
    """
    if long_length is True:
        return STRETCHER_RECOVERY_MULT
    if long_length is None and movement_pattern in STRETCHER_PATTERNS:
        return STRETCHER_RECOVERY_MULT
    if category == "compound":
        return COMPOUND_RECOVERY_MULT
    # core work is short-ROM, high-endurance — it recovers like isolation, not like a compound,
    # even though a hanging leg raise lists three muscles and would fool the muscle-count guess.
    if category in ("isolation", "core"):
        return ISOLATION_RECOVERY_MULT
    if category in ("cardio", "mobility"):
        return 1.0  # not resistance work; no damage premium either way
    # Uncatalogued: fall back to counting the muscles the lift claims to work.
    return COMPOUND_RECOVERY_MULT if muscles_involved >= 3 else 1.0


# Below this the muscle reads as recovered and stops glowing — an exponential never reaches 0.
RECOVERED_BELOW = 0.05


def recovery_hours_for(
    muscle: str,
    *,
    exercise_mult: float = 1.0,
    to_failure: bool = False,
    novelty_mult: float = 1.0,
) -> float:
    """Hours until a set's load on `muscle` is spent, resolving sub-regions to their parent."""
    base = RECOVERY_HOURS.get(muscle) or RECOVERY_HOURS.get(
        LANDMARK_ALIAS.get(muscle, ""), DEFAULT_RECOVERY_HOURS
    )
    mult = exercise_mult * novelty_mult * (FAILURE_RECOVERY_MULT if to_failure else 1.0)
    hours = base * min(mult, MAX_RECOVERY_MULT)
    # Never let a discount push a fast muscle below its own base window: applied to the shortest
    # rows (arms at 42h) the isolation multiplier left 35.7h — a half-life of 9h, so the bar had a
    # single intermediate reading before going dark. Discounts may shorten long windows, not
    # already-short ones.
    return max(hours, base) if base <= SHORT_WINDOW_HOURS else hours


# Reference "fully loaded" dose: one hard session's worth of sets for this muscle — a third of its
# weekly MAV (MAV is spread over 2–3 sessions plus indirect work), floored at 5 sets, which lands
# on the 5–6 hard sets the recovery literature uses as its reference session. At this many fresh
# sets the heatmap saturates.
MIN_REFERENCE_DOSE = 5.0
DEFAULT_REFERENCE_DOSE = 6.0


def reference_dose(muscle: str) -> float:
    if muscle == AXIAL_MUSCLE:
        return AXIAL_REFERENCE_DOSE
    lm = landmarks_for(muscle)
    if lm is None:
        return DEFAULT_REFERENCE_DOSE
    return max(MIN_REFERENCE_DOSE, lm["mav"] / 3)


def status_for(muscle: str, sets: float, band: str = "mev") -> str | None:
    """Classify a week's set count against a muscle's MEV/MAV for a weekly_volume goal.

    "mev": in_range means sets >= mev (the floor is the whole bar). "mev_mav": in_range means
    mev <= sets <= mav (the productive zone). "mav": in_range means sets >= mav. Returns None for
    an unlandmarked muscle — the caller renders that as "no landmark data", never a fabricated
    status.
    """
    lm = landmarks_for(muscle)
    if lm is None:
        return None
    mev, mav = lm["mev"], lm["mav"]
    if band == "mav":
        return "in_range" if sets >= mav else "under"
    if band == "mev_mav":
        if sets < mev:
            return "under"
        return "in_range" if sets <= mav else "over"
    # band == "mev" (default): at/above the floor is the whole goal, no ceiling to exceed.
    return "in_range" if sets >= mev else "under"


def annotate_weekly_sets(muscles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-muscle sets over the trailing 7 days, annotated with MEV/MAV where known.

    ``direct_sets_last_7d`` is the MEV/MAV comparand and counts PRIMARY work only. This matters:
    the landmarks are published in direct hard sets, so comparing them against the
    assistance-inclusive tally (where a row credits biceps half a set) is a units error — it read
    biceps and triceps as "in range" off pressing and pulling alone while their direct volume sat
    below the minimum effective dose, and the coach would then stop prescribing the direct arm work
    those numbers were asking for. The padded figure is still supplied, under a name that says what
    it is, because "how much did this muscle get overall" is a real second question.

    The key says `last_7d`, not `this_week`: the window is rolling so it never collapses to
    near-zero on a Monday, and MEV/MAV are weekly landmarks so the span must stay a week. Includes
    EVERY trained muscle (unlandmarked ones like neck/full_body just carry no mev/mav) so the coach
    sees all recent stimulus, not only the tracked groups.
    Input rows: stats.weekly_muscle_load()['muscles'].
    """
    out = []
    for m in muscles:
        lm = landmarks_for(m["muscle"])
        out.append(
            {
                "muscle": m["muscle"],
                "direct_sets_last_7d": m.get("hard_sets", 0),
                "with_assistance_last_7d": m["sets"],
                **({"mev": lm["mev"], "mav": lm["mav"]} if lm else {}),
            }
        )
    return out
