"""E2E: unattended/background paths (nightly crons, signup) page the owner on failure instead of
failing silently.

These all bypass TokenResolverMiddleware entirely (see app.py's dispatch: `/_cron/*` and
`/api/public/*` are routed before token resolution), so auth.py's alert hooks don't cover them —
each needed its own wiring, verified here.
"""

import os

import httpx
import pytest

pytestmark = pytest.mark.e2e


async def test_backup_dump_failure_sends_telegram_alert(pg_dsn, monkeypatch, telegram_capture):
    os.environ["DATABASE_URL"] = pg_dsn
    monkeypatch.setenv("CRON_SECRET", "secret123")
    from workout_storage import backup
    from workout_storage.app import app

    async def boom(conn):
        raise RuntimeError("table locked")

    monkeypatch.setattr(backup, "dump_all", boom)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/backup", headers={"authorization": "Bearer secret123"})

    assert r.status_code == 500
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "nightly backup"
    assert "table locked" in telegram_capture[0][1]


async def test_backup_unset_blob_token_sends_telegram_alert(pg_dsn, monkeypatch, telegram_capture):
    """Not a crash — the dump itself succeeds — but nothing durable exists to restore from if
    BLOB_READ_WRITE_TOKEN stays unset, and that has gone unnoticed for real nights before."""
    os.environ["DATABASE_URL"] = pg_dsn
    monkeypatch.setenv("CRON_SECRET", "secret123")
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)

    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/backup", headers={"authorization": "Bearer secret123"})

    assert r.status_code == 200
    assert r.json()["stored"] is None
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "backup storage"
    assert "BLOB_READ_WRITE_TOKEN" in telegram_capture[0][1]


async def test_backup_blob_upload_error_sends_telegram_alert(pg_dsn, monkeypatch, telegram_capture):
    os.environ["DATABASE_URL"] = pg_dsn
    monkeypatch.setenv("CRON_SECRET", "secret123")
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "fake-token")
    from workout_storage import backup
    from workout_storage.app import app

    async def boom(pathname, data):
        raise RuntimeError("blob store unreachable")

    monkeypatch.setattr(backup, "upload_to_blob", boom)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/backup", headers={"authorization": "Bearer secret123"})

    assert r.status_code == 200  # the dump itself succeeded; only storage failed
    assert r.json()["stored"] is None
    assert r.json()["upload_error"]
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "backup blob upload"
    assert "blob store unreachable" in telegram_capture[0][1]


async def test_reset_demo_failure_sends_telegram_alert(pg_dsn, monkeypatch, telegram_capture):
    os.environ["DATABASE_URL"] = pg_dsn
    monkeypatch.setenv("CRON_SECRET", "secret123")
    from workout_storage import repo
    from workout_storage.app import app
    from workout_storage.auth import DEMO_TOKEN
    from workout_storage.db import connect

    # The demo account is process-wide (one row keyed by the fixed DEMO_TOKEN); another test in
    # this session may have already created it against the same pg_dsn container.
    async with connect(pg_dsn) as conn:
        if await repo.get_user_by_token(conn, DEMO_TOKEN) is None:
            await repo.create_user(conn, name="Demo", token=DEMO_TOKEN)

    async def boom(conn, user_id):
        raise RuntimeError("cascade delete failed")

    monkeypatch.setattr(repo, "reset_demo_data", boom)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/_cron/reset-demo", headers={"authorization": "Bearer secret123"})

    assert r.status_code == 500
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "nightly demo reset"
    assert "cascade delete failed" in telegram_capture[0][1]


async def test_signup_db_failure_sends_telegram_alert(pg_dsn, monkeypatch, telegram_capture):
    os.environ["DATABASE_URL"] = pg_dsn
    from workout_storage import repo
    from workout_storage.app import app

    async def boom(conn, ip):
        raise RuntimeError("db unreachable")

    monkeypatch.setattr(repo, "record_signup_event", boom)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/public/signup", json={"email": "victim@example.com"})

    assert r.status_code == 500
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "signup"
    assert "db unreachable" in telegram_capture[0][1]
