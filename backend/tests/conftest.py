"""Shared fixtures: an ephemeral Postgres with the migrations applied.

A session-scoped testcontainer runs every migration SQL in order (so the schema is validated too).
Each test gets a function-scoped async connection wrapped in a transaction that is rolled back on
teardown, giving automatic isolation between tests.
"""

import json
from pathlib import Path

import psycopg
import pytest
import pytest_asyncio
from psycopg.rows import dict_row

ROOT = Path(__file__).parents[1]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
EXAMPLE = ROOT / "workout_example.json"

# testcontainers prints noisy logs; import lazily so unit tests don't need Docker.
pytest.importorskip("testcontainers.postgres", reason="testcontainers not installed")
from testcontainers.postgres import PostgresContainer  # noqa: E402


@pytest.fixture(scope="session")
def pg_dsn():
    with PostgresContainer("postgres:17-alpine") as pg:
        dsn = pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql://")
        with psycopg.connect(dsn) as conn:  # apply migrations once, in order
            for migration in MIGRATIONS:
                conn.execute(migration.read_text(encoding="utf-8"))
            conn.commit()
        yield dsn


@pytest_asyncio.fixture
async def conn(pg_dsn):
    c = await psycopg.AsyncConnection.connect(pg_dsn, row_factory=dict_row)
    try:
        yield c
    finally:
        await c.rollback()
        await c.close()


@pytest.fixture(scope="session")
def example_doc() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))
