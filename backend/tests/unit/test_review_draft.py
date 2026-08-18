"""Unit tests for the review_program_draft rule engine (pure function, no DB)."""

from workout_storage.models import Exercise, WorkoutDocument
from workout_storage.services import _review_draft

CATALOG = {
    "barbell-squat": {
        "name": "Barbell squat",
        "equipment": ["barbell"],
        "primary_muscles": ["quads"],
    },
    "push-up": {"name": "Push-up", "equipment": ["bodyweight"], "primary_muscles": ["chest"]},
    "shoulder-press": {
        "name": "Shoulder press",
        "equipment": ["dumbbell"],
        "primary_muscles": ["shoulders"],
    },
}

PROFILE = {
    "training_days_per_week": 2,
    "session_length_min": 60,
    "equipment": ["barbell", "dumbbell"],
    "injuries": [{"area": "shoulder", "active": True}],
}


def _doc(items, *, frequency=2, duration=45):
    return WorkoutDocument(
        schema_version="1.0",
        programs=[{"id": "p1", "name": "Test", "frequency_per_week": frequency}],
        day_templates=[
            {
                "id": "d1",
                "name": "Day A",
                "program_id": "p1",
                "estimated_duration_min": duration,
                "blocks": [{"items": items}],
            }
        ],
    )


def _item(**kw):
    return {
        "exercise_id": "barbell-squat",
        "target_sets": 3,
        "target_reps": {"min": 8, "max": 10},
        **kw,
    }


def test_clean_draft_passes():
    out = _review_draft(_doc([_item(target_weight_kg=40)]), PROFILE, CATALOG)
    assert out["ok"], out["violations"]
    assert out["violations"] == []


def test_loaded_exercise_without_weight_or_note_fails():
    out = _review_draft(_doc([_item()]), PROFILE, CATALOG)
    assert not out["ok"]
    assert any("target_weight_kg" in v for v in out["violations"])


def test_calibration_note_counts_as_load_prescription():
    out = _review_draft(
        _doc([_item(notes="first session: calibrate — ramp up until the last reps are hard")]),
        PROFILE,
        CATALOG,
    )
    assert out["ok"], out["violations"]


def test_bodyweight_exercise_needs_no_weight():
    out = _review_draft(_doc([_item(exercise_id="push-up")]), PROFILE, CATALOG)
    assert out["ok"], out["violations"]


def test_unknown_exercise_flagged_unless_in_document():
    out = _review_draft(_doc([_item(exercise_id="mystery-lift")]), PROFILE, CATALOG)
    assert any("not in the user's catalog" in v for v in out["violations"])
    doc = _doc([_item(exercise_id="mystery-lift", target_weight_kg=20)])
    doc.exercises = [
        Exercise(
            id="mystery-lift",
            name="Mystery lift",
            equipment=["dumbbell"],
            primary_muscles=["lats"],
        )
    ]
    out = _review_draft(doc, PROFILE, CATALOG)
    assert out["ok"], out["violations"]


def test_equipment_mismatch_fails():
    profile = {**PROFILE, "equipment": ["dumbbell"]}
    out = _review_draft(_doc([_item(target_weight_kg=40)]), profile, CATALOG)
    assert any("needs" in v and "barbell" in v for v in out["violations"])


def test_injury_overlap_warns_but_does_not_block():
    out = _review_draft(
        _doc([_item(exercise_id="shoulder-press", target_weight_kg=10)]), PROFILE, CATALOG
    )
    assert out["ok"]
    assert any("shoulder" in w for w in out["warnings"])


def test_budget_overruns_fail():
    too_long = _review_draft(_doc([_item(target_weight_kg=40)], duration=90), PROFILE, CATALOG)
    assert any("session_length_min" in v for v in too_long["violations"])
    too_frequent = _review_draft(_doc([_item(target_weight_kg=40)], frequency=5), PROFILE, CATALOG)
    assert any("days/week" in v for v in too_frequent["violations"])


def test_day_template_missing_program_id_link_fails():
    # Regression guard: get_program() resolves a program's days via day_template.program_id, not
    # via the program's own day_template_ids list — a document that sets the latter but forgets
    # the former imports cleanly and then silently shows zero days on Home.
    doc = WorkoutDocument(
        schema_version="1.0",
        programs=[{"id": "p1", "name": "Test", "day_template_ids": ["d1"]}],
        day_templates=[{"id": "d1", "name": "Day A", "blocks": [{"items": [_item()]}]}],
    )
    out = _review_draft(doc, PROFILE, CATALOG)
    assert not out["ok"]
    assert any("program_id" in v and "d1" in v for v in out["violations"])


def test_day_template_referenced_but_absent_from_document_fails():
    doc = WorkoutDocument(
        schema_version="1.0",
        programs=[{"id": "p1", "name": "Test", "day_template_ids": ["ghost"]}],
        day_templates=[
            {"id": "d1", "name": "Day A", "program_id": "p1", "blocks": [{"items": [_item()]}]}
        ],
    )
    out = _review_draft(doc, PROFILE, CATALOG)
    assert not out["ok"]
    assert any("ghost" in v for v in out["violations"])


def test_day_template_correctly_linked_via_program_id_passes():
    doc = WorkoutDocument(
        schema_version="1.0",
        programs=[{"id": "p1", "name": "Test", "day_template_ids": ["d1"]}],
        day_templates=[
            {
                "id": "d1",
                "name": "Day A",
                "program_id": "p1",
                "blocks": [{"items": [_item(target_weight_kg=40)]}],
            }
        ],
    )
    out = _review_draft(doc, PROFILE, CATALOG)
    assert out["ok"], out["violations"]
