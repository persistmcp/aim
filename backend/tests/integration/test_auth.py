"""Integration tests for auth.py's token resolver.

Covers I-AUTH-1 (docs/TEST_CASES.md). There was previously no test file for this module at all
despite docs/TEST_CASES.md claiming coverage (U-AUTH-1) — added 2026-07-12 alongside the fix for
a real 500 found by the manual-qa regression pass (a NUL byte in the token path crashed psycopg
instead of resolving to "unknown token").
"""

import httpx
import pytest

from workout_storage import auth, repo
from workout_storage.context import client_key, current_user_id, is_demo_user

pytestmark = pytest.mark.integration


def _scope(headers: dict[str, str], client=("10.0.0.1", 5000)):
    return {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": client,
    }


async def test_resolve_token_empty_returns_none_without_a_db_call():
    assert await auth.resolve_token("") is None


async def test_resolve_token_nul_byte_returns_none_not_a_500(monkeypatch):
    """Regression: Postgres text columns reject NUL bytes outright (psycopg.DataError); a
    malformed token must resolve to "not found," never crash the request."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused:invalid@localhost/unused")
    assert await auth.resolve_token("abc\x00def") is None


async def test_resolve_token_unknown_returns_none(pg_dsn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    assert await auth.resolve_token("token-that-was-never-issued") is None


async def test_resolve_token_valid_returns_the_owning_user_id(conn, pg_dsn, monkeypatch):
    user = await repo.create_user(conn, name="Resolve Test")
    await conn.commit()  # resolve_token opens its own connection; the row must be visible to it

    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    assert await auth.resolve_token(user["token"]) == str(user["id"])


# --- demo client key (see observability.client_key / context.client_key) ----------------------


def test_demo_client_key_uses_the_forwarded_client_ip(monkeypatch):
    """Behind Vercel every request's socket peer is the proxy — x-forwarded-for is the caller."""
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt")
    one = auth.demo_client_key(_scope({"x-forwarded-for": "203.0.113.7, 10.1.1.1"}))
    two = auth.demo_client_key(_scope({"x-forwarded-for": "198.51.100.9, 10.1.1.1"}))
    assert one and two and one != two
    assert one.startswith("f:")
    # Same caller, second call of the same conversation.
    assert one == auth.demo_client_key(_scope({"x-forwarded-for": "203.0.113.7, 10.9.9.9"}))


def test_demo_client_key_prefers_the_mcp_session_id(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt")
    key = auth.demo_client_key(_scope({"mcp-session-id": "abc", "x-forwarded-for": "203.0.113.7"}))
    assert key.startswith("s:")


def test_demo_client_key_holds_no_raw_client_data(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt")
    key = auth.demo_client_key(
        _scope({"x-forwarded-for": "203.0.113.7", "user-agent": "claude-desktop/1.4"})
    )
    assert "203.0.113.7" not in key and "claude" not in key


async def _capture_context(seeded_token, path, headers=None):
    """Drive the real ASGI stack and report the context the inner app saw."""
    seen = {}

    async def inner(scope, receive, send):
        seen.update(user_id=current_user_id.get(), demo=is_demo_user.get(), client=client_key.get())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    app = auth.TokenResolverMiddleware(inner)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get(f"/{seeded_token}{path}", headers=headers or {})
    return seen


async def test_demo_requests_carry_a_client_key_and_others_do_not(conn, pg_dsn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt")
    # A token of its own rather than the literal "demo": DEMO_TOKEN is env-overridable in prod
    # and other tests in this session already own that row.
    demo_token = "demo-for-this-test"
    monkeypatch.setattr(auth, "DEMO_TOKEN", demo_token)
    demo = await repo.create_user(conn, name="Demo", token=demo_token)
    real = await repo.create_user(conn, name="Real")
    await conn.commit()

    headers = {"x-forwarded-for": "203.0.113.7", "user-agent": "claude-desktop/1.4"}
    as_demo = await _capture_context(demo_token, "/api/me", headers)
    assert as_demo["demo"] is True
    assert as_demo["client"] and as_demo["client"].startswith("f:")
    assert str(demo["id"]) == as_demo["user_id"]

    # A real account is already identified by its own user_id — no fingerprint is taken.
    as_real = await _capture_context(real["token"], "/api/me", headers)
    assert as_real["demo"] is False
    assert as_real["client"] is None

    # And the contextvar does not leak past the request.
    assert client_key.get() is None
