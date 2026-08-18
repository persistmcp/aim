"""Integration tests for repo.py against a real Postgres (testcontainers).

Covers I-REPO-1..6 from docs/TEST_CASES.md.
"""

from datetime import date

import psycopg
import pytest
import pytest_asyncio

from workout_storage import repo
from workout_storage.models import BodyMetric, Exercise, Session

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def user_id(conn):
    user = await repo.create_user(conn, name="Test", timezone="Europe/Lisbon")
    return str(user["id"])


@pytest_asyncio.fixture
async def user_b(conn):
    user = await repo.create_user(conn, name="Other")
    return str(user["id"])


async def test_create_user_returns_id_and_token(conn):
    """I-REPO-1: insert user → row with id + token."""
    user = await repo.create_user(conn, name="Alex")
    assert user["id"] is not None
    assert isinstance(user["token"], str) and len(user["token"]) >= 20
    assert (await repo.get_user_by_token(conn, user["token"]))["name"] == "Alex"


async def test_token_unique_constraint(conn):
    """I-REPO-1: duplicate token is rejected."""
    await repo.create_user(conn, name="A", token="fixed-token-123")
    with pytest.raises(psycopg.errors.UniqueViolation):
        await repo.create_user(conn, name="B", token="fixed-token-123")


async def test_log_and_get_session(conn, user_id, example_doc):
    """I-REPO-2: nested session persists and reads back, scoped to the user."""
    session = Session.model_validate(example_doc["sessions"][0])
    session_id = await repo.insert_session(conn, user_id, session)

    got = await repo.get_session(conn, user_id, session_id)
    assert got is not None
    assert got["day_label"] == "День A"
    assert len(got["entries"]) == len(session.entries)
    first = next(e for e in got["entries"] if e["exercise_id"] == "ex_lat_pulldown")
    assert first["sets"][0]["weight_kg"] == 55
    # wearable metrics + cardio came along
    assert got["metrics"]["source"] == "whoop"
    assert len(got["cardio"]) == 1
    # referenced exercises were auto-created in the catalog
    names = {e["id"] for e in await repo.list_exercises(conn, user_id)}
    assert "ex_lat_pulldown" in names


async def test_update_set_fixes_one_metric(conn, user_id, example_doc):
    """I-REPO-3: update_set changes one set; siblings untouched."""
    session = Session.model_validate(example_doc["sessions"][0])
    session_id = await repo.insert_session(conn, user_id, session)

    updated = await repo.update_set(
        conn, user_id, session_id, "ex_lat_pulldown", 1, {"weight_kg": 60, "reps": 11}
    )
    assert updated["weight_kg"] == 60
    assert updated["reps"] == 11

    got = await repo.get_session(conn, user_id, session_id)
    entry = next(e for e in got["entries"] if e["exercise_id"] == "ex_lat_pulldown")
    assert entry["sets"][0]["weight_kg"] == 60
    assert entry["sets"][1]["weight_kg"] == 55  # untouched


async def test_update_set_targets_one_occurrence(conn, user_id):
    """#1: same exercise twice in a session → update_set hits exactly one, chosen by occurrence."""
    session = Session.model_validate(
        {
            "date": "2026-06-10",
            "entries": [
                {
                    "exercise_id": "ex_x",
                    "order": 1,
                    "sets": [{"set_number": 1, "weight_kg": 50, "reps": 10}],
                },
                {
                    "exercise_id": "ex_x",
                    "order": 2,
                    "sets": [{"set_number": 1, "weight_kg": 60, "reps": 8}],
                },
            ],
        }
    )
    sid = await repo.insert_session(conn, user_id, session)

    r1 = await repo.update_set(conn, user_id, sid, "ex_x", 1, {"weight_kg": 55}, occurrence=1)
    assert r1["weight_kg"] == 55
    r2 = await repo.update_set(conn, user_id, sid, "ex_x", 1, {"weight_kg": 65}, occurrence=2)
    assert r2["weight_kg"] == 65

    got = await repo.get_session(conn, user_id, sid)
    weights = sorted(float(e["sets"][0]["weight_kg"]) for e in got["entries"])
    assert weights == [55, 65]  # each occurrence updated independently, no cross-contamination


async def test_update_set_recomputes_entry_volume(conn, user_id, example_doc):
    """#8: changing a set's weight updates the volume seen by list_sessions / stats."""
    session = Session.model_validate(example_doc["sessions"][0])
    sid = await repo.insert_session(conn, user_id, session)
    before = float((await repo.list_sessions(conn, user_id))[0]["total_volume_kg"])

    await repo.update_set(conn, user_id, sid, "ex_lat_pulldown", 1, {"weight_kg": 1000})
    after = float((await repo.list_sessions(conn, user_id))[0]["total_volume_kg"])
    assert after > before


async def test_delete_session_cascades(conn, user_id, example_doc):
    """I-REPO-4: deleting a session removes its entries and sets."""
    session = Session.model_validate(example_doc["sessions"][0])
    session_id = await repo.insert_session(conn, user_id, session)

    assert await repo.delete_session(conn, user_id, session_id) is True
    assert await repo.get_session(conn, user_id, session_id) is None
    async with conn.cursor() as cur:
        await cur.execute("select count(*) as n from sets where user_id = %s", [user_id])
        assert (await cur.fetchone())["n"] == 0


async def test_queries_are_user_scoped(conn, user_id, user_b, example_doc):
    """I-REPO-5: user B cannot read user A's session."""
    session = Session.model_validate(example_doc["sessions"][0])
    session_id = await repo.insert_session(conn, user_id, session)

    assert await repo.get_session(conn, user_b, session_id) is None
    assert await repo.list_sessions(conn, user_b) == []
    assert len(await repo.list_sessions(conn, user_id)) == 1


async def test_body_metrics_and_exercise_catalog(conn, user_id, example_doc):
    """I-REPO-6: body metrics insert/read; exercise upsert/list."""
    bm = BodyMetric.model_validate(example_doc["body_metrics"][0])
    await repo.insert_body_metric(conn, user_id, bm)
    rows = await repo.list_body_metrics(conn, user_id)
    assert len(rows) == 1
    assert float(rows[0]["bodyweight_kg"]) == 90
    assert rows[0]["measurements"]["chest_cm"] == 105

    ex = Exercise.model_validate(example_doc["exercises"][0])
    saved = await repo.upsert_exercise(conn, user_id, ex)
    assert saved["name"] == "Тяга верхнего блока"
    # upsert again with a changed name updates in place
    ex.name = "Тяга верхнего блока (обновл.)"
    await repo.upsert_exercise(conn, user_id, ex)
    names = [e["name"] for e in await repo.list_exercises(conn, user_id) if e["id"] == ex.id]
    assert names == ["Тяга верхнего блока (обновл.)"]


async def test_weekly_muscle_rows_includes_date(conn, user_id, example_doc):
    """weekly_muscle_rows must carry the session's date — needed to bucket a weekly_volume/
    maintenance goal's multi-week history by ISO week (services._weekly_muscle_history,
    2026-07-18)."""
    session = Session.model_validate(example_doc["sessions"][0])
    await repo.insert_session(conn, user_id, session)
    rows = await repo.weekly_muscle_rows(conn, user_id, date_from=date(2000, 1, 1))
    assert rows
    assert all(r["date"] == session.date for r in rows)


async def test_body_metric_same_date_upserts_not_duplicates(conn, user_id):
    """Regression, 2026-07-12: re-logging a manual (no external_id) body metric for a date that
    already has one corrects that row instead of creating an ambiguous second one. Imported
    metrics (external_id set) are exempt — a real source document may carry more than one
    measurement per date."""
    first = await repo.insert_body_metric(
        conn, user_id, BodyMetric(date="2026-07-01", bodyweight_kg=82.5)
    )
    second = await repo.insert_body_metric(
        conn, user_id, BodyMetric(date="2026-07-01", bodyweight_kg=83.0)
    )
    rows = await repo.list_body_metrics(conn, user_id)
    assert len(rows) == 1
    assert float(rows[0]["bodyweight_kg"]) == 83.0
    assert first["id"] == second["id"]  # same row, corrected in place

    # A different date is a genuinely new entry, not folded into the existing one.
    await repo.insert_body_metric(conn, user_id, BodyMetric(date="2026-07-02", bodyweight_kg=84.0))
    assert len(await repo.list_body_metrics(conn, user_id)) == 2

    # Imported (external_id-bearing) metrics for the same date are never merged with each other
    # or with the manual entry above — only id-less manual logs upsert by date.
    await repo.insert_body_metric(
        conn, user_id, BodyMetric(id="ext-1", date="2026-07-01", bodyweight_kg=82.0)
    )
    await repo.insert_body_metric(
        conn, user_id, BodyMetric(id="ext-2", date="2026-07-01", bodyweight_kg=81.0)
    )
    assert len(await repo.list_body_metrics(conn, user_id)) == 4
