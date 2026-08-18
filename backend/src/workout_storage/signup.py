"""Public, token-less self-service signup.

`POST /api/public/signup {email}` creates (or reuses) a user and emails them a magic link — their
personal UI URL + MCP connector URL. Dispatched by app.py *before* token resolution (the token
middleware would otherwise treat `api` as a token and 404), mirroring the cron/backup short-circuit.

Security model:
- The response is always a neutral `{ok: true}` — the token is never returned over HTTP, only via
  the email. So the endpoint can't be used to enumerate registered emails or harvest tokens, and a
  re-signup with an existing email just re-sends that user's link to their inbox.
- Per-IP hourly rate limit (DB-backed) caps abuse of the account-creating endpoint.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import UTC, datetime, timedelta

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from . import analytics, repo, telegram_alert
from . import email as email_service
from .db import connect
from .inbound import INBOUND_PATH, inbound_email

SIGNUP_PREFIX = "/api/public/"

log = logging.getLogger(__name__)

# The SPA posts here cross-origin in dev (localhost → deployed API); same-origin in prod. Mirror the
# read API's CORS so the browser preflight (OPTIONS, with a JSON content-type) succeeds. Public,
# unauthenticated, no credentials → "*" is fine. Override with WEB_ORIGINS to lock down.
_origins = os.environ.get("WEB_ORIGINS", "*")
_allow_origins = ["*"] if _origins.strip() == "*" else [o.strip() for o in _origins.split(",")]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RATE_LIMIT = 5  # accepted signups per IP per window
_RATE_WINDOW = timedelta(hours=1)


def _client_ip(request: Request) -> str:
    # x-real-ip is set by Vercel to the true client IP — prefer it. The leftmost x-forwarded-for
    # entry is client-controllable, so trusting it first would let a spoofed header dodge the limit.
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def signup(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed body → bad request
        return JSONResponse({"error": "invalid body"}, status_code=400)

    email = repo.normalize_email(body.get("email") if isinstance(body, dict) else None)
    if not email or not _EMAIL_RE.match(email):
        return JSONResponse({"error": "valid email required"}, status_code=400)

    # Email language follows the language the landing was viewed in; unknown values fall back
    # to the source language inside the sender.
    lang = body.get("lang") if isinstance(body, dict) else None
    if not isinstance(lang, str):
        lang = email_service.DEFAULT_LANG

    ip = _client_ip(request)
    since = datetime.now(UTC) - _RATE_WINDOW
    try:
        async with connect() as conn:
            # keep the throttle table bounded to the window
            await repo.prune_signup_events(conn, since)
            if await repo.count_recent_signups(conn, ip, since) >= _RATE_LIMIT:
                log.warning(
                    "signup rate-limited",
                    extra={"event": "signup_rate_limited", "ip": ip},
                )
                return JSONResponse(
                    {"error": "too many requests, try again later"}, status_code=429
                )
            await repo.record_signup_event(conn, ip)
            user = await repo.get_user_by_email(conn, email)
            created = user is None
            if user is None:
                user = await repo.create_user(conn, email=email)
    except Exception as exc:
        # DB down during signup — every new user is silently turned away at the door.
        log.exception("signup failed", extra={"event": "signup_failed"})
        await telegram_alert.notify("signup", f"{type(exc).__name__}: {exc}")
        return JSONResponse({"error": "internal error"}, status_code=500)

    # Send outside the DB transaction; failure is logged, never surfaced (would leak signup state).
    sent = await email_service.send_magic_link(email, user["token"], lang=lang)
    log.info(
        "signup accepted",
        extra={"event": "signup", "email": email, "new_user": created, "email_sent": sent},
    )
    await analytics.capture(
        str(user["id"]),
        "signup",
        {"new_user": created, "email_sent": sent, "lang": lang},
        set_person={"email": email},
    )
    return JSONResponse({"ok": True})


signup_app = Starlette(
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=_allow_origins,
            allow_methods=["POST"],
            allow_headers=["content-type"],
        )
    ],
    routes=[
        Route(f"{SIGNUP_PREFIX}signup", signup, methods=["POST"]),
        # Resend inbound webhook (contact@ forwarding); svix-signed, so token-less is fine.
        Route(f"{SIGNUP_PREFIX}{INBOUND_PATH}", inbound_email, methods=["POST"]),
    ],
)
