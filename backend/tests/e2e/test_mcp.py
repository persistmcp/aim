"""End-to-end tests.

Tool behaviours (E-1..E-5) run through the real FastMCP server via the in-memory Client.
Auth + routing run through the full ASGI app over HTTP (httpx ASGITransport).
"""

import httpx
import pytest
from fastmcp import Client

from .conftest import call_tool as _call
from .conftest import mcp_server

pytestmark = pytest.mark.e2e


async def test_log_then_get_session(as_user, example_doc):
    """E-1."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=example_doc["sessions"][0])
        sid = logged["id"]
        got = await _call(client, "get_session", session_id=sid)
        assert got["day_label"] == "День A"
        assert len(got["entries"]) == len(example_doc["sessions"][0]["entries"])


async def test_update_set_fixes_metric(as_user, example_doc):
    """E-2."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=example_doc["sessions"][0])
        sid = logged["id"]
        updated = await _call(
            client,
            "update_set",
            session_id=sid,
            exercise_id="ex_lat_pulldown",
            set_number=1,
            patch={"weight_kg": 62},
        )
        assert updated["weight_kg"] == 62
        got = await _call(client, "get_session", session_id=sid)
        entry = next(e for e in got["entries"] if e["exercise_id"] == "ex_lat_pulldown")
        assert entry["sets"][0]["weight_kg"] == 62


async def test_body_metrics_roundtrip(as_user, example_doc):
    """E-3."""
    async with Client(mcp_server()) as client:
        await _call(client, "log_body_metric", metric=example_doc["body_metrics"][0])
        rows = await _call(client, "get_body_metrics", limit=10)
        assert rows[0]["bodyweight_kg"] == 90


async def test_get_stats_progression(as_user, example_doc):
    """E-4."""
    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session=example_doc["sessions"][0])
        stats = await _call(client, "get_stats", kind="progression", exercise_id="ex_lat_pulldown")
        assert stats["progression"][0]["top_weight"] == 55
        assert stats["prs"]["best_weight"]["value"] == 55


async def test_import_document(as_user, example_doc):
    """E-5."""
    async with Client(mcp_server()) as client:
        counts = await _call(client, "import_document", document=example_doc)
        assert counts["sessions"] == 1
        assert counts["exercises"] == 10
        exercises = await _call(client, "list_exercises")
        assert any(e["id"] == "ex_lat_pulldown" for e in exercises)


async def test_import_is_idempotent(as_user, example_doc):
    """#2: importing the same document twice does not error or duplicate sessions."""
    async with Client(mcp_server()) as client:
        c1 = await _call(client, "import_document", document=example_doc)
        c2 = await _call(client, "import_document", document=example_doc)
        assert c2 == c1
        sessions = await _call(client, "get_sessions", limit=50)
        matching = [s for s in sessions if s.get("external_id") == "sess_0003"]
        assert len(matching) == 1


async def test_import_document_rejects_active_program_missing_weight(as_user):
    """E-8. FUNCTIONAL_IMPROVEMENTS_PLAN.md #1: a weak client can no longer persist an active
    program that skipped review_program_draft — the same checklist runs server-side and nothing
    is saved."""
    doc = {
        "schema_version": "1.0",
        "programs": [{"id": "p1", "name": "Bad program", "status": "active"}],
        "day_templates": [
            {
                "id": "d1",
                "name": "Day A",
                "program_id": "p1",
                "blocks": [
                    {
                        "items": [
                            {
                                "exercise_id": "ex_lat_pulldown",
                                "target_sets": 3,
                                "target_reps": {"min": 8, "max": 10},
                            }
                        ]
                    }
                ],
            }
        ],
    }
    async with Client(mcp_server()) as client:
        result = await _call(client, "import_document", document=doc)
        assert result["ok"] is False
        assert any("target_weight_kg" in v for v in result["violations"])
        programs = await _call(client, "get_program")
        assert programs is None  # atomic reject: nothing persisted


async def test_import_document_skips_gate_for_archived_program(as_user):
    """E-9. An archived program (the "replace old program" flow) is never quality-gated, even
    with the same missing-weight shape that would reject an active one."""
    doc = {
        "schema_version": "1.0",
        "programs": [{"id": "p1", "name": "Old program", "status": "archived"}],
        "day_templates": [
            {
                "id": "d1",
                "name": "Day A",
                "program_id": "p1",
                "blocks": [
                    {
                        "items": [
                            {
                                "exercise_id": "ex_lat_pulldown",
                                "target_sets": 3,
                                "target_reps": {"min": 8, "max": 10},
                            }
                        ]
                    }
                ],
            }
        ],
    }
    async with Client(mcp_server()) as client:
        result = await _call(client, "import_document", document=doc)
        assert result["day_templates"] == 1


async def test_read_shape_matches_input(as_user, example_doc):
    """#4: get_session returns model-shaped data (order not position, no internal user_id)."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=example_doc["sessions"][0])
        got = await _call(client, "get_session", session_id=logged["id"])
        assert "user_id" not in got
        entry = got["entries"][0]
        assert "order" in entry and "position" not in entry
        assert "user_id" not in entry
        for s in entry["sets"]:
            assert "user_id" not in s and "entry_id" not in s


# --- HTTP layer: auth + routing ---------------------------------------------


async def test_http_unknown_token_404(user_token):
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/not-a-real-token/api/health")
        assert r.status_code == 404


async def test_http_valid_token_resolves_user(user_token):
    uid, token = user_token
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{token}/api/health")
        assert r.status_code == 200
        assert r.json()["user_id"] == uid


async def test_backup_requires_auth(user_token):
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/backup")
        assert r.status_code == 401


async def test_backup_with_auth_dumps(user_token, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "secret123")
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/backup", headers={"authorization": "Bearer secret123"})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "users" in body["counts"]
