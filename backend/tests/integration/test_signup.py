"""Integration tests for the self-service signup repo helpers (real Postgres via testcontainers)."""

from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from workout_storage import repo

pytestmark = pytest.mark.integration


async def test_create_user_stores_normalized_email(conn):
    """I-SIGNUP-1."""
    user = await repo.create_user(conn, email="  Alex@Example.COM ")
    assert user["email"] == "alex@example.com"
    assert user["email_verified_at"] is None


async def test_get_user_by_email_is_case_insensitive(conn):
    created = await repo.create_user(conn, email="user@example.com")
    found = await repo.get_user_by_email(conn, "USER@Example.com")
    assert found is not None and str(found["id"]) == str(created["id"])
    assert await repo.get_user_by_email(conn, "nobody@example.com") is None


async def test_email_unique_case_insensitive(conn):
    await repo.create_user(conn, email="dup@example.com")
    with pytest.raises(psycopg.errors.UniqueViolation):
        await repo.create_user(conn, email="DUP@example.com")


async def test_users_without_email_are_allowed(conn):
    # CLI-created accounts may have no email; the partial unique index allows multiple NULLs.
    await repo.create_user(conn, name="a")
    await repo.create_user(conn, name="b")  # would raise if NULLs collided


async def test_mark_email_verified_is_idempotent(conn):
    """I-SIGNUP-2."""
    user = await repo.create_user(conn, email="verify@example.com")
    uid = str(user["id"])

    await repo.mark_email_verified(conn, uid)
    first = (await repo.get_user(conn, uid))["email_verified_at"]
    assert first is not None

    await repo.mark_email_verified(conn, uid)  # second call must not move the timestamp
    assert (await repo.get_user(conn, uid))["email_verified_at"] == first


async def test_mark_email_verified_noop_without_email(conn):
    user = await repo.create_user(conn, name="no-email")
    await repo.mark_email_verified(conn, str(user["id"]))
    assert (await repo.get_user(conn, str(user["id"])))["email_verified_at"] is None


async def test_signup_rate_limit_counting(conn):
    """I-SIGNUP-3: also the exact boundary SCN-SIGNUP-5 CC2 (rate-limit window rollover) needs —
    varies the `since` cutoff instead of mocking real time, so it's a precise, non-flaky check."""
    now = datetime.now(UTC)
    window_start = now - timedelta(hours=1)

    assert await repo.count_recent_signups(conn, "1.2.3.4", window_start) == 0
    for _ in range(3):
        await repo.record_signup_event(conn, "1.2.3.4")
    await repo.record_signup_event(conn, "9.9.9.9")  # different IP, must not count

    assert await repo.count_recent_signups(conn, "1.2.3.4", window_start) == 3
    # Events older than the window are excluded.
    assert await repo.count_recent_signups(conn, "1.2.3.4", now + timedelta(minutes=1)) == 0


async def test_prune_signup_events_keeps_window(conn):
    """I-SIGNUP-4."""
    # Backdate one event beyond the window; prune drops it but keeps a fresh one.
    await repo.record_signup_event(conn, "5.5.5.5")
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into signup_events (ip, created_at) values (%s, now() - interval '2 hours')",
            ["5.5.5.5"],
        )
    cutoff = datetime.now(UTC) - timedelta(hours=1)
    await repo.prune_signup_events(conn, cutoff)
    async with conn.cursor() as cur:
        await cur.execute("select count(*) as n from signup_events where ip = %s", ["5.5.5.5"])
        assert (await cur.fetchone())["n"] == 1
