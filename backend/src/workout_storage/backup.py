"""Daily backup: dump every table to one JSON document and store it in Vercel Blob.

Invoked by a Vercel Cron (see vercel.json) which sends `Authorization: Bearer $CRON_SECRET`.
If `BLOB_READ_WRITE_TOKEN` is absent the dump still runs (upload is skipped) so the endpoint and
tests work without Blob configured. `scripts/import_document.py` restores the workout data from
a dump; the coaching tables (coach_profiles, user_goals, prompt_templates, coach_events) are
dumped here but have no import_document shape — restore them with plain SQL from the dump JSON.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from . import repo, telegram_alert
from .db import connect
from .serialize import jsonable

log = logging.getLogger(__name__)

TABLES = [
    "users",
    "exercises",
    "programs",
    "day_templates",
    "sessions",
    "session_entries",
    "sets",
    "session_metrics",
    "cardio_activities",
    "body_metrics",
    "coach_profiles",
    "user_goals",
    "prompt_templates",
    "coach_events",
]


async def dump_all(conn: repo.Conn) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for table in TABLES:
        async with conn.cursor() as cur:
            await cur.execute(f"select * from {table}")  # noqa: S608 - table names are a fixed list
            out[table] = await cur.fetchall()
    return out


async def upload_to_blob(pathname: str, data: bytes) -> str | None:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        return None
    import httpx

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            "https://blob.vercel-storage.com/",
            params={"pathname": pathname},
            headers={
                "authorization": f"Bearer {token}",
                "x-api-version": "12",
                # The store (workout-backups) is private: dumps hold every user's data, and a
                # public store serves them at a guessable URL with no auth.
                "x-vercel-blob-access": "private",
                "x-content-type": "application/json",
                "x-add-random-suffix": "0",
            },
            content=data,
        )
        resp.raise_for_status()
        url = resp.json().get("url")
        return str(url) if url is not None else None


async def run_backup(request: Request) -> JSONResponse:
    secret = os.environ.get("CRON_SECRET")
    if not secret or request.headers.get("authorization") != f"Bearer {secret}":
        # A misconfigured CRON_SECRET would otherwise stop backups silently, forever.
        log.warning(
            "backup cron unauthorized (CRON_SECRET missing or mismatched)",
            extra={"event": "backup_unauthorized", "secret_configured": bool(secret)},
        )
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    # The dump reads every table; give it a generous cap instead of the default 15s, but leave
    # headroom under Vercel's own 60s function ceiling (vercel.json) for the prune connection,
    # JSON serialization, and the blob upload that still run after this.
    try:
        async with connect(statement_timeout_ms=45_000) as conn:
            data = await dump_all(conn)
    except Exception as exc:
        # Nothing downstream (prune, upload) runs without a dump — this is a total backup miss,
        # not a degraded one, and it runs unattended overnight with no other way to notice.
        log.exception("backup dump failed", extra={"event": "backup_dump_failed"})
        await telegram_alert.notify("nightly backup", f"{type(exc).__name__}: {exc}")
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)
    # Piggyback on the daily cron to keep telemetry bounded (tool_calls is not backed up).
    # Own connection + catch-all: telemetry housekeeping must never fail the user-data backup.
    try:
        async with connect() as conn:
            pruned = await repo.prune_tool_calls(conn, keep_days=90)
        if pruned:
            log.info("pruned old tool_calls", extra={"event": "tool_calls_pruned", "rows": pruned})
    except Exception:  # noqa: BLE001
        log.exception("tool_calls prune failed", extra={"event": "tool_calls_prune_failed"})
    payload = json.dumps(jsonable(data), ensure_ascii=False).encode("utf-8")
    pathname = f"backups/workout-{date.today().isoformat()}.json"
    # Upload is best-effort: a Blob misconfiguration must not fail the backup or lose the dump.
    stored, upload_error = None, None
    try:
        stored = await upload_to_blob(pathname, payload)
    except Exception as exc:  # noqa: BLE001 - report, don't crash the cron
        upload_error = str(exc)
        log.exception("backup blob upload failed", extra={"event": "backup_upload_failed"})
        await telegram_alert.notify("backup blob upload", upload_error)
    if stored is None and upload_error is None:
        # This has previously gone unnoticed for a stretch of real nights (see docs/DEPLOYMENT.md)
        # — the dump succeeded but nothing durable exists to restore from. Worth a nightly nag
        # until BLOB_READ_WRITE_TOKEN is set, not just a log line nobody is tailing.
        log.warning(
            "backup ran but BLOB_READ_WRITE_TOKEN is unset, dump not stored",
            extra={"event": "backup_not_stored"},
        )
        await telegram_alert.notify(
            "backup storage", "BLOB_READ_WRITE_TOKEN unset, dump not stored"
        )
    log.info(
        "backup complete",
        extra={
            "event": "backup",
            "stored": stored is not None,
            "bytes": len(payload),
            "counts": {k: len(v) for k, v in data.items()},
        },
    )
    return JSONResponse(
        {
            "ok": True,
            "stored": stored,
            "upload_error": upload_error,
            "pathname": pathname,
            "bytes": len(payload),
            "counts": {k: len(v) for k, v in data.items()},
        }
    )


# Served by the single entrypoint (app.py dispatches this exact path, bypassing token resolution).
BACKUP_PATH = "/_cron/backup"

backup_app = Starlette(
    routes=[
        Route(BACKUP_PATH, run_backup, methods=["GET", "POST"]),
        Route("/", run_backup, methods=["GET", "POST"]),
    ]
)
