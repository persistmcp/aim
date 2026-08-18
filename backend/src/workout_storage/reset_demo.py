"""Nightly reset of the public demo account back to a clean, seeded baseline.

demo_guard.py rate-limits and caps writes on the demo token, but this cron is the actual backstop:
whatever accumulates during the day (or slips past a guard bug) is wiped and reseeded every night,
so worst-case growth is bounded to under 24h regardless of what the guard does or doesn't catch.

Invoked by a Vercel Cron (see vercel.json) which sends `Authorization: Bearer $CRON_SECRET`, same
pattern as backup.py. A no-op (200, skipped) if the demo account hasn't been created yet.
"""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from . import coach, repo, services, telegram_alert
from .auth import DEMO_TOKEN
from .context import current_user_id
from .db import connect
from .models import Session, SessionEntry, SetEntry

log = logging.getLogger(__name__)

_SEED_SESSIONS = [
    Session(
        date=date.today() - timedelta(days=2),
        day_label="Push",
        duration_sec=3000,
        entries=[
            SessionEntry(
                exercise_id="bench-press",
                sets=[
                    SetEntry(set_number=1, weight_kg=60, reps=8),
                    SetEntry(set_number=2, weight_kg=60, reps=8),
                    SetEntry(set_number=3, weight_kg=62.5, reps=6),
                ],
            ),
            SessionEntry(
                exercise_id="overhead-press",
                sets=[
                    SetEntry(set_number=1, weight_kg=30, reps=10),
                    SetEntry(set_number=2, weight_kg=30, reps=9),
                ],
            ),
        ],
    ),
    Session(
        date=date.today(),
        day_label="Legs",
        duration_sec=3300,
        entries=[
            SessionEntry(
                exercise_id="back-squat",
                sets=[
                    SetEntry(set_number=1, weight_kg=80, reps=6),
                    SetEntry(set_number=2, weight_kg=80, reps=6),
                    SetEntry(set_number=3, weight_kg=85, reps=5),
                ],
            ),
        ],
    ),
]

_SEED_GOAL = coach.GoalInput(
    kind=coach.GoalKind.performance,
    title="Bench press 70kg for 5 reps",
    status=coach.GoalStatus.active,
)


async def _reseed(user_id: str) -> None:
    reset = current_user_id.set(user_id)
    try:
        for session in _SEED_SESSIONS:
            await services.log_session(session)
        await services.upsert_goal(_SEED_GOAL)
    finally:
        current_user_id.reset(reset)


async def run_reset_demo(request: Request) -> JSONResponse:
    secret = os.environ.get("CRON_SECRET")
    if not secret or request.headers.get("authorization") != f"Bearer {secret}":
        log.warning(
            "reset-demo cron unauthorized (CRON_SECRET missing or mismatched)",
            extra={"event": "reset_demo_unauthorized", "secret_configured": bool(secret)},
        )
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        async with connect() as conn:
            user = await repo.get_user_by_token(conn, DEMO_TOKEN)
            if user is None:
                log.info("reset-demo: no demo account yet, skipping", extra={"event": "reset_demo"})
                return JSONResponse({"ok": True, "skipped": "no demo account"})
            user_id = str(user["id"])
            # Sessions cascade to session_entries/sets/session_metrics/cardio_activities.
            deleted = await repo.reset_demo_data(conn, user_id)

        await _reseed(user_id)
    except Exception as exc:
        # A failure here leaves the demo account deleted-but-not-reseeded (or growing unbounded,
        # if it failed before the delete) — either way it's the public face of the product broken
        # for every external directory visitor until someone notices and reruns this by hand.
        log.exception("reset-demo failed", extra={"event": "reset_demo_failed"})
        await telegram_alert.notify("nightly demo reset", f"{type(exc).__name__}: {exc}")
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)

    log.info("reset-demo complete", extra={"event": "reset_demo", "deleted": deleted})
    return JSONResponse({"ok": True, "deleted": deleted})


# Served by the single entrypoint (app.py dispatches this exact path, bypassing token resolution).
RESET_DEMO_PATH = "/_cron/reset-demo"

reset_demo_app = Starlette(
    routes=[
        Route(RESET_DEMO_PATH, run_reset_demo, methods=["GET", "POST"]),
        Route("/", run_reset_demo, methods=["GET", "POST"]),
    ]
)
