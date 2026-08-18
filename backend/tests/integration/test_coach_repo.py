"""Integration tests for the coaching tables (coach_profiles, user_goals, prompt_templates,
coach_events) against a real Postgres — including the users.goals/experience_level migration."""

import psycopg
import pytest
import pytest_asyncio

from workout_storage import repo

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def user_id(conn):
    user = await repo.create_user(conn, name="Coach Test")
    return str(user["id"])


async def test_users_columns_migrated_away(conn):
    """goals/experience_level are gone from users (single write path in coach_profiles)."""
    with pytest.raises(psycopg.errors.UndefinedColumn):
        async with conn.cursor() as cur:
            await cur.execute("select goals from users limit 1")
    await conn.rollback()
    with pytest.raises(psycopg.errors.UndefinedColumn):
        async with conn.cursor() as cur:
            await cur.execute("select experience_level from users limit 1")


async def test_ensure_profile_is_idempotent(conn, user_id):
    first = await repo.ensure_coach_profile(conn, user_id)
    second = await repo.ensure_coach_profile(conn, user_id)
    assert first["user_id"] == second["user_id"]
    assert first["intake_status"] == "not_started"
    assert first["checkin_cadence_days"] == 28


async def test_profile_fields_roundtrip(conn, user_id):
    await repo.ensure_coach_profile(conn, user_id)
    row = await repo.update_coach_profile_fields(
        conn,
        user_id,
        {
            "primary_goal": "fat_loss",
            "training_days_per_week": 4,
            "locations": ["home", "gym"],
            "equipment": ["dumbbell", "resistance_band"],
            "parq_flags": {"chest_pain": False},
            "injuries": [{"area": "knee", "active": True, "reported_at": "2026-07-02"}],
            "nonexistent_column": "ignored",
        },
    )
    assert row["primary_goal"] == "fat_loss"
    assert row["locations"] == ["home", "gym"]
    assert row["parq_flags"] == {"chest_pain": False}
    assert row["injuries"][0]["area"] == "knee"
    assert "nonexistent_column" not in row


async def test_goal_insert_update_and_history(conn, user_id):
    goal = {
        "kind": "outcome",
        "title": "Жим 100×5",
        "status": "active",
        "source": "coach_proposed",
        "ratified": False,
        "target": {"metric": "e1rm", "value": 112, "unit": "kg"},
    }
    row = await repo.upsert_user_goal(conn, user_id, goal)
    assert row["ratified"] is False
    updated = await repo.upsert_user_goal(
        conn, user_id, {**goal, "id": str(row["id"]), "ratified": True, "status": "active"}
    )
    assert str(updated["id"]) == str(row["id"]) and updated["ratified"] is True

    await repo.upsert_user_goal(
        conn, user_id, {**goal, "id": str(row["id"]), "ratified": True, "status": "revised"}
    )
    active = await repo.list_user_goals(conn, user_id, status="active")
    everything = await repo.list_user_goals(conn, user_id, status="all")
    assert len(active) == 0 and len(everything) == 1  # never deleted, status transitions only


async def test_goal_update_with_foreign_or_stale_id_errors(conn, user_id):
    """An id that doesn't belong to this user (or doesn't exist) must error loudly —
    silently inserting a duplicate would corrupt the never-delete goal history."""
    other = await repo.create_user(conn, name="Other")
    theirs = await repo.upsert_user_goal(
        conn,
        str(other["id"]),
        {
            "kind": "process",
            "title": "3x week",
            "status": "active",
            "source": "user",
            "ratified": True,
        },
    )
    with pytest.raises(ValueError, match="not found"):
        await repo.upsert_user_goal(
            conn, user_id, {"id": str(theirs["id"]), "kind": "process", "title": "hijack"}
        )
    assert (await repo.list_user_goals(conn, str(other["id"])))[0]["title"] == "3x week"
    assert await repo.list_user_goals(conn, user_id) == []


async def test_goal_patch_preserves_omitted_columns(conn, user_id):
    """Updating by id writes only the provided keys — ratified/status never reset to defaults."""
    row = await repo.upsert_user_goal(
        conn,
        user_id,
        {"kind": "outcome", "title": "Жим 100", "source": "coach_proposed", "ratified": False},
    )
    patched = await repo.upsert_user_goal(
        conn, user_id, {"id": str(row["id"]), "review_date": "2026-08-01"}
    )
    assert patched["ratified"] is False  # NOT flipped to the model default
    assert patched["source"] == "coach_proposed"
    assert str(patched["review_date"]) == "2026-08-01"


async def test_create_user_rejects_migrated_profile_kwargs(conn):
    with pytest.raises(ValueError, match="unsupported profile fields"):
        await repo.create_user(conn, name="Old Caller", goals=["hypertrophy"])


# --- featured goal (2026-07-18) -----------------------------------------------


async def test_upsert_user_goal_auto_unfeatures_prior_goal(conn, user_id):
    """At most one featured goal per user — repo.upsert_user_goal clears any prior one in the
    same transaction, both when creating a new goal and when updating an existing one."""
    first = await repo.upsert_user_goal(
        conn, user_id, {"kind": "outcome", "title": "Bench 100kg", "featured": True}
    )
    assert first["featured"] is True

    second = await repo.upsert_user_goal(
        conn, user_id, {"kind": "outcome", "title": "Maintain bench", "featured": True}
    )
    assert second["featured"] is True

    refreshed = await repo.list_user_goals(conn, user_id, status="all")
    first_row = next(g for g in refreshed if str(g["id"]) == str(first["id"]))
    assert first_row["featured"] is False


async def test_upsert_user_goal_featured_scoped_per_user(conn, user_id):
    """Auto-unfeaturing must never cross users — featuring user B's goal must not touch A's."""
    other = await repo.create_user(conn, name="Other")
    mine = await repo.upsert_user_goal(
        conn, user_id, {"kind": "outcome", "title": "Mine", "featured": True}
    )
    await repo.upsert_user_goal(
        conn, str(other["id"]), {"kind": "outcome", "title": "Theirs", "featured": True}
    )
    refreshed = await repo.list_user_goals(conn, user_id, status="all")
    assert next(g for g in refreshed if str(g["id"]) == str(mine["id"]))["featured"] is True


async def test_upsert_user_goal_can_unfeature_without_featuring_another(conn, user_id):
    """Explicitly setting featured=False (e.g. closing out a goal) must not require featuring a
    replacement in the same call — the featured slot can be legitimately empty."""
    row = await repo.upsert_user_goal(
        conn, user_id, {"kind": "outcome", "title": "Bench 100kg", "featured": True}
    )
    updated = await repo.upsert_user_goal(
        conn, user_id, {"id": str(row["id"]), "status": "achieved", "featured": False}
    )
    assert updated["featured"] is False


async def test_supersedes_goal_id_round_trips(conn, user_id):
    old = await repo.upsert_user_goal(
        conn, user_id, {"kind": "outcome", "title": "Bench 100kg", "status": "achieved"}
    )
    new = await repo.upsert_user_goal(
        conn,
        user_id,
        {
            "kind": "outcome",
            "title": "Maintain bench",
            "featured": True,
            "supersedes_goal_id": str(old["id"]),
        },
    )
    assert str(new["supersedes_goal_id"]) == str(old["id"])


async def test_coach_events_ordering(conn, user_id):
    await repo.insert_coach_event(conn, user_id, "intake_started", {})
    diff = {"diff": {"motivation": [None, "x"]}}
    await repo.insert_coach_event(conn, user_id, "profile_updated", diff)
    async with conn.cursor() as cur:
        await cur.execute(
            "select type from coach_events where user_id = %s order by created_at", [user_id]
        )
        types = [r["type"] for r in await cur.fetchall()]
    assert types == ["intake_started", "profile_updated"]


async def test_prompt_template_versioning_and_production_uniqueness(conn):
    await repo.upsert_prompt_template(conn, key="task.intake", version=1, body="v1")
    assert (await repo.production_prompts(conn))["task.intake"] == "v1"
    # Promoting v2 demotes v1 — the partial unique index allows one production row per key.
    await repo.upsert_prompt_template(conn, key="task.intake", version=2, body="v2")
    assert (await repo.production_prompts(conn))["task.intake"] == "v2"
    async with conn.cursor() as cur:
        await cur.execute(
            "select label from prompt_templates where key = 'task.intake' and version = 1"
        )
        assert (await cur.fetchone())["label"] == "draft"
    # Re-applying the same seed is idempotent.
    await repo.upsert_prompt_template(conn, key="task.intake", version=2, body="v2 edited")
    assert (await repo.production_prompts(conn))["task.intake"] == "v2 edited"
