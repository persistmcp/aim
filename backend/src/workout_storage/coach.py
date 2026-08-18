"""Coaching domain: pydantic models, intake-status rules, and the profile→UI impact map.

The coaching feature (docs/COACHING_PLAN.md) turns user answers into a typed profile. This module
holds the shapes and the pure logic; SQL lives in repo.py, orchestration in services.py.
"""

from __future__ import annotations

from datetime import date as Date
from enum import StrEnum
from typing import Any

from pydantic import Field, model_validator

from .models import Equipment, MuscleGroup, Sex, _Base

# --- enums ---------------------------------------------------------------------


class PrimaryGoal(StrEnum):
    hypertrophy = "hypertrophy"
    strength = "strength"
    fat_loss = "fat_loss"
    endurance = "endurance"
    general_health = "general_health"
    event = "event"


class CoachExperience(StrEnum):
    """Coaching experience levels; adds 'returning' (after a long break) to the catalog enum."""

    beginner = "beginner"
    returning = "returning"
    intermediate = "intermediate"
    advanced = "advanced"


class Location(StrEnum):
    gym = "gym"
    home = "home"
    outdoor = "outdoor"


class CoachingTone(StrEnum):
    supportive = "supportive"
    demanding = "demanding"
    neutral = "neutral"


class GoalKind(StrEnum):
    outcome = "outcome"
    process = "process"
    performance = "performance"


class GoalType(StrEnum):
    """How a goal is quantified/visualized (target.goal_type) — a different axis from GoalKind
    (which methodology section it maps to). Legacy goals with no goal_type infer one from
    target.metric via infer_goal_type() below, so this is purely additive."""

    milestone = "milestone"  # point target: exercise_id+value, or bodyweight+baseline_value
    weekly_volume = "weekly_volume"  # muscle+band vs MEV/MAV, recurring every week, no finish line
    trend = "trend"  # exercise_id+metric, no value — "just keep it climbing"
    maintenance = "maintenance"  # baseline_value+tolerance_pct — a band, not a pass/fail
    frequency = "frequency"  # metric=sessions_per_week — stays in AdherenceWidget, never featured


class GoalTargetBand(StrEnum):
    """weekly_volume's threshold: mev = at least MEV; mev_mav = within the MEV-MAV band;
    mav = at or above MAV."""

    mev = "mev"
    mev_mav = "mev_mav"
    mav = "mav"


class GoalStatus(StrEnum):
    active = "active"
    achieved = "achieved"
    abandoned = "abandoned"
    revised = "revised"


class GoalSource(StrEnum):
    user = "user"
    coach_proposed = "coach_proposed"


class IntakeStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    core_complete = "core_complete"
    enriched = "enriched"


class CoachEventType(StrEnum):
    intake_started = "intake_started"
    intake_completed = "intake_completed"
    checkin = "checkin"
    goal_review = "goal_review"
    goal_achieved = "goal_achieved"
    deload_advised = "deload_advised"
    red_flag_raised = "red_flag_raised"
    profile_updated = "profile_updated"


class CoachTask(StrEnum):
    intake = "intake"
    next_workout = "next_workout"
    new_program = "new_program"
    weekly_review = "weekly_review"
    deload_check = "deload_check"
    checkin = "checkin"


# --- inputs --------------------------------------------------------------------


class ParqFlags(_Base):
    """PAR-Q-style screening answers. Cardiovascular/systemic flags (heart, chest pain,
    dizziness, medication, other) trigger the medical-clearance advisory; bone_joint_problem
    is deliberately excluded — joint issues are handled through injuries (substitutions),
    not clearance gating. Partial answers merge into previously stored flags."""

    heart_condition: bool | None = None
    chest_pain: bool | None = None
    dizziness: bool | None = None
    bone_joint_problem: bool | None = None
    on_medication: bool | None = None
    other_reason: bool | None = None
    notes: str | None = None

    def any_red_flag(self) -> bool:
        return any(
            v is True
            for v in (
                self.heart_condition,
                self.chest_pain,
                self.dizziness,
                self.on_medication,
                self.other_reason,
            )
        )


class InjuryReport(_Base):
    area: str  # "shoulder", "left knee" — free text
    note: str | None = None


class CoachProfilePatch(_Base):
    """One patch = the facts confirmed in conversation right now. Everything optional."""

    # Anthropometrics (stored on the users row, see USER_PROFILE_FIELDS): starting-load
    # anchors depend on them, so intake asks — but they are skippable, never blocking.
    sex: Sex | None = None
    birth_date: Date | None = None
    height_cm: float | None = Field(default=None, ge=0)
    bodyweight_kg: float | None = Field(default=None, ge=0)
    primary_goal: PrimaryGoal | None = None
    goal_detail: str | None = None
    motivation: str | None = None
    experience_level: CoachExperience | None = None
    training_days_per_week: int | None = Field(default=None, ge=1, le=14)
    session_length_min: int | None = Field(default=None, ge=10, le=300)
    preferred_days: list[str] | None = None
    preferred_time: str | None = None
    schedule_cue: str | None = None
    locations: list[Location] | None = None  # replace-whole (small arrays)
    equipment: list[Equipment] | None = None  # replace-whole
    focus_muscles: list[MuscleGroup] | None = None
    likes: list[str] | None = None
    dislikes: list[str] | None = None
    coaching_tone: CoachingTone | None = None
    language: str | None = None
    confidence_score: int | None = Field(default=None, ge=0, le=10)
    checkin_cadence_days: int | None = Field(default=None, ge=7, le=120)
    profile_summary: str | None = None
    # Injuries use append/resolve semantics — the LLM can never clobber injury history.
    add_injuries: list[InjuryReport] | None = None
    resolve_injury_areas: list[str] | None = None
    parq_flags: ParqFlags | None = None


class GoalTarget(_Base):
    # goal_type selects which shape below applies; unset on legacy rows (infer_goal_type infers
    # one from metric so old goals keep rendering exactly as before, see services._goal_progress).
    goal_type: GoalType | None = None
    metric: str | None = None  # e1rm|weight|reps|bodyweight|sessions_per_week|volume|free-form
    value: float | None = None
    unit: str | None = None
    deadline: Date | None = None
    # Required for metric in (e1rm, weight, reps) on milestone/trend/maintenance goals: which
    # catalog exercise the goal tracks — the server resolves progress from that exercise's own
    # logged sets. Without it, a milestone goal displays title-only, no progress bar.
    exercise_id: str | None = None
    # Required for metric=bodyweight (direction-aware baseline), and for maintenance goals of any
    # kind (the level to hold). Without it, a milestone goal displays title-only, no progress bar.
    baseline_value: float | None = None
    # weekly_volume only: which muscle, and how far into its MEV-MAV range counts as "on track".
    muscle: MuscleGroup | None = None
    band: GoalTargetBand | None = None
    # maintenance only: allowed drop from baseline before the band flips to "warn" (percent).
    tolerance_pct: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def _shape_supported(self) -> GoalTarget:
        # Per-type write-time guards. Every rule here rejects a shape that the schema would
        # accept but the progress computation can never resolve — the goal would render
        # title-only forever with no hint why. Reject with a corrective message so the coach
        # self-corrects in the same tool call (prompt guidance alone already failed to prevent
        # exactly this drift once: the trend+volume case that started this validator). Rules key
        # on an EXPLICIT goal_type only — legacy rows (no goal_type) keep writing exactly as
        # before, and free-form metrics on a milestone stay allowed (an aspiration like "run a
        # marathon" is title-only by intent, not by accident).
        if self.goal_type == GoalType.trend and self.metric not in (None, "e1rm", "weight"):
            raise ValueError(
                f"trend goals only support metric='e1rm' or metric='weight' (got {self.metric!r})"
                " — a trend goal tracks one exercise's climbing number; for volume tracking use"
                " goal_type='maintenance' (unscoped) or 'weekly_volume' (per-muscle) instead"
            )
        if self.goal_type == GoalType.milestone and self.metric in ("e1rm", "weight", "reps"):
            if not self.exercise_id:
                raise ValueError(
                    f"milestone goals with metric={self.metric!r} need exercise_id — progress is"
                    " resolved from that exercise's logged sets; pick the id from list_exercises"
                    " (create it with upsert_exercise first if it's new)"
                )
            if self.value is None:
                raise ValueError(
                    f"milestone goals with metric={self.metric!r} need a target `value` — a"
                    " milestone is a point target; for open-ended 'just keep climbing' use"
                    " goal_type='trend' instead"
                )
        if (
            self.goal_type == GoalType.milestone
            and self.metric == "bodyweight"
            and self.value is not None
            and self.baseline_value is None
        ):
            raise ValueError(
                "bodyweight milestone goals need baseline_value (the current weight) — it sets"
                " the progress direction (cut vs gain) and the distance the ring measures"
            )
        if self.goal_type == GoalType.weekly_volume and self.muscle is None:
            raise ValueError(
                "weekly_volume goals need `muscle` — the goal is judged against that muscle's"
                " MEV/MAV landmarks each week"
            )
        if self.goal_type == GoalType.maintenance and self.baseline_value is None:
            raise ValueError(
                "maintenance goals need baseline_value — the level to hold; use the user's"
                " current e1rm/weekly sets/weekly volume for the chosen scope"
            )
        return self


class GoalInput(_Base):
    id: str | None = None  # set to update an existing goal
    kind: GoalKind
    title: str
    target: GoalTarget | None = None
    status: GoalStatus = GoalStatus.active
    source: GoalSource = GoalSource.user
    ratified: bool = True
    review_date: Date | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    # The ONE goal the app shows prominently (COACHING_PLAN.md §8.2's "flagship personalization",
    # now singular). Setting this auto-unfeatures any other active goal for the user
    # (repo.upsert_user_goal) — never set it on a frequency goal, those live in the adherence
    # widget only. Only the coach ever sets this, in conversation; the app never flips it itself.
    featured: bool = False
    # Links a new goal to the one it replaced (e.g. an achieved milestone that became a
    # maintenance goal), so goal history reads as a chain. Goals are never deleted — see §3.2.
    supersedes_goal_id: str | None = None

    @model_validator(mode="after")
    def _frequency_never_featured(self) -> GoalInput:
        # Was prompt-guidance only (upsert_goal docstring + FeaturedGoalCard gating on the UI
        # side); enforce it at write time like the GoalTarget shape rules — a frequency goal
        # resets weekly, so the featured card's finish-line framing is actively wrong for it.
        if self.featured and infer_goal_type(self.target.model_dump() if self.target else None) == (
            GoalType.frequency
        ):
            raise ValueError(
                "frequency goals (sessions_per_week) can never be featured — they live in the"
                " weekly adherence widget; feature the paired outcome goal instead"
            )
        return self


# metric → the GoalType a pre-this-feature goal (no explicit target.goal_type) infers to. Keeps
# every existing milestone/bodyweight/sessions_per_week goal rendering exactly as before — this
# table is deliberately the only place that fallback logic lives.
_LEGACY_METRIC_TO_TYPE: dict[str, GoalType] = {
    "sessions_per_week": GoalType.frequency,
    "e1rm": GoalType.milestone,
    "weight": GoalType.milestone,
    "reps": GoalType.milestone,
    "bodyweight": GoalType.milestone,
}


def infer_goal_type(target: dict[str, Any] | None) -> str:
    """target.goal_type if set, else inferred from target.metric (legacy rows), else the safest
    default (milestone — title-only display, no fabricated progress, per _goal_progress's own
    missing-data handling)."""
    if not target:
        return GoalType.milestone
    explicit = target.get("goal_type")
    if explicit:
        return str(explicit)
    return _LEGACY_METRIC_TO_TYPE.get(target.get("metric") or "", GoalType.milestone)


# --- intake status -------------------------------------------------------------

# Patch fields that live on the users row, not coach_profiles: services routes them there.
# Optional by design — intake asks once, the user may skip, and nothing gates on them.
USER_PROFILE_FIELDS = ("sex", "birth_date", "height_cm", "bodyweight_kg")

# The blocking set from COACHING_PLAN.md §6: without these the coach cannot program responsibly.
CORE_FIELDS = (
    "primary_goal",
    "motivation",
    "experience_level",
    "training_days_per_week",
    "locations",
    "equipment",
    "parq_flags",
)


def compute_intake_status(profile: dict[str, Any]) -> str:
    """Derive intake status from field presence. Never downgrades enriched."""
    if profile.get("intake_status") == IntakeStatus.enriched:
        return IntakeStatus.enriched
    filled = 0
    for f in CORE_FIELDS:
        v = profile.get(f)
        if v not in (None, [], {}, ""):
            filled += 1
    if filled == len(CORE_FIELDS):
        return IntakeStatus.core_complete
    if filled > 0:
        return IntakeStatus.in_progress
    return IntakeStatus.not_started


def is_intake_complete(status: str | None) -> bool:
    """Fail-closed gate predicate: only explicitly complete states unlock generation tasks —
    an unknown/future status value must NOT slip past the §12.2 hard gate."""
    return status in (IntakeStatus.core_complete, IntakeStatus.enriched)


# --- profile → UI impact map ----------------------------------------------------

# Which UI elements a profile write will visibly change (COACHING_PLAN.md §5.1, §8). Returned from
# write tools so the coach can tell the user what just changed in the app. Names are the contract
# for Phase 3 frontend modules; an empty list means the field is prompt-side only.
UI_IMPACT: dict[str, list[str]] = {
    "sex": [],
    "birth_date": [],
    "height_cm": [],
    "bodyweight_kg": ["body_metrics_chart"],
    "primary_goal": ["dashboard_layout", "stat_tiles", "progress_default"],
    "goal_detail": [],
    "motivation": [],
    "experience_level": [],
    "training_days_per_week": ["adherence_target"],
    "session_length_min": [],
    "preferred_days": [],
    "preferred_time": [],
    "schedule_cue": [],
    "locations": ["program_location_tags"],
    "equipment": ["exercise_howto_filter"],
    "focus_muscles": ["muscle_map_focus"],
    "likes": [],
    "dislikes": [],
    "coaching_tone": [],
    "language": [],
    "confidence_score": [],
    "checkin_cadence_days": [],
    "profile_summary": [],
    "add_injuries": ["muscle_map_injury_badge"],
    "resolve_injury_areas": ["muscle_map_injury_badge"],
    "parq_flags": [],
    "medical_clearance_advised": [],
    "injuries": ["muscle_map_injury_badge"],
}


def ui_impact_for(changed: list[str]) -> list[str]:
    seen: list[str] = []
    for field in changed:
        for impact in UI_IMPACT.get(field, []):
            if impact not in seen:
                seen.append(impact)
    return seen
