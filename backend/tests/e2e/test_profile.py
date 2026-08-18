"""E2E tests for GET /api/profile — COACHING_PLAN.md §8.1's derived, goal-aware dashboard config."""

import os
from datetime import date, timedelta

import httpx
import pytest

from workout_storage import repo
from workout_storage.db import connect
from workout_storage.models import BodyMetric

pytestmark = pytest.mark.e2e


async def _get(pg_dsn, token, path="/profile"):
    os.environ["DATABASE_URL"] = pg_dsn
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        return await c.get(f"/{token}/api{path}")


async def test_pre_intake_falls_back_to_default_layout(pg_dsn):
    """No coach_profile row yet (never touched by intake) — must degrade to the original fixed
    layout, not an empty or broken one (COACHING_PLAN.md §8.4 "graceful pre-intake degradation")."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="NoProfile")

    r = await _get(pg_dsn, user["token"])
    assert r.status_code == 200
    body = r.json()
    assert body["intake_status"] == "not_started"
    assert body["primary_goal"] is None
    assert body["tiles"] == ["workouts_week", "volume_week", "bodyweight"]
    assert body["modules"] == ["program", "muscle_load"]
    assert body["goals"] == []


async def test_tiles_and_modules_follow_primary_goal(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Strength")
        await repo.ensure_coach_profile(conn, user["id"])
        await repo.update_coach_profile_fields(conn, user["id"], {"primary_goal": "strength"})

    r = await _get(pg_dsn, user["token"])
    body = r.json()
    assert body["primary_goal"] == "strength"
    assert body["tiles"] == ["workouts_week", "top_e1rm", "bodyweight"]
    assert body["modules"][0] == "goal_progress"
    assert "strength_progression" in body["modules"]


async def test_endurance_falls_back_to_default_tiles_not_unbuilt_cardio_tiles(pg_dsn):
    """cardio_activities aggregation doesn't exist yet (COACHING_PLAN.md §8.3, deliberately
    deferred) — an endurance goal must not advertise tiles/modules the app can't render."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Endurance")
        await repo.ensure_coach_profile(conn, user["id"])
        await repo.update_coach_profile_fields(conn, user["id"], {"primary_goal": "endurance"})

    r = await _get(pg_dsn, user["token"])
    body = r.json()
    assert body["tiles"] == ["workouts_week", "volume_week", "bodyweight"]
    assert "cardio_stats" not in body["modules"]


async def test_goal_without_target_has_no_progress_bar(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Vague")
        await repo.upsert_user_goal(
            conn, user["id"], {"kind": "outcome", "title": "Feel stronger overall"}
        )

    r = await _get(pg_dsn, user["token"])
    goal = r.json()["goals"][0]
    assert goal["current"] is None
    assert goal["progress_pct"] is None


async def test_sessions_per_week_process_goal_progress(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Process")
        await repo.upsert_user_goal(
            conn,
            user["id"],
            {
                "kind": "process",
                "title": "3 workouts a week",
                "target": {"metric": "sessions_per_week", "value": 3},
            },
        )

    r = await _get(pg_dsn, user["token"])
    goal = r.json()["goals"][0]
    # No sessions logged this week for a fresh user.
    assert goal["current"] == 0
    assert goal["progress_pct"] == 0


async def test_bodyweight_goal_progress_uses_baseline(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="FatLoss")
        await repo.upsert_user_goal(
            conn,
            user["id"],
            {
                "kind": "outcome",
                "title": "Lose weight",
                "target": {"metric": "bodyweight", "value": 80, "baseline_value": 90},
            },
        )
        await repo.insert_body_metric(
            conn, user["id"], BodyMetric(date=date.today(), bodyweight_kg=85)
        )

    r = await _get(pg_dsn, user["token"])
    goal = r.json()["goals"][0]
    assert goal["current"] == 85
    assert goal["progress_pct"] == 50  # halfway from 90 to the 80 target


async def test_e1rm_goal_progress_resolves_via_exercise_id(pg_dsn, seeded):
    """seeded logs ex_lat_pulldown at 55kg x12 — epley 1RM = 55 * (1 + 12/30) = 77.0."""
    uid, token = seeded
    async with connect(pg_dsn) as conn:
        await repo.upsert_user_goal(
            conn,
            uid,
            {
                "kind": "performance",
                "title": "Lat pulldown 100kg e1RM",
                "target": {"metric": "e1rm", "exercise_id": "ex_lat_pulldown", "value": 100},
            },
        )

    r = await _get(pg_dsn, token)
    body = r.json()
    goal = next(g for g in body["goals"] if g["title"] == "Lat pulldown 100kg e1RM")
    assert goal["current"] == 77.0
    assert goal["progress_pct"] == 77
    # The tracked lift also drives the Home top_e1rm metric — same number, one source of truth.
    assert body["metrics"]["top_e1rm"] == 77.0


async def test_bodyweight_delta_30d_metric(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Delta")
        await repo.insert_body_metric(
            conn,
            user["id"],
            BodyMetric(date=date.today() - timedelta(days=35), bodyweight_kg=90),
        )
        await repo.insert_body_metric(
            conn, user["id"], BodyMetric(date=date.today(), bodyweight_kg=85)
        )

    r = await _get(pg_dsn, user["token"])
    assert r.json()["metrics"]["bodyweight_delta_30d"] == -5


async def test_bodyweight_goal_progress_with_fractional_values_does_not_crash(pg_dsn):
    """Regression: bodyweight_kg is a Postgres `numeric` (decoded as Decimal by psycopg); mixing
    it with the plain float parsed out of a goal's jsonb target raised
    `TypeError: unsupported operand type(s) for -: 'float' and 'decimal.Decimal'`. The prior test
    only used whole-number values, which happened not to trigger it — fractional values are the
    realistic case for a bodyweight goal."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="FractionalWeight")
        await repo.upsert_user_goal(
            conn,
            user["id"],
            {
                "kind": "outcome",
                "title": "Lose weight",
                "target": {"metric": "bodyweight", "value": 79.5, "baseline_value": 90.2},
            },
        )
        await repo.insert_body_metric(
            conn, user["id"], BodyMetric(date=date.today(), bodyweight_kg=85.1)
        )
        # Also exercises the bodyweight_delta_30d subtraction with a fractional older reading.
        await repo.insert_body_metric(
            conn,
            user["id"],
            BodyMetric(date=date.today() - timedelta(days=35), bodyweight_kg=90.2),
        )

    r = await _get(pg_dsn, user["token"])
    assert r.status_code == 200
    goal = r.json()["goals"][0]
    assert goal["current"] == 85.1
    assert goal["progress_pct"] is not None


async def test_fat_loss_modules_include_program(pg_dsn):
    """Regression: fat_loss's module list was the only one of four wired goals missing
    "program" — a fat_loss user lost their program off Home entirely."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="FatLossProgram")
        await repo.ensure_coach_profile(conn, user["id"])
        await repo.update_coach_profile_fields(conn, user["id"], {"primary_goal": "fat_loss"})

    r = await _get(pg_dsn, user["token"])
    assert "program" in r.json()["modules"]


async def test_top_e1rm_metric_is_zero_not_null_for_a_bodyweight_movement(pg_dsn, seeded):
    """Regression: `next(... and g["current"])` treated a legitimately-computed 0.0 (a "weight"
    goal on a bodyweight-only movement, e.g. push-ups logged at weight_kg=0) as missing."""
    uid, token = seeded
    async with connect(pg_dsn) as conn:
        # ex_lat_pulldown is seeded at 55kg (see test_e1rm_goal_progress_resolves_via_exercise_id);
        # log a same-day bodyweight set for a fresh exercise instead so its top_weight is exactly
        # 0 (the catalog entry auto-creates on log_session, no separate setup needed).
        from workout_storage import services
        from workout_storage.context import current_user_id
        from workout_storage.models import Session, SessionEntry, SetEntry

        reset = current_user_id.set(uid)
        try:
            await services.log_session(
                Session(
                    date=date.today(),
                    entries=[
                        SessionEntry(
                            exercise_id="ex_pushup",
                            sets=[SetEntry(set_number=1, weight_kg=0, reps=15)],
                        )
                    ],
                )
            )
        finally:
            current_user_id.reset(reset)
        await repo.upsert_user_goal(
            conn,
            uid,
            {
                "kind": "performance",
                "title": "Weighted push-ups eventually",
                "target": {"metric": "weight", "exercise_id": "ex_pushup", "value": 20},
            },
        )

    r = await _get(pg_dsn, token)
    body = r.json()
    goal = next(g for g in body["goals"] if g["title"] == "Weighted push-ups eventually")
    assert goal["current"] == 0.0
    assert body["metrics"]["top_e1rm"] == 0.0


async def test_goals_do_not_leak_internal_user_id(pg_dsn):
    """Regression: get_profile's goals bypassed present.present_goal, unlike every other
    goal-returning path, leaking the internal user_id column."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="NoLeak")
        await repo.upsert_user_goal(conn, user["id"], {"kind": "outcome", "title": "Get strong"})

    r = await _get(pg_dsn, user["token"])
    assert "user_id" not in r.json()["goals"][0]


# --- featured goal + goal_type taxonomy (2026-07-18) -------------------------


async def test_no_featured_goal_is_null_even_with_active_goals(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="NoFeatured")
        await repo.upsert_user_goal(conn, user["id"], {"kind": "outcome", "title": "Some goal"})

    r = await _get(pg_dsn, user["token"])
    assert r.json()["featured_goal"] is None


async def test_featured_milestone_goal_shape(pg_dsn, seeded):
    uid, token = seeded
    async with connect(pg_dsn) as conn:
        await repo.upsert_user_goal(
            conn,
            uid,
            {
                "kind": "performance",
                "title": "Lat pulldown 100kg e1RM",
                "featured": True,
                "target": {
                    "goal_type": "milestone",
                    "metric": "e1rm",
                    "exercise_id": "ex_lat_pulldown",
                    "value": 100,
                },
            },
        )

    r = await _get(pg_dsn, token)
    featured = r.json()["featured_goal"]
    assert featured is not None
    assert featured["goal_type"] == "milestone"
    assert featured["progress"]["type"] == "bar"
    assert featured["progress"]["pct"] == featured["progress_pct"]


async def test_featured_weekly_volume_goal_shape(pg_dsn, seeded):
    """ex_lat_pulldown has primary_muscles=["lats"] (seeded's own catalog) — log a fresh,
    today-dated set so it lands in the current week's bucket regardless of when this test runs
    (the seeded fixture's own session is dated a fixed 2026-06-06, which drifts out of the
    6-week window over time)."""
    uid, token = seeded
    async with connect(pg_dsn) as conn:
        from workout_storage import services
        from workout_storage.context import current_user_id
        from workout_storage.models import Session, SessionEntry, SetEntry

        reset = current_user_id.set(uid)
        try:
            await services.log_session(
                Session(
                    date=date.today(),
                    entries=[
                        SessionEntry(
                            exercise_id="ex_lat_pulldown",
                            sets=[SetEntry(set_number=1, weight_kg=55, reps=10)],
                        )
                    ],
                )
            )
        finally:
            current_user_id.reset(reset)

        await repo.upsert_user_goal(
            conn,
            uid,
            {
                "kind": "outcome",
                "title": "Train lats every week",
                "featured": True,
                "target": {"goal_type": "weekly_volume", "muscle": "lats", "band": "mev"},
            },
        )

    r = await _get(pg_dsn, token)
    featured = r.json()["featured_goal"]
    assert featured["goal_type"] == "weekly_volume"
    progress = featured["progress"]
    assert progress["type"] == "weekly_bands"
    assert progress["muscle"] == "lats"
    assert len(progress["history"]) == 6
    assert progress["current_sets"] >= 1  # today's set landed in the current week's bucket
    assert progress["landmark"] == {"mev": 8, "mav": 20}


async def test_featured_trend_goal_shape(pg_dsn, seeded):
    uid, token = seeded
    async with connect(pg_dsn) as conn:
        # A second, heavier logged date so exercise_progression has 2+ points (seeded's own
        # session already logged one).
        from workout_storage import services
        from workout_storage.context import current_user_id
        from workout_storage.models import Session, SessionEntry, SetEntry

        reset = current_user_id.set(uid)
        try:
            await services.log_session(
                Session(
                    date=date.today(),
                    entries=[
                        SessionEntry(
                            exercise_id="ex_lat_pulldown",
                            sets=[SetEntry(set_number=1, weight_kg=60, reps=10)],
                        )
                    ],
                )
            )
        finally:
            current_user_id.reset(reset)

        await repo.upsert_user_goal(
            conn,
            uid,
            {
                "kind": "outcome",
                "title": "Keep lat pulldown climbing",
                "featured": True,
                "target": {
                    "goal_type": "trend",
                    "exercise_id": "ex_lat_pulldown",
                    "metric": "e1rm",
                },
            },
        )

    r = await _get(pg_dsn, token)
    featured = r.json()["featured_goal"]
    assert featured["goal_type"] == "trend"
    progress = featured["progress"]
    assert progress["type"] == "trend"
    assert progress["direction"] == "up"
    assert "progress_pct" not in progress  # no fixed finish line, by design
    assert len(progress["series"]) == 2


async def test_featured_maintenance_goal_total_volume_shape(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Maintainer")
        await repo.upsert_user_goal(
            conn,
            user["id"],
            {
                "kind": "outcome",
                "title": "Don't lose volume while cutting",
                "featured": True,
                "target": {
                    "goal_type": "maintenance",
                    "baseline_value": 10000,
                    "tolerance_pct": 20,
                },
            },
        )

    r = await _get(pg_dsn, user["token"])
    featured = r.json()["featured_goal"]
    assert featured["goal_type"] == "maintenance"
    progress = featured["progress"]
    assert progress["type"] == "tolerance"
    assert progress["baseline"] == 10000
    assert progress["current"] == 0  # nothing logged yet
    assert progress["status"] == "warn"  # 100% drop from baseline


async def test_goal_target_exercise_id_and_baseline_value_accepted_via_real_write_path(pg_dsn):
    """Regression: exercise_id/baseline_value weren't on the validated GoalTarget model
    (extra="forbid"), so the coaching LLM's only real write path, the upsert_goal MCP tool,
    could never populate the fields the new goal-progress feature depends on. Uses the real
    tool + Pydantic validation, not repo.upsert_user_goal with a raw dict like the tests above."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="RealWritePath")

    from workout_storage import services
    from workout_storage.coach import GoalInput, GoalTarget
    from workout_storage.context import current_user_id

    reset = current_user_id.set(user["id"])
    try:
        # The catalog-membership guard (2026-07-21) makes creating the exercise first part of
        # the real write path this test exercises.
        from workout_storage.models import Exercise

        await services.upsert_exercise(Exercise(id="ex_lat_pulldown", name="Lat Pulldown"))
        await services.upsert_goal(
            GoalInput(
                kind="performance",
                title="Bench 100kg",
                target=GoalTarget(metric="e1rm", exercise_id="ex_lat_pulldown", value=100),
            )
        )
    finally:
        current_user_id.reset(reset)

    r = await _get(pg_dsn, user["token"])
    goal = r.json()["goals"][0]
    assert goal["target"]["exercise_id"] == "ex_lat_pulldown"
