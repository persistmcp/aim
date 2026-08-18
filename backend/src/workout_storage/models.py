"""Pydantic models mirroring workout_tracker.schema.json.

Used for MCP tool input/output validation and for bulk import of full documents.
Known fields are modelled explicitly; `custom_fields` is the extension mechanism. Models forbid
unknown top-level keys so data is never silently dropped — a bad payload surfaces as a validation
error the assistant can correct.
"""

from __future__ import annotations

from datetime import date as Date
from datetime import datetime as DateTime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- enums (verbatim from the JSON schema) -----------------------------------


class MuscleGroup(StrEnum):
    chest = "chest"
    upper_chest = "upper_chest"
    lower_chest = "lower_chest"
    lats = "lats"
    upper_back = "upper_back"
    traps = "traps"
    lower_traps = "lower_traps"
    rhomboids = "rhomboids"
    rear_delts = "rear_delts"
    side_delts = "side_delts"
    front_delts = "front_delts"
    biceps = "biceps"
    triceps = "triceps"
    forearms = "forearms"
    abs = "abs"
    obliques = "obliques"
    lower_back = "lower_back"
    glutes = "glutes"
    quads = "quads"
    hamstrings = "hamstrings"
    adductors = "adductors"
    abductors = "abductors"
    calves = "calves"
    neck = "neck"
    rotator_cuff = "rotator_cuff"
    full_body = "full_body"
    other = "other"


class Equipment(StrEnum):
    barbell = "barbell"
    ez_bar = "ez_bar"
    dumbbell = "dumbbell"
    kettlebell = "kettlebell"
    cable = "cable"
    cable_crossover = "cable_crossover"
    lat_pulldown = "lat_pulldown"
    seated_row = "seated_row"
    machine = "machine"
    smith_machine = "smith_machine"
    pec_deck = "pec_deck"
    bodyweight = "bodyweight"
    resistance_band = "resistance_band"
    bench = "bench"
    incline_bench = "incline_bench"
    pull_up_bar = "pull_up_bar"
    dip_bars = "dip_bars"
    treadmill = "treadmill"
    other = "other"


class MovementPattern(StrEnum):
    horizontal_push = "horizontal_push"
    vertical_push = "vertical_push"
    horizontal_pull = "horizontal_pull"
    vertical_pull = "vertical_pull"
    squat = "squat"
    hinge = "hinge"
    lunge = "lunge"
    carry = "carry"
    rotation = "rotation"
    isolation = "isolation"
    core = "core"
    cardio = "cardio"
    mobility = "mobility"
    other = "other"


class ExerciseCategory(StrEnum):
    compound = "compound"
    isolation = "isolation"
    cardio = "cardio"
    core = "core"
    mobility = "mobility"
    other = "other"


class Sex(StrEnum):
    male = "male"
    female = "female"
    other = "other"
    unspecified = "unspecified"


class ExperienceLevel(StrEnum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Units(StrEnum):
    metric = "metric"
    imperial = "imperial"


class SplitType(StrEnum):
    push_pull = "push_pull"
    upper_lower = "upper_lower"
    full_body = "full_body"
    bro_split = "bro_split"
    ppl = "ppl"
    custom = "custom"


class ProgramStatus(StrEnum):
    active = "active"
    paused = "paused"
    completed = "completed"
    archived = "archived"


class BlockType(StrEnum):
    straight = "straight"
    superset = "superset"
    circuit = "circuit"
    giant_set = "giant_set"
    dropset = "dropset"


class SetType(StrEnum):
    working = "working"
    warmup = "warmup"
    dropset = "dropset"
    backoff = "backoff"
    amrap = "amrap"
    failure = "failure"


class SessionStatus(StrEnum):
    completed = "completed"
    partial = "partial"
    skipped = "skipped"


class CardioType(StrEnum):
    run = "run"
    walk = "walk"
    bike = "bike"
    row = "row"
    elliptical = "elliptical"
    swim = "swim"
    other = "other"


class CardioTiming(StrEnum):
    warmup = "warmup"
    pre = "pre"
    post = "post"
    standalone = "standalone"


class MetricSource(StrEnum):
    whoop = "whoop"
    garmin = "garmin"
    apple_watch = "apple_watch"
    polar = "polar"
    coros = "coros"
    manual = "manual"
    other = "other"


# --- shared ------------------------------------------------------------------


class RepRange(_Base):
    min: int | None = Field(default=None, ge=0)
    max: int | None = Field(default=None, ge=0)


# --- catalog / profile -------------------------------------------------------


class Athlete(_Base):
    id: str | None = None
    name: str | None = None
    birth_date: Date | None = None
    sex: Sex | None = None
    height_cm: float | None = Field(default=None, ge=0)
    bodyweight_kg: float | None = Field(default=None, ge=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    experience_level: ExperienceLevel | None = None
    goals: list[str] = Field(default_factory=list)
    preferred_units: Units = Units.metric
    timezone: str | None = None
    created_at: DateTime | None = None
    updated_at: DateTime | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class Exercise(_Base):
    id: str | None = None
    name: str = Field(min_length=1)
    aliases: list[str] = Field(default_factory=list)
    category: ExerciseCategory | None = None
    movement_pattern: MovementPattern | None = None
    primary_muscles: list[MuscleGroup] = Field(default_factory=list)
    secondary_muscles: list[MuscleGroup] = Field(default_factory=list)
    # Stabilisers / minor assistance: quarter credit in the muscle load model. Optional — a custom
    # exercise that only names primary and secondary movers behaves exactly as it did before.
    tertiary_muscles: list[MuscleGroup] = Field(default_factory=list)
    # Set when this exercise comes from (or was matched to) the global pool. Carries the canonical
    # identity so one movement keeps one history even if the display name changes.
    pool_slug: str | None = None
    equipment: list[Equipment] = Field(default_factory=list)
    is_unilateral: bool = False
    # Does this load the target muscle in a stretched position? Drives the recovery premium.
    # None means unstated, and the model falls back to inferring it from the movement pattern.
    long_length: bool | None = None
    default_rep_range: RepRange | None = None
    default_rest_sec: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)
    instructions: str | None = None
    video_url: str | None = None
    image_url: str | None = None
    created_at: DateTime | None = None
    updated_at: DateTime | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


# --- planning (programs / day templates) -------------------------------------


class BlockItem(_Base):
    exercise_id: str
    target_sets: int | None = Field(default=None, ge=0)
    target_reps: RepRange | None = None
    target_weight_kg: float | None = Field(default=None, ge=0)
    target_rir: float | None = Field(default=None, ge=0)
    rest_sec: int | None = Field(default=None, ge=0)
    notes: str | None = None


class Block(_Base):
    id: str | None = None
    label: str | None = None
    type: BlockType = BlockType.straight
    rounds: int | None = Field(default=None, ge=1)
    rest_after_block_sec: int | None = Field(default=None, ge=0)
    items: list[BlockItem] = Field(default_factory=list)


class DayTemplate(_Base):
    id: str | None = None
    name: str
    program_id: str | None = None
    focus: str | None = None
    estimated_duration_min: int | None = Field(default=None, ge=0)
    blocks: list[Block] = Field(default_factory=list)
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class Program(_Base):
    id: str | None = None
    name: str
    description: str | None = None
    goal: str | None = None
    frequency_per_week: int | None = Field(default=None, ge=0)
    split_type: SplitType | None = None
    day_template_ids: list[str] = Field(default_factory=list)
    start_date: Date | None = None
    end_date: Date | None = None
    status: ProgramStatus = ProgramStatus.active
    created_at: DateTime | None = None
    updated_at: DateTime | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


# --- sessions (the logged facts) ---------------------------------------------


class SetEntry(_Base):
    set_number: int = Field(ge=1)
    type: SetType = SetType.working
    # ge=0 everywhere: a transcription slip ("minus 24") stored as a negative weight poisons
    # volume, est-1RM and the muscle map silently — reject at the boundary instead. Upper bounds
    # on weight_kg/reps guard the same math against the opposite slip (an extra digit, "500000"
    # instead of "50") — unbounded, it silently poisons est-1RM (Epley) and wrecks the Progress
    # chart's y-axis instead of erroring.
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    reps: int | None = Field(default=None, ge=0, le=1000)
    rir: float | None = Field(default=None, ge=0)
    rpe: float | None = Field(default=None, ge=0, le=10)
    tempo: str | None = None
    rest_sec: int | None = Field(default=None, ge=0)
    duration_sec: int | None = Field(default=None, ge=0)
    distance_m: float | None = Field(default=None, ge=0)
    is_per_side: bool = False
    completed: bool = True
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class SessionEntry(_Base):
    id: str | None = None
    exercise_id: str
    order: int | None = None
    superset_group: str | None = None
    sets: list[SetEntry] = Field(default_factory=list)
    total_volume_kg: float | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class CardioActivity(_Base):
    id: str | None = None
    type: CardioType
    distance_m: float | None = Field(default=None, ge=0)
    duration_sec: int | None = Field(default=None, ge=0)
    avg_pace_sec_per_km: float | None = Field(default=None, ge=0)
    avg_hr: int | None = Field(default=None, ge=0)
    calories: float | None = Field(default=None, ge=0)
    timing: CardioTiming | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class HRZone(_Base):
    zone: int | None = Field(default=None, ge=0, le=5)
    name: str | None = None
    min_bpm: int | None = None
    max_bpm: int | None = None
    time_sec: int | None = None
    pct: float | None = Field(default=None, ge=0, le=100)


class Metrics(_Base):
    source: MetricSource | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    min_hr: int | None = None
    strain: float | None = None
    calories: float | None = None
    cardio_load_pct: float | None = Field(default=None, ge=0, le=100)
    muscular_load_pct: float | None = Field(default=None, ge=0, le=100)
    hr_zones: list[HRZone] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class Session(_Base):
    id: str | None = None
    athlete_id: str | None = None
    program_id: str | None = None
    day_template_id: str | None = None
    day_label: str | None = None
    date: Date
    start_time: DateTime | None = None
    end_time: DateTime | None = None
    duration_sec: int | None = Field(default=None, ge=0)
    location: str | None = None
    bodyweight_kg: float | None = Field(default=None, ge=0)
    session_rpe: float | None = Field(default=None, ge=0, le=10)
    energy_level: int | None = Field(default=None, ge=1, le=5)
    status: SessionStatus = SessionStatus.completed
    entries: list[SessionEntry] = Field(default_factory=list)
    cardio: list[CardioActivity] = Field(default_factory=list)
    metrics: Metrics | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: DateTime | None = None
    updated_at: DateTime | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class BodyMetric(_Base):
    id: str | None = None
    athlete_id: str | None = None
    date: Date
    bodyweight_kg: float | None = Field(default=None, ge=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    measurements: dict[str, float] = Field(default_factory=dict)
    source: str | None = None
    notes: str | None = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)


# --- top-level document (for import / export) --------------------------------


class WorkoutDocument(_Base):
    schema_version: str
    athletes: list[Athlete] = Field(default_factory=list)
    exercises: list[Exercise] = Field(default_factory=list)
    programs: list[Program] = Field(default_factory=list)
    day_templates: list[DayTemplate] = Field(default_factory=list)
    sessions: list[Session] = Field(default_factory=list)
    body_metrics: list[BodyMetric] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
