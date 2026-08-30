"""Regression tests for the parent dispatcher after OAuth was added.

The risk this change carries is not that OAuth fails — it is that OAuth quietly takes over a path
that live connectors, the PWA or the cron jobs depend on. Every assertion here is about something
that worked before this feature existed and must still work identically.
"""

import httpx
import pytest

from workout_storage import repo
from workout_storage.db import connect

pytestmark = pytest.mark.e2e

BASE = "https://aim-journal.com"


def _fresh_app(monkeypatch, pg_dsn, *, oauth_on: bool):
    """Build the parent App the way api/index.py does, with OAuth on or off."""
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    if oauth_on:
        monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    else:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    from workout_storage.app import App

    return App()


async def _client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE)


async def test_without_supabase_credentials_nothing_changes_at_all(monkeypatch, pg_dsn):
    """Local dev and CI have no Supabase keys. The app must behave exactly as it did before:
    `/mcp` is just an unknown token to the resolver, which is a 404, not a half-built OAuth
    endpoint returning 401 and advertising discovery documents that do not work."""
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=False)
    assert app.oauth_app is None

    async with await _client(app) as client:
        resp = await client.post("/mcp", json={})
    assert resp.status_code == 404
    assert resp.json() == {"error": "unknown token"}


async def test_the_legacy_token_route_still_reaches_mcp(monkeypatch, pg_dsn):
    """The one that matters most: every live connector is a `/{token}/mcp` URL."""
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Legacy Connector")

    async with await _client(app) as client:
        # A GET is not allowed on the stateless streamable route; 405 proves the request was
        # routed to MCP rather than 404'd by the resolver or swallowed by OAuth.
        resp = await client.get(f"/{user['token']}/mcp")
    assert resp.status_code == 405


async def test_the_legacy_read_api_still_answers(monkeypatch, pg_dsn):
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="PWA User")

    async with await _client(app) as client:
        resp = await client.get(f"/{user['token']}/api/health")
    assert resp.status_code == 200


async def test_an_unknown_token_is_still_a_404_with_oauth_enabled(monkeypatch, pg_dsn):
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with await _client(app) as client:
        resp = await client.get("/definitely-not-a-real-token/api/health")
    assert resp.status_code == 404


async def test_oauth_routes_do_not_shadow_a_users_token(monkeypatch, pg_dsn):
    """`oauth` and `mcp` are plausible-looking first path segments. If the dispatcher matched on a
    prefix rather than the exact OAuth paths, a user whose token started with those letters would
    lose their account."""
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with connect(pg_dsn) as conn:
        for token in ("mcpXXXXXXXXXXXXXXXXXXXXXX", "oauthXXXXXXXXXXXXXXXXXXXX"):
            await repo.create_user(conn, name="Edge", token=token)

    async with await _client(app) as client:
        for token in ("mcpXXXXXXXXXXXXXXXXXXXXXX", "oauthXXXXXXXXXXXXXXXXXXXX"):
            resp = await client.get(f"/{token}/api/health")
            assert resp.status_code == 200, token


async def test_the_consent_page_is_reachable_through_the_dispatcher(monkeypatch, pg_dsn):
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with await _client(app) as client:
        resp = await client.get("/oauth/consent?authorization_id=abc")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


async def test_signup_and_cron_still_bypass_everything(monkeypatch, pg_dsn):
    """Both short-circuit ahead of the resolver; OAuth was inserted into the same chain."""
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with await _client(app) as client:
        signup = await client.post("/api/public/signup", json={"email": "not an email"})
        cron = await client.get("/_cron/backup")
    assert signup.status_code == 400  # reached signup's validation, not the token resolver
    assert cron.status_code != 404  # reached the cron app (401/403 without the secret)


async def test_the_resume_link_identifies_the_browser_and_returns_to_consent(monkeypatch, pg_dsn):
    """The answer to "the app is on my phone, I am connecting on my laptop".

    The emailed link is token-scoped, so auth.py has already proved who this is by the time the
    route runs. All it has to do is hand that proof to the consent screen and send the browser
    back to the authorization it interrupted.
    """
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Second Device", email="resume@example.com")

    async with await _client(app) as client:
        resp = await client.get(
            f"/{user['token']}/oauth/resume?authorization_id=abcd1234efgh",
            follow_redirects=False,
        )

    assert resp.status_code == 303
    assert resp.headers["location"] == "/oauth/consent?authorization_id=abcd1234efgh"
    cookie = resp.headers.get("set-cookie", "")
    assert "aim_connect=" in cookie
    # The page has no reason to read it and an XSS would love to.
    assert "HttpOnly" in cookie and "Secure" in cookie


async def test_the_resume_link_refuses_a_junk_authorization_id(monkeypatch, pg_dsn):
    """The value is echoed straight back into a Location header."""
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Junk", email="junk@example.com")

    async with await _client(app) as client:
        resp = await client.get(
            f"/{user['token']}/oauth/resume?authorization_id=https://evil.example.com",
            follow_redirects=False,
        )
    assert resp.status_code == 303
    assert resp.headers["location"] == "/oauth/consent"


async def test_an_unknown_token_cannot_use_the_resume_link(monkeypatch, pg_dsn):
    app = _fresh_app(monkeypatch, pg_dsn, oauth_on=True)
    async with await _client(app) as client:
        resp = await client.get("/not-a-real-token/oauth/resume?authorization_id=abcd1234efgh")
    assert resp.status_code == 404
