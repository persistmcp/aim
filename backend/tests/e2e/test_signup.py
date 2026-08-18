"""E2E tests for public signup + magic-link activation, driven over HTTP through the full ASGI app.

RESEND_API_KEY is unset in tests, so send_magic_link is a logged no-op — the account is still
created and the endpoint returns its neutral response.
"""

import os

import httpx
import pytest
import pytest_asyncio

from workout_storage import repo
from workout_storage.db import connect

pytestmark = pytest.mark.e2e


@pytest_asyncio.fixture
async def client(pg_dsn):
    os.environ["DATABASE_URL"] = pg_dsn
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


async def test_signup_creates_user_and_is_neutral(client, pg_dsn):
    r = await client.post("/api/public/signup", json={"email": "New.User@Example.com"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # Token is never leaked over HTTP.
    assert "token" not in r.text

    async with connect(pg_dsn) as conn:
        user = await repo.get_user_by_email(conn, "new.user@example.com")
    assert user is not None and user["email"] == "new.user@example.com"


async def test_signup_existing_email_does_not_duplicate(client, pg_dsn):
    email = "repeat@example.com"
    await client.post("/api/public/signup", json={"email": email})
    await client.post("/api/public/signup", json={"email": email})

    async with connect(pg_dsn) as conn, conn.cursor() as cur:
        await cur.execute("select count(*) as n from users where lower(email) = %s", [email])
        assert (await cur.fetchone())["n"] == 1


async def test_signup_rejects_bad_email(client):
    r = await client.post("/api/public/signup", json={"email": "not-an-email"})
    assert r.status_code == 400


async def test_signup_cors_preflight_allowed(client):
    # The SPA posts cross-origin in dev; the JSON content-type triggers an OPTIONS preflight.
    r = await client.options(
        "/api/public/signup",
        headers={
            "origin": "http://localhost:5173",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")
    assert "POST" in r.headers.get("access-control-allow-methods", "")


async def test_signup_post_has_cors_header(client):
    r = await client.post(
        "/api/public/signup",
        json={"email": "cors@example.com"},
        headers={"origin": "http://localhost:5173"},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")


async def test_signup_rate_limited_per_ip(client):
    ip = "203.0.113.7"
    headers = {"x-forwarded-for": ip}
    for i in range(5):
        r = await client.post(
            "/api/public/signup", json={"email": f"rl{i}@example.com"}, headers=headers
        )
        assert r.status_code == 200
    blocked = await client.post(
        "/api/public/signup", json={"email": "rl5@example.com"}, headers=headers
    )
    assert blocked.status_code == 429


async def test_rate_limit_keys_on_x_real_ip_not_spoofable_xff(client):
    # Vercel sets x-real-ip to the true client; a rotating (spoofed) x-forwarded-for must not
    # create fresh quotas. Same x-real-ip across requests → still limited after 5.
    real_ip = "198.51.100.42"
    for i in range(5):
        r = await client.post(
            "/api/public/signup",
            json={"email": f"spoof{i}@example.com"},
            headers={"x-real-ip": real_ip, "x-forwarded-for": f"10.0.0.{i}"},
        )
        assert r.status_code == 200
    blocked = await client.post(
        "/api/public/signup",
        json={"email": "spoof5@example.com"},
        headers={"x-real-ip": real_ip, "x-forwarded-for": "10.0.0.99"},
    )
    assert blocked.status_code == 429


async def test_full_flow_signup_then_open_link_activates(client, pg_dsn):
    # The complete magic-link chain: signup → (token only in DB, never in the HTTP response) →
    # open /{token} (here /api/me) → account activated.
    email = "fullflow@example.com"
    r = await client.post("/api/public/signup", json={"email": email})
    assert r.status_code == 200 and "token" not in r.text

    async with connect(pg_dsn) as conn:
        user = await repo.get_user_by_email(conn, email)
    assert user["email_verified_at"] is None
    token = user["token"]

    me = await client.get(f"/{token}/api/me")
    assert me.status_code == 200

    async with connect(pg_dsn) as conn:
        refreshed = await repo.get_user(conn, str(user["id"]))
    assert refreshed["email_verified_at"] is not None


async def test_me_activates_email_on_first_visit(client, pg_dsn):
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Mailed", email="activate@example.com")
    token = user["token"]
    assert user["email_verified_at"] is None

    r = await client.get(f"/{token}/api/me")
    assert r.status_code == 200

    async with connect(pg_dsn) as conn:
        refreshed = await repo.get_user(conn, str(user["id"]))
    assert refreshed["email_verified_at"] is not None
