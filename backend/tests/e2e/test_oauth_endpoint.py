"""End-to-end tests for the OAuth-protected `/mcp` endpoint.

Drives the real ASGI app the way an MCP client does — no token, a bad token, a valid token for
somebody we do not know, and a valid token for a real account — and asserts on what comes back on
the wire rather than on internal state.

Token verification itself is Supabase's and is stubbed here with a static verifier, so these tests
need no network. That the *real* provider accepts a *real* Supabase token (and rejects a tampered
one) is proven separately against the live project; see docs/OAUTH_DESIGN.md §9.
"""

import json

import httpx
import pytest
from fastmcp.server.auth import RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier

from workout_storage import oauth, repo
from workout_storage.context import current_user_id
from workout_storage.db import connect

pytestmark = pytest.mark.e2e

BASE = "https://aim-journal.com"
GOOD = "token-for-a-real-account"
STRANGER = "token-for-nobody"
# gotrue subjects are always uuids; the code refuses anything else rather than letting psycopg
# raise on the uuid column (see test_a_non_uuid_subject_is_refused_not_a_500).
KNOWN_SUB = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
UNKNOWN_SUB = "3f2504e0-4f89-41d3-9a0c-0305e82c3302"


def _provider(claims_by_token):
    """A stand-in for SupabaseProvider that verifies tokens from a dict.

    RemoteAuthProvider (not a bare TokenVerifier) so the app still gets the RFC 9728
    protected-resource route — the document MCP clients read to discover where to authorize, and
    the one hard server-side MUST in the spec.
    """
    return RemoteAuthProvider(
        token_verifier=StaticTokenVerifier(claims_by_token),
        authorization_servers=["https://project.supabase.co/auth/v1"],
        base_url=BASE,
    )


@pytest.fixture
def oauth_app(monkeypatch, pg_dsn):
    """The real OAuth app over the real MCP app, with verification stubbed.

    The inner app's lifespan is *not* started here. Only a request that actually reaches MCP needs
    FastMCP's StreamableHTTPSessionManager, and entering an anyio task group in a fixture and
    leaving it in the test's task raises "cancel scope in a different task" on teardown. The one
    test that gets that far starts it itself.
    """
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("PUBLIC_BASE_URL", BASE)

    from workout_storage.server import mcp

    inner = mcp.http_app(path="/mcp", stateless_http=True, json_response=True)

    monkeypatch.setattr(
        oauth,
        "build_provider",
        lambda: _provider(
            {
                GOOD: {
                    "client_id": "e2e-client",
                    "sub": KNOWN_SUB,
                    "email": "e2e-oauth@example.com",
                },
                STRANGER: {
                    "client_id": "e2e-client",
                    "sub": UNKNOWN_SUB,
                    "email": "stranger@example.com",
                },
            }
        ),
    )
    return oauth.build_oauth_app(inner), inner


async def _client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE)


def _initialize() -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "e2e", "version": "1"},
        },
    }


_MCP_HEADERS = {"accept": "application/json, text/event-stream"}


async def test_no_credential_is_challenged_with_a_discovery_pointer(oauth_app):
    """The first step of the whole flow: an unauthenticated call must tell the client where to go.

    Without the `resource_metadata` pointer a client has nothing to discover and the connector can
    never be added — this is the handshake that replaces copying a token out of an email.
    """
    app, _ = oauth_app
    async with await _client(app) as client:
        resp = await client.post("/mcp", json=_initialize(), headers=_MCP_HEADERS)

    assert resp.status_code == 401
    challenge = resp.headers["www-authenticate"]
    assert challenge.lower().startswith("bearer")
    assert "resource_metadata=" in challenge
    assert "/.well-known/oauth-protected-resource/mcp" in challenge


async def test_protected_resource_metadata_is_served_and_well_formed(oauth_app):
    app, _ = oauth_app
    async with await _client(app) as client:
        resp = await client.get("/.well-known/oauth-protected-resource/mcp")

    assert resp.status_code == 200
    doc = resp.json()
    assert doc["resource"] == f"{BASE}/mcp"
    assert "https://project.supabase.co/auth/v1" in doc["authorization_servers"]


async def test_a_garbage_token_is_rejected(oauth_app):
    app, _ = oauth_app
    async with await _client(app) as client:
        resp = await client.post(
            "/mcp",
            json=_initialize(),
            headers={**_MCP_HEADERS, "authorization": "Bearer not-a-real-token"},
        )
    assert resp.status_code == 401


async def test_a_valid_token_for_an_unknown_account_is_refused_with_403(oauth_app):
    """Verified by Supabase, unknown to us. 401 would tell the client to authorize again and get
    the same token back, so this has to be a 403."""
    app, _ = oauth_app
    async with await _client(app) as client:
        resp = await client.post(
            "/mcp",
            json=_initialize(),
            headers={**_MCP_HEADERS, "authorization": f"Bearer {STRANGER}"},
        )
    assert resp.status_code == 403
    assert "account" in resp.text


async def test_a_real_account_gets_through_and_is_scoped_to_itself(oauth_app, pg_dsn):  # noqa: PLR0915
    """The end of the line: a valid token reaches MCP, and `current_user_id` is the account the
    token's subject maps to — the same contextvar the path-token route sets, so every tool and
    every query stays scoped exactly as before."""
    app, inner = oauth_app
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="OAuth E2E", email="e2e-oauth@example.com")
        await repo.link_supabase_user(conn, str(user["id"]), KNOWN_SUB)

    seen: list[str | None] = []
    original = oauth.resolve_oauth_user_id

    async def spy(claims):
        resolved = await original(claims)
        seen.append(resolved.user_id if resolved else None)
        return resolved

    oauth.resolve_oauth_user_id = spy
    try:
        # Starting the lifespan here, in the test's own task, is what boots the single shared
        # StreamableHTTPSessionManager (see the oauth_app fixture).
        async with inner.router.lifespan_context(inner):
            async with await _client(app) as client:
                resp = await client.post(
                    "/mcp",
                    json=_initialize(),
                    headers={**_MCP_HEADERS, "authorization": f"Bearer {GOOD}"},
                )
    finally:
        oauth.resolve_oauth_user_id = original

    assert resp.status_code == 200, resp.text
    assert seen == [str(user["id"])]
    body = json.loads(resp.text) if resp.text.startswith("{") else None
    if body is not None:
        assert body.get("result", {}).get("serverInfo") is not None
    # The contextvar must not leak out of the request that set it.
    assert current_user_id.get() is None
