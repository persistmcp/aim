"""Unit tests for the coaching layer: patch validation, intake status, ui_impact, assembly."""

import pytest
from pydantic import ValidationError

from workout_storage import coach, prompts
from workout_storage.coach import (
    CORE_FIELDS,
    UI_IMPACT,
    CoachProfilePatch,
    ParqFlags,
    compute_intake_status,
    ui_impact_for,
)

# --- models -------------------------------------------------------------------


def test_patch_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        CoachProfilePatch(favourite_color="red")


def test_patch_validates_enums_and_ranges():
    with pytest.raises(ValidationError):
        CoachProfilePatch(primary_goal="get_swole")
    with pytest.raises(ValidationError):
        CoachProfilePatch(training_days_per_week=0)
    with pytest.raises(ValidationError):
        CoachProfilePatch(confidence_score=11)
    patch = CoachProfilePatch(primary_goal="strength", locations=["home"], equipment=["dumbbell"])
    assert patch.primary_goal == coach.PrimaryGoal.strength


def test_patch_accepts_anthropometrics_and_routes_them():
    patch = CoachProfilePatch(sex="female", birth_date="1998-04-12", bodyweight_kg=61.5)
    dumped = patch.model_dump(mode="json", exclude_unset=True)
    assert set(dumped) == {"sex", "birth_date", "bodyweight_kg"}
    assert all(f in coach.USER_PROFILE_FIELDS for f in dumped)
    with pytest.raises(ValidationError):
        CoachProfilePatch(bodyweight_kg=-5)


def test_anthropometrics_never_gate_intake():
    """sex/birth_date/bodyweight are skippable — they must not be in the blocking set."""
    assert not set(coach.USER_PROFILE_FIELDS) & set(CORE_FIELDS)


def test_age_years():
    from datetime import date

    from workout_storage.services import _age_years

    assert _age_years(None) is None
    today = date.today()
    assert _age_years(today.replace(year=today.year - 30)) == 30


def test_parq_red_flag_detection():
    assert ParqFlags(chest_pain=True).any_red_flag()
    assert not ParqFlags(bone_joint_problem=True).any_red_flag()  # joint issue ≠ clearance case
    assert not ParqFlags(heart_condition=False, dizziness=False).any_red_flag()


# --- ui impact map -------------------------------------------------------------


def test_every_patch_field_has_ui_impact_entry():
    """The map is the tool-contract source for ui_impact: silence must be explicit (empty list),
    not a missing key, so new profile fields can't skip the decision."""
    for field in CoachProfilePatch.model_fields:
        assert field in UI_IMPACT, f"UI_IMPACT missing entry for {field}"


def test_ui_impact_dedupes_and_orders():
    out = ui_impact_for(["add_injuries", "resolve_injury_areas", "primary_goal"])
    assert out.count("muscle_map_injury_badge") == 1
    assert "dashboard_layout" in out
    assert ui_impact_for(["motivation"]) == []


# --- intake status --------------------------------------------------------------


def _core_profile() -> dict:
    return {
        "primary_goal": "hypertrophy",
        "motivation": "хочу быть сильным",
        "experience_level": "intermediate",
        "training_days_per_week": 3,
        "locations": ["gym"],
        "equipment": ["barbell"],
        "parq_flags": {"heart_condition": False},
    }


def test_intake_status_progression():
    assert compute_intake_status({}) == "not_started"
    assert compute_intake_status({"primary_goal": "strength"}) == "in_progress"
    assert compute_intake_status(_core_profile()) == "core_complete"
    # Empty containers don't count as answered.
    partial = {**_core_profile(), "equipment": []}
    assert compute_intake_status(partial) == "in_progress"
    # Never downgrades enriched.
    assert compute_intake_status({"intake_status": "enriched"}) == "enriched"


def test_core_fields_are_patchable():
    """Every blocking intake field must be reachable through the patch model."""
    for f in CORE_FIELDS:
        assert f in CoachProfilePatch.model_fields


def test_intake_gate_predicate_fails_closed():
    assert coach.is_intake_complete("core_complete")
    assert coach.is_intake_complete("enriched")
    assert not coach.is_intake_complete("in_progress")
    assert not coach.is_intake_complete(None)
    assert not coach.is_intake_complete("paused")  # unknown future status must NOT unlock


# --- assembly --------------------------------------------------------------------


def _assemble(task="next_workout", profile=None, goals=None, training=None, **kw):
    return prompts.assemble(
        task, prompts.TEMPLATES, profile or _core_profile(), goals or [], training or {}, **kw
    )


def test_all_tasks_assemble_with_fallback_templates():
    for task in coach.CoachTask:
        out = prompts.assemble(task.value, prompts.TEMPLATES, _core_profile(), [], {})
        assert out["prompt"]


def test_intake_skips_methodology_and_contract():
    out = _assemble(task="intake")
    assert "Hypertrophy methodology" not in out["prompt"]
    assert "import_document" not in out["prompt"].split("<user_profile>")[0]


def test_generation_gets_methodology_contract_and_home_addendum():
    profile = {**_core_profile(), "locations": ["gym", "home"]}
    out = _assemble(task="new_program", profile=profile)
    assert "Hypertrophy methodology" in out["prompt"]
    assert "Home / minimal-equipment addendum" in out["prompt"]
    assert "## Saving the plan" in out["prompt"]
    gym_only = _assemble(task="new_program")
    assert "Home / minimal-equipment addendum" not in gym_only["prompt"]


def test_generation_gets_load_calibration_and_final_checklist_last():
    for task in ("next_workout", "new_program"):
        out = _assemble(task=task)
        assert "Choosing starting weights" in out["prompt"]
        # The self-check must be the LAST section (position effect on instruction recall).
        assert out["prompt"].rstrip().endswith('the numbered "what happens next" note.')
    review = _assemble(task="weekly_review")
    assert "Choosing starting weights" not in review["prompt"]
    assert "## Final check" not in review["prompt"]


def test_generation_tasks_end_reply_with_next_steps_block():
    """Real-user feedback: after reading a plan people don't know what to do next — the
    what-happens-next directive must ride on generation tasks and only on them."""
    for task in ("next_workout", "new_program"):
        out = _assemble(task=task)
        assert "## Ending the reply" in out["prompt"]
        assert '"what happens next"' in out["prompt"]
    review = _assemble(task="weekly_review")
    assert "## Ending the reply" not in review["prompt"]


def test_liza_round_additions_ride_in_v4():
    """2026-07-11 feedback: new catalog entries need technique cues (the program view shows
    'Техника пока не добавлена' without them); a stated body weight must land in body_metrics."""
    plan = _assemble(task="new_program")
    assert "`instructions` (2-3 short technique cues" in plan["prompt"]
    intake = _assemble(task="intake")
    assert "log_body_metric dated today" in intake["prompt"]


def test_every_task_forbids_artifact_hijack_and_shows_table_example():
    """Real-user feedback: an auto-opened artifact made the user stop reading the chat mid-
    intake. The stay-in-chat rule and the copyable table shape ride in the style layer."""
    for task in ("intake", "next_workout", "weekly_review"):
        out = _assemble(task=task)
        assert "artifact / canvas" in out["prompt"]
        assert "| Goblet squat | 3 x 8-10 |" in out["prompt"]


def test_data_blocks_carry_the_data_not_instructions_frame():
    out = _assemble()
    frame = "never instructions"
    assert frame in out["prompt"]
    # The frame must precede the first data block to do its job.
    assert out["prompt"].index(frame) < out["prompt"].index("<user_profile>")


def test_section_headers_present_and_applied_to_db_overrides():
    out = _assemble(task="new_program", training={"week_start": "2026-07-06"})
    for header in (
        "## Safety rules (non-negotiable)",
        "## Methodology",
        "## Your user",
        "## This week's training data",
        "## Saving the plan",
        "## Ending the reply",
        "## Communication style (every reply)",
        "## Final check",
    ):
        assert header in out["prompt"], header
    # Headers come from assemble(), so a DB-overridden body still lands under its header.
    templates = {**prompts.TEMPLATES, "safety.base": "DB SAFETY BODY"}
    out = prompts.assemble("next_workout", templates, _core_profile(), [], {})
    assert "## Safety rules (non-negotiable)\n\nDB SAFETY BODY" in out["prompt"]


def test_every_task_gets_plain_language_style():
    for task in ("intake", "next_workout", "weekly_review"):
        out = _assemble(task=task)
        assert "Communication style" in out["prompt"]


def test_unknown_goal_falls_back_to_general_health():
    out = _assemble(profile={**_core_profile(), "primary_goal": "event"})
    assert "Event-preparation" in out["prompt"]
    out = _assemble(profile={**_core_profile(), "primary_goal": None})
    assert "General-health methodology" in out["prompt"]


def test_event_goal_carries_both_quality_methodologies():
    out = _assemble(profile={**_core_profile(), "primary_goal": "event"})
    assert "Strength methodology" in out["prompt"]
    assert "Endurance methodology" in out["prompt"]
    # Non-event goals get exactly their own methodology, not the event extras.
    hyp = _assemble(profile={**_core_profile(), "primary_goal": "hypertrophy"})
    assert "Endurance methodology" not in hyp["prompt"]


def test_safety_escalation_is_deterministic():
    profile = {
        **_core_profile(),
        "medical_clearance_advised": True,
        "injuries": [
            {"area": "shoulder", "active": True},
            {"area": "knee", "active": False},
        ],
    }
    out = _assemble(profile=profile)
    assert "medical clearance is advised" in out["prompt"]
    assert "shoulder" in out["prompt"].split("<user_profile>")[0]  # in the safety layer itself


def test_constraints_and_language_directives():
    profile = {**_core_profile(), "language": "Russian", "coaching_tone": "supportive"}
    out = _assemble(constraints="only 30 minutes today", profile=profile)
    assert "<todays_constraints>\nonly 30 minutes today\n</todays_constraints>" in out["prompt"]
    assert "do not save to the profile" in out["prompt"]
    assert "Reply in Russian." in out["prompt"]
    assert "tone: supportive" in out["prompt"]
    default = _assemble()
    assert "language the user writes in" in default["prompt"]


def test_profile_summary_is_budget_capped():
    profile = {**_core_profile(), "profile_summary": "x" * 5000}
    out = _assemble(profile=profile)
    assert "x" * prompts.PROFILE_SUMMARY_MAX_CHARS not in out["prompt"]


def test_free_text_fields_capped_and_noise_dropped():
    profile = {
        **_core_profile(),
        "motivation": "м" * 2000,
        "created_at": "2026-07-02T00:00:00Z",
    }
    out = _assemble(profile=profile)
    assert "м" * (prompts.FREE_TEXT_MAX_CHARS + 1) not in out["prompt"]
    assert "created_at" not in out["prompt"]


def test_resolved_injuries_stay_out_of_the_prompt():
    profile = {
        **_core_profile(),
        "injuries": [
            {"area": "shoulder", "active": True},
            {"area": "old_knee_issue", "active": False},
        ],
    }
    out = _assemble(profile=profile)
    assert "old_knee_issue" not in out["prompt"]
    assert "shoulder" in out["prompt"]


def test_db_override_wins_over_fallback():
    templates = {**prompts.TEMPLATES, "task.next_workout": "OVERRIDDEN BY DB"}
    out = prompts.assemble("next_workout", templates, _core_profile(), [], {})
    assert out["prompt"].startswith("OVERRIDDEN BY DB")


# --- goal type taxonomy (2026-07-18) ------------------------------------------


def test_infer_goal_type_explicit_wins():
    assert coach.infer_goal_type({"goal_type": "trend", "metric": "sessions_per_week"}) == "trend"


def test_infer_goal_type_legacy_metric_inference():
    assert coach.infer_goal_type({"metric": "sessions_per_week"}) == coach.GoalType.frequency
    assert coach.infer_goal_type({"metric": "e1rm"}) == coach.GoalType.milestone
    assert coach.infer_goal_type({"metric": "weight"}) == coach.GoalType.milestone
    assert coach.infer_goal_type({"metric": "reps"}) == coach.GoalType.milestone
    assert coach.infer_goal_type({"metric": "bodyweight"}) == coach.GoalType.milestone


def test_infer_goal_type_defaults_to_milestone():
    # No target at all, and an unrecognized/free-form metric, both fall back to milestone —
    # never crash, never silently classify as something a missing-data check can't handle.
    assert coach.infer_goal_type(None) == coach.GoalType.milestone
    assert coach.infer_goal_type({}) == coach.GoalType.milestone
    assert coach.infer_goal_type({"metric": "run a 5k"}) == coach.GoalType.milestone


def test_goal_target_accepts_new_fields():
    target = coach.GoalTarget(
        goal_type="weekly_volume", muscle="chest", band="mev_mav", tolerance_pct=15
    )
    assert target.goal_type == coach.GoalType.weekly_volume
    assert target.band == coach.GoalTargetBand.mev_mav


def test_goal_target_rejects_trend_with_unsupported_metric():
    # trend charts only exist for per-exercise e1rm/weight progressions — volume/reps trend
    # goals were previously accepted and rendered title-only forever (no validation existed).
    for bad_metric in ("volume", "reps", "bodyweight"):
        with pytest.raises(ValidationError, match="trend goals only support"):
            coach.GoalTarget(goal_type="trend", exercise_id="bench", metric=bad_metric)


def test_goal_target_accepts_trend_with_supported_or_absent_metric():
    for ok_metric in ("e1rm", "weight", None):
        target = coach.GoalTarget(goal_type="trend", exercise_id="bench", metric=ok_metric)
        assert target.goal_type == coach.GoalType.trend


def test_goal_target_metric_unconstrained_for_non_trend_types():
    # Free-form metrics stay allowed: an aspiration like "run a marathon" is title-only by
    # intent, and legacy rows (no goal_type) keep writing exactly as before.
    assert coach.GoalTarget(goal_type="milestone", metric="volume").metric == "volume"
    assert coach.GoalTarget(metric="volume").metric == "volume"  # legacy, no goal_type


def test_goal_target_milestone_requires_exercise_and_value_for_computable_metrics():
    # A milestone on e1rm/weight/reps without exercise_id (or without a target value) can never
    # resolve progress — previously accepted and rendered title-only forever.
    with pytest.raises(ValidationError, match="need exercise_id"):
        coach.GoalTarget(goal_type="milestone", metric="weight", value=110)
    with pytest.raises(ValidationError, match="need a target `value`"):
        coach.GoalTarget(goal_type="milestone", metric="weight", exercise_id="bench")
    ok = coach.GoalTarget(goal_type="milestone", metric="weight", exercise_id="bench", value=110)
    assert ok.value == 110


def test_goal_target_bodyweight_milestone_requires_baseline():
    with pytest.raises(ValidationError, match="baseline_value"):
        coach.GoalTarget(goal_type="milestone", metric="bodyweight", value=85)
    ok = coach.GoalTarget(goal_type="milestone", metric="bodyweight", value=85, baseline_value=92)
    assert ok.baseline_value == 92


def test_goal_target_weekly_volume_requires_muscle():
    with pytest.raises(ValidationError, match="need `muscle`"):
        coach.GoalTarget(goal_type="weekly_volume", band="mev")


def test_goal_target_maintenance_requires_baseline():
    with pytest.raises(ValidationError, match="baseline_value"):
        coach.GoalTarget(goal_type="maintenance", tolerance_pct=10)


def test_goal_input_rejects_featured_frequency_goal():
    # Was prompt-guidance only; a frequency goal resets weekly, so the featured card's
    # finish-line framing is actively wrong for it.
    with pytest.raises(ValidationError, match="never be featured"):
        coach.GoalInput(
            kind="process",
            title="4 тренировки в неделю",
            target=coach.GoalTarget(metric="sessions_per_week", value=4),
            featured=True,
        )
    ok = coach.GoalInput(
        kind="process",
        title="4 тренировки в неделю",
        target=coach.GoalTarget(metric="sessions_per_week", value=4),
    )
    assert ok.featured is False


def test_goal_target_tolerance_pct_is_bounded():
    with pytest.raises(ValidationError):
        coach.GoalTarget(tolerance_pct=101)
    with pytest.raises(ValidationError):
        coach.GoalTarget(tolerance_pct=-1)


def test_goal_input_featured_and_supersedes_default_and_round_trip():
    goal = coach.GoalInput(kind="outcome", title="Bench 100kg")
    assert goal.featured is False
    assert goal.supersedes_goal_id is None
    dumped = coach.GoalInput(
        kind="outcome", title="Maintain bench", featured=True, supersedes_goal_id="abc-123"
    ).model_dump(mode="json", exclude_unset=True)
    assert dumped["featured"] is True
    assert dumped["supersedes_goal_id"] == "abc-123"


# --- the coaching surface: server instructions plus data-only context (coaching.py) -------------


def test_the_server_does_not_send_someone_logging_a_workout_into_the_intake() -> None:
    """Someone whose first message is "I benched 60 for 10" wants a saved workout, not an
    interview. The carve-out is pinned: recording is saved directly by log_session or
    import_document and is named as not using the coaching context, and it sits in the first 512
    characters, the part every client is known to keep."""
    from workout_storage.coaching import SERVER_INSTRUCTIONS
    from workout_storage.server import mcp

    assert mcp.instructions == SERVER_INSTRUCTIONS
    assert len(SERVER_INSTRUCTIONS) <= 2048
    text = " ".join(SERVER_INSTRUCTIONS.lower().split())
    head = text[:512]
    assert "recording does not use the coaching context" in head
    assert "saved directly with log_session" in head
    assert "import_document" in head
    assert "at the start of any training-related conversation" not in text


def test_the_instructions_name_only_fields_the_context_returns() -> None:
    """The instructions describe the payload by field name; a field they name that the server
    never returns is an instruction the assistant cannot follow."""
    from workout_storage.coaching import SERVER_INSTRUCTIONS

    for absent in ("residual_load_by_muscle", "logged_in_app", "runner"):
        assert absent not in SERVER_INSTRUCTIONS, absent


@pytest.mark.parametrize(
    ("area", "region"),
    [
        ("right knee", "knee"),
        ("правое колено", "knee"),
        ("поясница", "lower_back"),
        ("left shoulder", "shoulder"),
        # "предплечье" (forearm) contains "плеч" (shoulder): wrist must be tried first, or a
        # forearm strain would take overhead pressing off the plan and leave curls on it.
        ("предплечье", "wrist"),
    ],
)
def test_an_injury_area_resolves_to_the_region_that_loads_it(area, region):
    from workout_storage import coaching

    resolved = coaching.injury_region(area)
    assert resolved is not None, area
    assert resolved["region"] == region


@pytest.mark.parametrize("area", ["upper back", "qwerty zzz", "", None])
def test_an_area_the_map_cannot_place_is_reported_unplaced_rather_than_guessed(area):
    """ "upper back" contains "back", which would read as lower back and take every hinge off the
    plan for a trapezius strain. Unplaced is None, and the context then says loads=null."""
    from workout_storage import coaching

    assert coaching.injury_region(area) is None


def test_the_context_names_the_users_exercises_that_load_an_injury():
    from workout_storage import coaching

    profile = {**_core_profile(), "injuries": [{"area": "right knee", "active": True}]}
    catalog = [
        {"id": "goblet_squat", "movement_pattern": "squat", "primary_muscles": ["quads"]},
        {"id": "leg_extension", "movement_pattern": "isolation", "primary_muscles": ["quads"]},
        {"id": "push_up", "movement_pattern": "horizontal_push", "primary_muscles": ["chest"]},
    ]
    ctx = coaching.build_context(
        "next_workout", profile, [], {}, intake_complete=True, catalog=catalog
    )
    [injury] = ctx["safety"]["injuries"]
    assert injury["loads"]["region"] == "knee"
    assert injury["catalog_exercises_loading_it"] == ["goblet_squat", "leg_extension"]
    assert "prompt" not in ctx


def test_unknown_screening_does_not_read_as_a_clean_one():
    """parq_flags=None means the health questions were never asked; a bare
    medical_clearance_advised=false would hide that, so the status says it outright."""
    from workout_storage import coaching

    never_asked = {k: v for k, v in _core_profile().items() if k != "parq_flags"}
    ctx = coaching.build_context("next_workout", never_asked, [], {}, intake_complete=False)
    assert ctx["safety"]["screening_status"] == "not_assessed"
    assert ctx["safety"]["medical_clearance_advised"] is None
    answered = coaching.build_context("next_workout", _core_profile(), [], {}, intake_complete=True)
    assert answered["safety"]["screening_status"] == "answered"


def test_intake_offers_exactly_the_values_the_profile_patch_accepts():
    """`next_field_options` is what the assistant shows the user to pick from. A value the patch
    accepts but the options leave out is one nobody is offered — here "returning", the level for
    someone back after a long break."""
    from workout_storage import coaching

    options = coaching.intake_field_options()
    assert set(options["experience_level"]) == {e.value for e in coach.CoachExperience}
    assert set(options["primary_goal"]) == {g.value for g in coach.PrimaryGoal}
    assert set(options["locations"]) == {loc.value for loc in coach.Location}


def test_first_load_estimates_cover_only_the_kit_the_user_has():
    """A home trainee with dumbbells and a band gets no barbell numbers, and their dumbbell lower
    bound comes from their own range, not the bar's 20 kg floor. Unknown equipment (empty) is
    unknown, not "none", so every kit is given then."""
    from workout_storage import coaching

    home = coaching.first_session_load_estimates(
        {"sex": "female", "bodyweight_kg": 72, "equipment": ["dumbbell", "resistance_band"]}
    )
    assert "barbell_compound_kg" not in home and "empty_barbell_kg" not in home
    assert home["dumbbell_compound_kg_per_hand"] == [5.0, 11.0]
    assert home["dumbbell_isolation_kg_per_hand"] == [3, 6]

    gym = coaching.first_session_load_estimates(
        {"sex": "male", "bodyweight_kg": 82, "equipment": ["barbell"]}
    )
    assert gym["barbell_compound_kg"] == [22.5, 50.0]
    assert "dumbbell_compound_kg_per_hand" not in gym

    unknown = coaching.first_session_load_estimates({})
    assert {"barbell_compound_kg", "dumbbell_compound_kg_per_hand"} <= set(unknown)


def test_bodyweight_in_the_profile_feeds_no_app_surface():
    """The weight tile and chart read body_metrics rows (log_body_metric), never the profile
    field, so a write to it must not claim to update the chart."""
    assert coach.ui_impact_for(["bodyweight_kg"]) == []
