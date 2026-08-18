"""U-MODEL-1: the real example document parses and round-trips without data loss."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from workout_storage.models import SetEntry, WorkoutDocument

EXAMPLE = Path(__file__).parents[2] / "workout_example.json"


def load_doc() -> WorkoutDocument:
    raw = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    return WorkoutDocument.model_validate(raw)


def test_example_parses_with_expected_counts():
    doc = load_doc()
    assert doc.schema_version == "1.0.0"
    assert len(doc.athletes) == 1
    assert len(doc.exercises) == 10
    assert len(doc.programs) == 1
    assert len(doc.day_templates) == 1
    assert len(doc.sessions) == 1
    assert len(doc.body_metrics) == 1


def test_nested_values_survive():
    doc = load_doc()
    session = doc.sessions[0]
    assert session.day_label == "День A"
    first_entry = session.entries[0]
    assert first_entry.exercise_id == "ex_lat_pulldown"
    first_set = first_entry.sets[0]
    assert first_set.weight_kg == 55
    assert first_set.reps == 12
    assert first_set.rir == 2
    # bodyweight/timed set: plank has null weight + duration
    plank_entry = next(e for e in session.entries if e.exercise_id == "ex_plank")
    assert plank_entry.sets[0].weight_kg is None
    assert plank_entry.sets[0].duration_sec == 30
    # wearable metrics
    assert session.metrics is not None
    assert session.metrics.source.value == "whoop"
    assert session.metrics.strain == 12.0


@pytest.mark.parametrize("weight_kg,reps", [(-20, None), (None, -1), (1001, None), (None, 1001)])
def test_set_entry_rejects_out_of_range_weight_and_reps(weight_kg, reps):
    # Regression guard: an unbounded weight_kg/reps let a transcription slip ("500000" instead of
    # "50") through validation and silently poison est-1RM (Epley) plus wreck the Progress chart's
    # y-axis, instead of erroring like the existing negative-number guard does.
    with pytest.raises(ValidationError):
        SetEntry(set_number=1, weight_kg=weight_kg, reps=reps)


def test_set_entry_accepts_realistic_boundary_values():
    SetEntry(set_number=1, weight_kg=1000, reps=1000)
    SetEntry(set_number=1, weight_kg=0, reps=0)


def test_round_trip_is_lossless():
    """Dumping to JSON-mode dict and re-validating yields an equal model."""
    doc = load_doc()
    again = WorkoutDocument.model_validate(doc.model_dump(mode="json"))
    assert again == doc
