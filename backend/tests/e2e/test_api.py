"""E2E tests for the read-only frontend API, driven over HTTP through the full ASGI app."""

import httpx
import pytest
import pytest_asyncio

pytestmark = pytest.mark.e2e


@pytest_asyncio.fixture
async def client(seeded):
    from workout_storage.app import app

    _, token = seeded
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        c.base = f"/{token}/api"
        yield c


async def test_me(client):
    r = await client.get(f"{client.base}/me")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Alex"
    assert body["current_weight"] == 80


async def test_summary_shape(client):
    r = await client.get(f"{client.base}/summary")
    assert r.status_code == 200
    body = r.json()
    expected = {"workouts_this_week", "volume_this_week", "volume_change_pct", "bodyweight"}
    assert expected <= set(body)
    assert body["bodyweight"] == 80


async def test_adherence_no_target_set(client):
    """The seeded test user never told the coach a weekly frequency — target must be null, not 0
    or a made-up default, so the frontend can tell "no target yet" from "target is zero"."""
    r = await client.get(f"{client.base}/adherence")
    assert r.status_code == 200
    body = r.json()
    assert body["target_per_week"] is None
    assert isinstance(body["sessions_this_week"], int)


async def test_adherence_counts_this_week_against_profile_target(pg_dsn):
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Adherence", bodyweight_kg=80)
        await repo.ensure_coach_profile(conn, user["id"])
        await repo.update_coach_profile_fields(conn, user["id"], {"training_days_per_week": 4})

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{user['token']}/api/adherence")
    assert r.status_code == 200
    body = r.json()
    assert body["target_per_week"] == 4
    assert body["sessions_this_week"] == 0  # no sessions logged for this fresh user
    # Pill-row payload: 7 Monday-first day entries and no tense tone for an empty fresh week
    # (tone only fires when behind with <=2 days left — date-dependent, covered by unit tests).
    assert len(body["days"]) == 7
    assert body["days"][0]["date"] == body["week_start"]
    assert all(d["state"] in ("done", "today", "future", "rest") for d in body["days"])
    assert "tone" in body


async def test_connection_false_before_any_tool_call(client):
    r = await client.get(f"{client.base}/connection")
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] is False
    assert body["last_tool"] is None
    assert body["last_call_at"] is None


async def test_connection_true_after_a_tool_call(pg_dsn):
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Connected")
        await repo.insert_tool_call(
            conn,
            user_id=user["id"],
            tool="get_sessions",
            args=None,
            ok=True,
            error=None,
            duration_ms=12,
        )

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{user['token']}/api/connection")
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] is True
    assert body["last_tool"] == "get_sessions"
    assert body["last_call_at"] is not None


async def test_sessions_list_and_detail(client):
    r = await client.get(f"{client.base}/sessions?limit=10")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["external_id"] == "sess_0003"
    assert "total_volume_kg" in rows[0]

    sid = rows[0]["id"]
    detail = await client.get(f"{client.base}/sessions/{sid}")
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["entries"]) > 0
    assert body["total_volume_kg"] > 0  # detail must carry the session total, not just the list

    missing = await client.get(f"{client.base}/sessions/00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 404


async def test_exercises(client):
    r = await client.get(f"{client.base}/exercises")
    assert r.status_code == 200
    assert any(e["id"] == "ex_lat_pulldown" for e in r.json())


async def test_stats_progression(client):
    r = await client.get(f"{client.base}/stats/progression?exercise_id=ex_lat_pulldown")
    assert r.status_code == 200
    body = r.json()
    assert body["progression"][0]["top_weight"] == 55
    assert body["prs"]["best_weight"]["value"] == 55
    # missing exercise_id → 400
    assert (await client.get(f"{client.base}/stats/progression")).status_code == 400


async def test_stats_volume_buckets(client):
    r = await client.get(f"{client.base}/stats/volume?bucket=week")
    assert r.status_code == 200
    body = r.json()
    assert body["bucket"] == "week"
    assert len(body["series"]) >= 1


async def test_global_prs(client):
    r = await client.get(f"{client.base}/prs")
    assert r.status_code == 200
    prs = r.json()
    lat = next(p for p in prs if p["exercise_id"] == "ex_lat_pulldown")
    assert lat["weight"] == 55


async def test_body_metrics(client):
    r = await client.get(f"{client.base}/body-metrics")
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["bodyweight_kg"] == 80
    assert rows[0]["measurements"]["chest_cm"] == 105


async def test_create_body_metric(client):
    """API-BODYMETRIC-1."""
    r = await client.post(f"{client.base}/body-metrics", json={"bodyweight_kg": 91.5})
    assert r.status_code == 200
    assert r.json()["bodyweight_kg"] == 91.5

    listed = await client.get(f"{client.base}/body-metrics")
    assert listed.json()[0]["bodyweight_kg"] == 91.5


async def test_create_body_metric_rejects_bad_value(client):
    """API-BODYMETRIC-2."""
    r = await client.post(f"{client.base}/body-metrics", json={"bodyweight_kg": -5})
    assert r.status_code == 400


async def test_patch_set_updates_weight(client):
    """API-SETPATCH-1."""
    sessions = (await client.get(f"{client.base}/sessions?limit=10")).json()
    sid = sessions[0]["id"]
    detail = (await client.get(f"{client.base}/sessions/{sid}")).json()
    exercise_id = detail["entries"][0]["exercise_id"]

    r = await client.patch(
        f"{client.base}/sets",
        json={
            "session_id": sid,
            "exercise_id": exercise_id,
            "set_number": 1,
            "patch": {"weight_kg": 62.5},
        },
    )
    assert r.status_code == 200
    assert r.json()["weight_kg"] == 62.5

    refreshed = (await client.get(f"{client.base}/sessions/{sid}")).json()
    entry = next(e for e in refreshed["entries"] if e["exercise_id"] == exercise_id)
    assert entry["sets"][0]["weight_kg"] == 62.5


async def test_patch_set_not_found(client):
    """API-SETPATCH-2."""
    r = await client.patch(
        f"{client.base}/sets",
        json={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "exercise_id": "ex_lat_pulldown",
            "set_number": 1,
            "patch": {"weight_kg": 10},
        },
    )
    assert r.status_code == 404


async def test_patch_set_rejects_unknown_key(client):
    """API-SETPATCH-2."""
    sessions = (await client.get(f"{client.base}/sessions?limit=10")).json()
    sid = sessions[0]["id"]
    detail = (await client.get(f"{client.base}/sessions/{sid}")).json()
    exercise_id = detail["entries"][0]["exercise_id"]

    r = await client.patch(
        f"{client.base}/sets",
        json={
            "session_id": sid,
            "exercise_id": exercise_id,
            "set_number": 1,
            "patch": {"weight_kilograms": 62.5},
        },
    )
    assert r.status_code == 400


async def test_rotate_token_no_email_409(client):
    """API-ROTATE-2. The seeded fixture user has no email on file (CLI-created)."""
    r = await client.post(f"{client.base}/rotate-token")
    assert r.status_code == 409


async def test_rotate_token_issues_new_token_and_invalidates_old(pg_dsn):
    """API-ROTATE-1."""
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Rotator", email="rotate@example.com")
    old_token = user["token"]

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(f"/{old_token}/api/rotate-token")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "email_sent": False}  # no RESEND_API_KEY in tests

        # Old token is dead immediately.
        assert (await c.get(f"/{old_token}/api/me")).status_code == 404

    async with connect(pg_dsn) as conn:
        refreshed = await repo.get_user(conn, str(user["id"]))
    assert refreshed["token"] != old_token

    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        assert (await c.get(f"/{refreshed['token']}/api/me")).status_code == 200


async def test_goals_route_defaults_to_all_and_filters_by_status(pg_dsn):
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="GoalsHistory")
        await repo.upsert_user_goal(conn, user["id"], {"kind": "outcome", "title": "Active goal"})
        await repo.upsert_user_goal(
            conn, user["id"], {"kind": "outcome", "title": "Old goal", "status": "achieved"}
        )

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        default = await c.get(f"/{user['token']}/api/goals")
        assert default.status_code == 200
        assert {g["title"] for g in default.json()} == {"Active goal", "Old goal"}  # default: all

        active_only = await c.get(f"/{user['token']}/api/goals?status=active")
        assert {g["title"] for g in active_only.json()} == {"Active goal"}


async def test_goals_route_carries_goal_type_but_no_rich_progress(pg_dsn):
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="GoalsShape")
        await repo.upsert_user_goal(
            conn,
            user["id"],
            {
                "kind": "outcome",
                "title": "Grow lats",
                "target": {"goal_type": "weekly_volume", "muscle": "lats"},
            },
        )

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{user['token']}/api/goals")
        goal = r.json()[0]
        assert goal["goal_type"] == "weekly_volume"
        # History is cheap regardless of how many past goals a user accumulates — the type-
        # specific progress envelope is only ever computed for the one featured goal (/profile).
        assert "progress" not in goal


async def test_goals_route_is_user_scoped(pg_dsn):
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        a = await repo.create_user(conn, name="GoalsUserA")
        b = await repo.create_user(conn, name="GoalsUserB")
        await repo.upsert_user_goal(conn, a["id"], {"kind": "outcome", "title": "A's goal"})

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{b['token']}/api/goals")
        assert r.json() == []


async def test_unknown_token_404(seeded):
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        assert (await c.get("/nope/api/me")).status_code == 404


async def test_program_items_carry_exercise_names(client):
    """Block items must arrive with display names resolved — the UI must never show a slug."""
    r = await client.get(f"{client.base}/program")
    assert r.status_code == 200
    items = [it for d in r.json()["days"] for b in d["blocks"] for it in b["items"]]
    assert items
    by_id = {it["exercise_id"]: it for it in items}
    assert by_id["ex_lat_pulldown"]["exercise_name"] == "Тяга верхнего блока"


async def test_summary_bodyweight_falls_back_to_profile(pg_dsn):
    """Intake saves weight to users.bodyweight_kg; with no body_metrics logged the Home tile
    must still show it."""
    import os

    from workout_storage import repo
    from workout_storage.db import connect

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="NoMetrics", bodyweight_kg=71.5)

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{user['token']}/api/summary")
    assert r.status_code == 200
    assert r.json()["bodyweight"] == 71.5
