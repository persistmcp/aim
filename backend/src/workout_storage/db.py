"""Database connection helper.

One short-lived async connection per request (correct for serverless behind the Supabase
transaction pooler). Repo functions accept a connection so they stay easy to test.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row


def get_dsn(dsn: str | None = None) -> str:
    dsn = dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return dsn


@asynccontextmanager
async def connect(
    dsn: str | None = None, *, statement_timeout_ms: int | None = None
) -> AsyncIterator[psycopg.AsyncConnection[dict[str, Any]]]:
    """Yield a dict-row async connection; commits on clean exit, rolls back on error.

    `prepare_threshold=None` disables psycopg's auto-prepared statements, which are incompatible
    with Supabase's transaction pooler (pgbouncer transaction mode).

    Bounded: `connect_timeout` caps the TCP/startup handshake, and `SET LOCAL statement_timeout`
    caps any single query — otherwise a hung query is invisible until the Vercel function timeout.
    LOCAL is required behind the transaction pooler: a session-level SET would be committed onto
    the shared server connection and leak into other requests' transactions. Callers with
    legitimately long queries (the backup dump) pass an explicit `statement_timeout_ms` override;
    0 emits `SET LOCAL statement_timeout = 0` (unbounded for this transaction only).
    """
    connect_timeout = int(os.environ.get("DB_CONNECT_TIMEOUT", "10"))
    if statement_timeout_ms is None:
        statement_timeout_ms = int(os.environ.get("DB_STATEMENT_TIMEOUT_MS", "15000"))
    conn = await psycopg.AsyncConnection.connect(
        get_dsn(dsn),
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=connect_timeout,
    )
    try:
        await conn.execute(f"set local statement_timeout = {int(statement_timeout_ms)}")
        yield conn
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    finally:
        await conn.close()
