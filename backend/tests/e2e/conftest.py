"""Shared e2e harness: a fresh user pointed at the test DB + in-memory MCP tool calls."""

import os

import pytest
import pytest_asyncio

from workout_storage import repo, telegram_alert
from workout_storage.context import current_user_id
from workout_storage.db import connect


@pytest.fixture
def telegram_capture(monkeypatch):
    """Captures every telegram_alert.notify() call app-wide instead of hitting the network.

    Patches the shared module attribute, so it catches calls from every caller (observability.py,
    auth.py, backup.py, reset_demo.py, signup.py, email.py, inbound.py) regardless of which one
    imported telegram_alert first — they all look up `.notify` on this same module object.
    """
    calls = []

    async def fake_notify(source, error, user_id=None):
        calls.append((source, error, user_id))

    monkeypatch.setattr(telegram_alert, "notify", fake_notify)
    return calls


@pytest_asyncio.fixture
async def user_token(pg_dsn):
    """Point services at the test DB and create a fresh user; yield (id, token)."""
    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="E2E")
    return str(user["id"]), user["token"]


@pytest_asyncio.fixture
async def as_user(user_token):
    """Set the request-scoped user context for in-memory tool calls."""
    uid, _ = user_token
    reset = current_user_id.set(uid)
    try:
        yield uid
    finally:
        current_user_id.reset(reset)


async def call_tool(client, name, **args):
    res = await client.call_tool(name, args)
    return res.data


def mcp_server():
    # Imported lazily so DATABASE_URL is already pointed at the test DB.
    from workout_storage.server import mcp

    return mcp


@pytest_asyncio.fixture
async def seeded(pg_dsn, example_doc):
    """A user with the example document imported; yields (user_id, token)."""
    from workout_storage import services
    from workout_storage.models import WorkoutDocument

    os.environ["DATABASE_URL"] = pg_dsn
    async with connect(pg_dsn) as conn:
        user = await repo.create_user(conn, name="Alex", timezone="Europe/Lisbon")
    uid, token = str(user["id"]), user["token"]
    reset = current_user_id.set(uid)
    try:
        await services.import_document(WorkoutDocument.model_validate(example_doc))
    finally:
        current_user_id.reset(reset)
    return uid, token
