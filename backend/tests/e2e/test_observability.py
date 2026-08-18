"""E2E: tool-call telemetry lands in tool_calls, and the access log reports requests.

Tool behaviours run through the real FastMCP server (in-memory Client) so the logging middleware
is exercised exactly as in production; HTTP logging runs through the full ASGI app.
"""

import logging

import httpx
import pytest

from workout_storage.db import connect

from .conftest import call_tool as _call
from .conftest import mcp_server

pytestmark = pytest.mark.e2e


async def _tool_call_rows(dsn, user_id):
    async with connect(dsn) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "select * from tool_calls where user_id = %s order by id",
                [user_id],
            )
            return await cur.fetchall()


async def test_tool_call_recorded(as_user, user_token, example_doc, pg_dsn):
    """A successful tool call writes one ok=true row with tool, user, args and duration."""
    from fastmcp import Client

    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session=example_doc["sessions"][0])

    rows = await _tool_call_rows(pg_dsn, as_user)
    logged = [r for r in rows if r["tool"] == "log_session"]
    assert len(logged) == 1
    row = logged[0]
    assert row["ok"] is True
    assert row["error"] is None
    assert row["duration_ms"] >= 0
    assert row["args"] is not None  # payload captured (verbatim or truncated)


async def test_failed_tool_call_recorded(as_user, user_token, pg_dsn):
    """A failing tool call is re-raised to the client AND recorded with ok=false."""
    from fastmcp import Client
    from fastmcp.exceptions import ToolError

    async with Client(mcp_server()) as client:
        with pytest.raises(ToolError):
            # An unknown patch key is rejected by repo validation — a genuine tool error.
            await _call(
                client,
                "update_session",
                session_id="00000000-0000-0000-0000-000000000000",
                patch={"weight": 60},
            )

    rows = await _tool_call_rows(pg_dsn, as_user)
    failed = [r for r in rows if r["tool"] == "update_session"]
    assert len(failed) == 1
    assert failed[0]["ok"] is False
    assert failed[0]["error"]


async def test_client_key_is_recorded_when_the_caller_shares_a_token(as_user, user_token, pg_dsn):
    """The demo account's callers are told apart by client_key; everyone else stores null."""
    from fastmcp import Client

    from workout_storage.context import client_key

    async with Client(mcp_server()) as client:
        await _call(client, "get_sessions")  # no key in context — a normal, identified user

    # Set BEFORE the session opens: the in-memory client runs the server in its own task, which
    # copies the context at creation (same reason the as_user fixture sets current_user_id
    # first). Over HTTP this is not a constraint — auth.py sets both vars inside the request.
    reset = client_key.set("f:0123456789abcdef")  # what auth.py sets for a demo request
    try:
        async with Client(mcp_server()) as client:
            await _call(client, "list_exercises")
    finally:
        client_key.reset(reset)

    rows = {r["tool"]: r for r in await _tool_call_rows(pg_dsn, as_user)}
    assert rows["get_sessions"]["client_key"] is None
    assert rows["list_exercises"]["client_key"] == "f:0123456789abcdef"


async def test_request_access_log_and_unknown_token(seeded, caplog):
    """Known token → INFO access line with user_id; unknown token → 404 + WARNING, token masked."""
    from workout_storage.app import app

    uid, token = seeded
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        with caplog.at_level(logging.INFO, logger="workout_storage.auth"):
            r = await c.get(f"/{token}/api/me")
            assert r.status_code == 200
            r = await c.get("/nosuchtoken12345/api/me")
            assert r.status_code == 404

    access = [r for r in caplog.records if getattr(r, "event", "") == "request"]
    assert access and access[0].status == 200
    assert access[0].user_id == uid
    assert access[0].duration_ms >= 0
    assert access[0].path == "/api/me"  # token stripped from the logged path

    unknown = [r for r in caplog.records if getattr(r, "event", "") == "unknown_token"]
    assert unknown
    assert "nosuchtoken12345" not in unknown[0].token  # masked


async def test_telemetry_failure_does_not_break_tools(as_user, user_token, pg_dsn, monkeypatch):
    """If the tool_calls insert blows up, the tool call itself still succeeds."""
    from fastmcp import Client

    from workout_storage import repo

    async def boom(*args, **kwargs):
        raise RuntimeError("telemetry down")

    monkeypatch.setattr(repo, "insert_tool_call", boom)
    async with Client(mcp_server()) as client:
        rows = await _call(client, "get_sessions", limit=5)
    assert isinstance(rows, list)


async def test_failed_tool_call_sends_telegram_alert(as_user, user_token, telegram_capture):
    """A genuine tool error (not a demo-guard block) pages the owner."""
    from fastmcp import Client
    from fastmcp.exceptions import ToolError

    async with Client(mcp_server()) as client:
        with pytest.raises(ToolError):
            await _call(
                client,
                "update_session",
                session_id="00000000-0000-0000-0000-000000000000",
                patch={"weight": 60},
            )

    matches = [c for c in telegram_capture if c[0] == "update_session"]
    assert len(matches) == 1
    assert matches[0][2] == as_user


async def test_successful_tool_call_does_not_send_telegram_alert(
    as_user, user_token, example_doc, telegram_capture
):
    from fastmcp import Client

    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session=example_doc["sessions"][0])

    assert telegram_capture == []


async def test_unknown_token_does_not_send_telegram_alert(seeded, telegram_capture):
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/nosuchtoken12345/api/me")
    assert r.status_code == 404
    assert telegram_capture == []


async def test_successful_request_does_not_send_telegram_alert(seeded, telegram_capture):
    from workout_storage.app import app

    _, token = seeded
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{token}/api/me")
    assert r.status_code == 200
    assert telegram_capture == []


async def test_request_crash_sends_telegram_alert(user_token, telegram_capture):
    """An unhandled exception anywhere under a token-scoped request (e.g. an /api/* route bug)
    pages the owner even though it never goes through an MCP tool call at all — this is the hook
    that ToolCallLoggingMiddleware alone can't provide."""
    from workout_storage.auth import TokenResolverMiddleware

    _, token = user_token

    async def raising_inner(scope, receive, send):
        raise RuntimeError("db exploded")

    mw = TokenResolverMiddleware(raising_inner)
    scope = {"type": "http", "method": "GET", "path": f"/{token}/api/me", "headers": []}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        pass

    with pytest.raises(RuntimeError):
        await mw(scope, receive, send)

    assert len(telegram_capture) == 1
    source, error, user_id = telegram_capture[0]
    assert source == "GET /api/me"
    assert "db exploded" in error
    assert user_id  # the resolved user, not None


async def test_token_resolution_failure_sends_telegram_alert(telegram_capture, monkeypatch):
    """DB down during token resolution means the whole app is down for everyone — the single
    highest-value alert, and the one case where the request never even reaches an inner route."""
    from workout_storage import auth
    from workout_storage.auth import TokenResolverMiddleware

    async def boom(token):
        raise RuntimeError("connection pool exhausted")

    monkeypatch.setattr(auth, "resolve_token", boom)

    async def inner(scope, receive, send):  # pragma: no cover - must not be reached
        raise AssertionError("inner app ran despite token resolution failing")

    mw = TokenResolverMiddleware(inner)
    scope = {"type": "http", "method": "GET", "path": "/anytoken/api/me", "headers": []}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        pass

    with pytest.raises(RuntimeError):
        await mw(scope, receive, send)

    assert len(telegram_capture) == 1
    source, error, user_id = telegram_capture[0]
    assert source == "token resolution (DB down?)"
    assert "connection pool exhausted" in error
    assert user_id is None
