"""Integration tests for the identity half of OAuth: mapping a Supabase `sub` onto users.id.

This is the only place where an OAuth token turns into an AIm account, so it is the only place
where a mistake hands one person's training log to somebody else. The negative cases below are
the point of the file; the happy path is the easy part.
"""

import uuid

import pytest

from workout_storage import oauth, repo

pytestmark = pytest.mark.integration


# resolve_oauth_user_id opens its own connection and commits, so its rows outlive the per-test
# transaction the `conn` fixture rolls back (the same reason test_auth.py commits explicitly).
# Every test therefore needs its own subject and address, or one test's committed link is what the
# next test's lookup finds.
@pytest.fixture
def sub():
    return str(uuid.uuid4())


@pytest.fixture
def other_sub():
    return str(uuid.uuid4())


@pytest.fixture
def email():
    return f"oauth-{uuid.uuid4().hex[:12]}@example.com"


async def test_known_subject_resolves_without_touching_email(conn, pg_dsn, monkeypatch, sub, email):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    user = await repo.create_user(conn, name="Linked", email=email)
    await repo.link_supabase_user(conn, str(user["id"]), sub)
    await conn.commit()

    # No email claim at all: once linked, `sub` alone must be enough.
    assert (await oauth.resolve_oauth_user_id({"sub": sub})).user_id == str(user["id"])


async def test_first_authorization_links_by_verified_email(conn, pg_dsn, monkeypatch, sub, email):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    user = await repo.create_user(conn, name="Legacy", email=email)
    await conn.commit()
    assert user["supabase_user_id"] is None

    assert (await oauth.resolve_oauth_user_id({"sub": sub, "email": email})).user_id == str(
        user["id"]
    )

    refreshed = await repo.get_user(conn, str(user["id"]))
    assert str(refreshed["supabase_user_id"]) == sub
    # The magic link Supabase verified is proof of ownership, same as the app's own flow.
    assert refreshed["email_verified_at"] is not None


async def test_email_match_is_case_insensitive(conn, pg_dsn, monkeypatch, sub, email):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    user = await repo.create_user(conn, name="Mixed", email=email.upper())
    await conn.commit()

    resolved = await oauth.resolve_oauth_user_id({"sub": sub, "email": email.lower()})
    assert resolved.user_id == str(user["id"])


async def test_token_without_a_subject_is_refused(pg_dsn, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    assert await oauth.resolve_oauth_user_id({}) is None
    assert await oauth.resolve_oauth_user_id({"email": "someone@example.com"}) is None


async def test_unverified_email_never_claims_an_account(
    conn, pg_dsn, monkeypatch, other_sub, email
):
    """The whole email fallback rests on Supabase having verified the address. If a token ever
    says otherwise, matching on it would let anyone take over an account by signing up with the
    right address."""
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    await repo.create_user(conn, name="Victim", email=email)
    await conn.commit()

    assert (
        await oauth.resolve_oauth_user_id(
            {"sub": other_sub, "email": email, "email_verified": False}
        )
        is None
    )


async def test_unknown_email_is_refused_rather_than_creating_an_account(
    pg_dsn, monkeypatch, sub, email
):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    assert await oauth.resolve_oauth_user_id({"sub": sub, "email": email}) is None


async def test_account_already_linked_to_another_identity_is_refused(
    conn, pg_dsn, monkeypatch, sub, other_sub, email
):
    """Two Supabase identities, one AIm account, same address. The second must not silently
    repoint the account at whoever signed in last."""
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    user = await repo.create_user(conn, name="Contested", email=email)
    await repo.link_supabase_user(conn, str(user["id"]), sub)
    await conn.commit()

    assert (await oauth.resolve_oauth_user_id({"sub": sub})).user_id == str(user["id"])
    assert await oauth.resolve_oauth_user_id({"sub": other_sub, "email": email}) is None

    still = await repo.get_user(conn, str(user["id"]))
    assert str(still["supabase_user_id"]) == sub


async def test_link_is_idempotent(conn, sub, other_sub, email):
    user = await repo.create_user(conn, name="Repeat", email=email)
    assert await repo.link_supabase_user(conn, str(user["id"]), sub) is True
    assert await repo.link_supabase_user(conn, str(user["id"]), sub) is True
    assert await repo.link_supabase_user(conn, str(user["id"]), other_sub) is False


async def test_one_supabase_identity_cannot_own_two_accounts(conn, sub, email):
    """Enforced by the unique index, not by application code — so it holds even if a future caller
    forgets the check inside link_supabase_user."""
    import psycopg

    first = await repo.create_user(conn, name="First", email=email)
    second = await repo.create_user(conn, name="Second", email="other-" + email)
    assert await repo.link_supabase_user(conn, str(first["id"]), sub) is True
    with pytest.raises(psycopg.errors.UniqueViolation):
        await repo.link_supabase_user(conn, str(second["id"]), sub)


async def test_the_demo_account_is_flagged_so_its_write_limits_still_apply(
    conn, pg_dsn, monkeypatch, sub
):
    """demo_guard keys off the is_demo_user contextvar, which auth.py sets from the path token.
    An OAuth caller reaching the demo account must carry the same flag, or the public account
    loses its rate limit, its storage cap and its import block."""
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    # Patch the constant rather than seeding the real "demo" token: it is globally unique, so a
    # fixed value collides with any other test that has ever committed one.
    demo_token = f"demo-{uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(oauth, "DEMO_TOKEN", demo_token)
    demo = await repo.create_user(
        conn, name="Demo", token=demo_token, email=f"d-{demo_token}@example.com"
    )
    await repo.link_supabase_user(conn, str(demo["id"]), sub)
    await conn.commit()

    resolved = await oauth.resolve_oauth_user_id({"sub": sub})
    assert resolved.user_id == str(demo["id"])
    assert resolved.is_demo is True


async def test_a_normal_account_is_not_flagged_as_demo(conn, pg_dsn, monkeypatch, sub, email):
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    user = await repo.create_user(conn, name="Normal", email=email)
    await repo.link_supabase_user(conn, str(user["id"]), sub)
    await conn.commit()

    assert (await oauth.resolve_oauth_user_id({"sub": sub})).is_demo is False


async def test_a_non_uuid_subject_is_refused_not_a_500(pg_dsn, monkeypatch):
    """`supabase_user_id` is a uuid column. A token whose `sub` is not one must be turned away
    cleanly — psycopg would otherwise raise InvalidTextRepresentation and the endpoint would 500.
    Found by a test, not in production, which is the point of having this one."""
    monkeypatch.setenv("DATABASE_URL", pg_dsn)
    for bad in ("not-a-uuid", "", "  ", "12345", None, 42, {"nested": "object"}):
        assert await oauth.resolve_oauth_user_id({"sub": bad}) is None, bad
