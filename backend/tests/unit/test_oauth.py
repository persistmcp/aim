"""Unit tests for oauth.py: routing, gating and the consent endpoints' input handling.

No DB and no network here — the parts that talk to Supabase are covered in
tests/integration/test_oauth.py and tests/e2e/test_oauth_endpoint.py.

The routing tests matter more than they look. `/mcp` and `/.well-known/*` have to short-circuit
ahead of the token resolver, which would otherwise read the first path segment as somebody's token
and 404 the whole OAuth flow; and they must not swallow the legacy `/{token}/mcp` route that every
live connector still uses.
"""

import httpx
import pytest

from workout_storage import oauth


def test_oauth_paths_claims_the_oauth_surface():
    assert oauth.oauth_paths("/mcp")
    assert oauth.oauth_paths("/oauth/consent")
    assert oauth.oauth_paths("/oauth/consent/details")
    assert oauth.oauth_paths("/oauth/consent/decide")
    assert oauth.oauth_paths("/.well-known/oauth-protected-resource/mcp")
    assert oauth.oauth_paths("/.well-known/oauth-authorization-server")


def test_oauth_paths_leaves_every_existing_route_alone():
    """Regression guard for the one way this change could break live users."""
    for path in [
        "/demo/mcp",
        "/sometoken/mcp",
        "/sometoken/api/summary",
        "/sometoken",
        "/api/public/signup",
        "/_cron/backup",
        "/",
        "/guides/en/ai-personal-trainer",
        # Not ours: only the oauth-* well-known documents are, so the PWA's manifest and any
        # future /.well-known/ entry keep flowing to the normal router.
        "/.well-known/assetlinks.json",
    ]:
        assert not oauth.oauth_paths(path), path


def test_enabled_is_false_without_supabase_credentials(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert oauth.enabled() is False


def test_enabled_needs_both_url_and_service_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert oauth.enabled() is False
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    assert oauth.enabled() is True


def test_env_helper_strips_trailing_slash(monkeypatch):
    """A trailing slash would produce `…//auth/v1` in every Supabase URL we build."""
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co/")
    assert oauth.supabase_url() == "https://project.supabase.co"


async def _consent_client():
    transport = httpx.ASGITransport(app=oauth.consent_app)
    return httpx.AsyncClient(transport=transport, base_url="https://aim-journal.com")


@pytest.mark.asyncio
async def test_consent_page_is_served_and_not_indexable():
    async with await _consent_client() as client:
        resp = await client.get("/oauth/consent?authorization_id=abc")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "noindex" in resp.headers["x-robots-tag"]
    # The page runs on the token the PWA already stores; if that lookup ever disappears the flow
    # silently loses its only proof of identity.
    assert "ws_token" in resp.text
    assert "authorization_id" in resp.text


@pytest.mark.asyncio
async def test_consent_endpoints_reject_a_body_that_is_not_json():
    async with await _consent_client() as client:
        for path in ("/oauth/consent/details", "/oauth/consent/decide"):
            resp = await client.post(path, content=b"not json")
            assert resp.status_code == 400, path


@pytest.mark.asyncio
async def test_consent_endpoints_require_an_authorization_id():
    async with await _consent_client() as client:
        for payload in ({}, {"token": "t"}, {"token": 1, "authorization_id": 2}):
            resp = await client.post("/oauth/consent/details", json=payload)
            assert resp.status_code == 400, payload


@pytest.mark.asyncio
async def test_no_credential_asks_for_an_email_rather_than_dead_ending():
    """The connector is often added in a browser that has never opened the app — on a laptop while
    the app is on a phone. Telling that person to go and open the app first is a wall, so the page
    offers to mail them their existing link instead."""
    async with await _consent_client() as client:
        resp = await client.post("/oauth/consent/details", json={"authorization_id": "abc12345"})
    assert resp.status_code == 200
    assert resp.json() == {"need_signin": True}


@pytest.mark.asyncio
async def test_resume_rejects_a_malformed_address_before_touching_anything():
    """Mirrors signup.py. Without this, junk reaches the database lookup and the mail sender."""
    async with await _consent_client() as client:
        for bad in ("not-an-email", "", "a@b", "@example.com", "two words@example.com"):
            resp = await client.post(
                "/oauth/consent/resume", json={"authorization_id": "abc12345", "email": bad}
            )
            assert resp.status_code == 400, bad


@pytest.mark.asyncio
async def test_resume_rejects_an_authorization_id_it_would_put_in_a_url():
    """The value ends up inside a link in an email; anything unexpected stops here."""
    async with await _consent_client() as client:
        for bad_id in ("short", "has spaces", "../../etc", "a" * 200, "x?&="):
            resp = await client.post(
                "/oauth/consent/resume",
                json={"authorization_id": bad_id, "email": "someone@example.com"},
            )
            assert resp.status_code == 400, bad_id


@pytest.mark.asyncio
async def test_hidden_elements_stay_hidden_on_the_consent_page():
    """Regression: the page sets `hidden` on the Allow/Cancel row until it knows what is being
    authorized, but .row carries display:flex, which outranks the `hidden` attribute'''s UA style.
    The buttons showed on the sign-in-first screen with nothing wired to them — a dead Allow
    button. Only a browser catches this, so the rule is asserted here."""
    async with await _consent_client() as client:
        page = (await client.get("/oauth/consent?authorization_id=abc")).text
    assert "[hidden]" in page and "display:none" in page


def test_resume_email_language_follows_the_browser():
    """Signup takes the language from the landing page; mid-connect there is no such signal, so
    the browser's preference is the best one available. Falling back to English silently would
    hand a Russian user an English email in the middle of connecting."""
    assert oauth._preferred_lang("ru-RU,ru;q=0.9,en;q=0.8") == "ru"
    assert oauth._preferred_lang("pt-BR,pt;q=0.9") == "pt"
    assert oauth._preferred_lang("fr") == "fr"
    # Unsupported first choice falls through to the next one we do speak.
    assert oauth._preferred_lang("de-DE,de;q=0.9,es;q=0.8") == "es"
    # Nothing recognisable, or nothing at all.
    assert oauth._preferred_lang("de,zh") == "en"
    assert oauth._preferred_lang(None) == "en"
    assert oauth._preferred_lang("") == "en"


@pytest.mark.asyncio
async def test_an_account_without_an_email_gets_a_way_out_not_a_red_error(monkeypatch):
    """Accounts created from the CLI before self-service signup have no address, so Supabase has
    nobody to issue a session to. This showed the owner a bare "this account has no email address"
    with nowhere to go. It now hands back the personal address, which still works."""
    from workout_storage import oauth as mod

    async def fake_user_by_token(conn, token):
        return {"id": "u1", "token": token, "email": None}

    class _Conn:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr(mod.repo, "get_user_by_token", fake_user_by_token)
    monkeypatch.setattr(mod, "connect", lambda *a, **k: _Conn())
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://aim-journal.com")

    async with await _consent_client() as client:
        resp = await client.post(
            "/oauth/consent/details", json={"authorization_id": "abc12345", "token": "tok"}
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["no_email"] is True
    assert body["fallback_url"] == "https://aim-journal.com/tok/mcp"
