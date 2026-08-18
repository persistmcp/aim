"""E2E: the demo-account write guard blocks/limits the public demo token, and leaves real users
alone entirely. Runs through the real FastMCP server (in-memory Client) so DemoGuardMiddleware is
exercised exactly as in production.
"""

import os

import httpx
import pytest
import pytest_asyncio
from fastmcp import Client
from fastmcp.exceptions import ToolError

from workout_storage import repo
from workout_storage.auth import DEMO_TOKEN
from workout_storage.context import current_user_id, is_demo_user
from workout_storage.db import connect

from .conftest import call_tool as _call
from .conftest import mcp_server

pytestmark = pytest.mark.e2e


@pytest_asyncio.fixture
async def as_demo_user(pg_dsn):
    """Like `as_user`, but also flips `is_demo_user` — the signal DemoGuardMiddleware acts on.
    Mirrors what auth.py sets in production when the URL token equals DEMO_TOKEN."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Demo")
    uid = str(user["id"])
    uid_reset = current_user_id.set(uid)
    demo_reset = is_demo_user.set(True)
    try:
        yield uid
    finally:
        current_user_id.reset(uid_reset)
        is_demo_user.reset(demo_reset)


async def test_import_document_blocked_for_demo(as_demo_user, example_doc):
    async with Client(mcp_server()) as client:
        with pytest.raises(ToolError, match="Bulk import is disabled"):
            await _call(client, "import_document", document=example_doc)


async def test_import_document_allowed_for_real_user(as_user, example_doc):
    async with Client(mcp_server()) as client:
        result = await _call(client, "import_document", document=example_doc)
    assert result  # real users are never touched by the demo guard


async def test_write_rate_limit_for_demo(as_demo_user, example_doc, monkeypatch):
    from workout_storage import demo_guard

    monkeypatch.setattr(demo_guard, "_WRITE_RATE_LIMIT", 2)
    session = example_doc["sessions"][0]
    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session={**session, "id": None})
        await _call(client, "log_session", session={**session, "id": None})
        with pytest.raises(ToolError, match="rate"):
            await _call(client, "log_session", session={**session, "id": None})


async def test_session_cap_for_demo(as_demo_user, example_doc, monkeypatch):
    from workout_storage import demo_guard

    monkeypatch.setattr(demo_guard, "_MAX_DEMO_SESSIONS", 0)
    async with Client(mcp_server()) as client:
        with pytest.raises(ToolError, match="storage"):
            await _call(client, "log_session", session=example_doc["sessions"][0])


async def test_reads_unaffected_for_demo(as_demo_user):
    """Read-only tools are never in _WRITE_TOOLS/_BLOCKED_ON_DEMO — no limit applies."""
    async with Client(mcp_server()) as client:
        result = await _call(client, "get_sessions", limit=5)
    assert result == []


async def test_reset_demo_requires_auth(user_token):
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/reset-demo")
        assert r.status_code == 401


async def test_demo_guard_block_does_not_page_the_owner(
    as_demo_user, example_doc, monkeypatch, telegram_capture
):
    """The guard rejecting a demo write is working as intended, not the server being broken —
    it must not fire the same alert a real bug would (see observability.py)."""
    from workout_storage import demo_guard

    monkeypatch.setattr(demo_guard, "_WRITE_RATE_LIMIT", 1)
    session = example_doc["sessions"][0]
    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session={**session, "id": None})
        with pytest.raises(ToolError, match="rate"):
            await _call(client, "log_session", session={**session, "id": None})

    assert telegram_capture == []


async def test_reset_demo_skips_when_no_demo_account(user_token, monkeypatch):
    """No demo account created yet (fresh env) → 200/skipped, not an error."""
    monkeypatch.setenv("CRON_SECRET", "secret123")
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/reset-demo", headers={"authorization": "Bearer secret123"})
        assert r.status_code == 200
        assert r.json()["skipped"]


async def test_reset_demo_wipes_junk_and_reseeds(pg_dsn, monkeypatch):
    """Junk data on the demo account is gone after reset; the seeded baseline is present."""
    os.environ["DATABASE_URL"] = pg_dsn
    monkeypatch.setenv("CRON_SECRET", "secret123")
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Demo", token=DEMO_TOKEN)
    uid = str(user["id"])
    uid_reset = current_user_id.set(uid)
    try:
        async with Client(mcp_server()) as client:
            # Junk the reset must clean up: an extra session plus a goal.
            await _call(
                client,
                "log_session",
                session={"date": "2020-01-01", "entries": [], "day_label": "junk"},
            )
    finally:
        current_user_id.reset(uid_reset)

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/reset-demo", headers={"authorization": "Bearer secret123"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

    async with connect(pg_dsn) as conn:
        sessions = await repo.list_sessions(conn, uid, date_from=None, date_to=None, limit=50)
        goals = await repo.list_user_goals(conn, uid, status="active")
    labels = {s["day_label"] for s in sessions}
    assert labels == {"Push", "Legs"}  # junk gone, exactly the seeded sessions present
    assert any(g["title"] == "Bench press 70kg for 5 reps" for g in goals)
