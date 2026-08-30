"""Read-only JSON API for the mobile web frontend (P0).

Mounted at `/{token}/api/*`; the token middleware has already resolved the user into the request
context, so handlers just call `services` (which scope by that user) and return JSON. No writes yet.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any

from pydantic import ValidationError
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from . import export_xlsx, services
from .context import get_user_id
from .landmarks import LANDMARK_ALIAS, SET_LANDMARKS
from .models import BodyMetric

# Read-only, token-gated data → permissive CORS is fine (lets the SPA call it from localhost in dev;
# same-origin in prod). Override with WEB_ORIGINS (comma-separated) to lock down.
_origins = os.environ.get("WEB_ORIGINS", "*")
_allow_origins = ["*"] if _origins.strip() == "*" else [o.strip() for o in _origins.split(",")]


def _int(req: Request, name: str, default: int, *, lo: int = 1, hi: int = 500) -> int:
    raw = req.query_params.get(name)
    if raw is None:
        return default
    try:
        return max(lo, min(hi, int(raw)))
    except ValueError:
        return default


def _date(req: Request, name: str) -> date | None:
    raw = req.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


async def _json_body(request: Request) -> dict[str, Any] | None:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed/empty body → treat as no body
        return None
    return body if isinstance(body, dict) else None


async def health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "user_id": get_user_id()})


async def me(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_me())


async def summary(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_summary())


async def adherence(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_adherence())


async def connection(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_connection())


async def profile(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_profile(today=_client_date(request)))


async def goals(request: Request) -> JSONResponse:
    """Goal history for the app's browsable-past-goals view. Defaults to "all" (not "active" like
    the MCP tool) — the only reason the web app calls this route is browsing what came before;
    the one goal worth showing prominently right now is already in GET /profile's featured_goal,
    with the type-specific progress this route deliberately doesn't compute (cheap regardless of
    how many past goals a user accumulates)."""
    status = request.query_params.get("status", "all")
    return JSONResponse(await services.get_goals(status))


def _export_filename(date_from: date | None, date_to: date | None, ext: str = "json") -> str:
    if date_from is None and date_to is None:
        return f"aim-export-{date.today().isoformat()}.{ext}"
    start = date_from.isoformat() if date_from else "start"
    end = date_to.isoformat() if date_to else "now"
    return f"aim-export-{start}_{end}.{ext}"


async def export(request: Request) -> Response:
    date_from = _date(request, "from")
    date_to = _date(request, "to")
    doc = await services.export_document(date_from=date_from, date_to=date_to)
    if request.query_params.get("format") == "xlsx":
        lang = request.query_params.get("lang", "en")
        filename = _export_filename(date_from, date_to, ext="xlsx")
        return Response(
            export_xlsx.render_xlsx(doc, lang),
            media_type=export_xlsx.XLSX_MIME,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    filename = _export_filename(date_from, date_to)
    return JSONResponse(doc, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


async def sessions(request: Request) -> JSONResponse:
    return JSONResponse(
        await services.list_sessions(
            date_from=_date(request, "from"),
            date_to=_date(request, "to"),
            limit=_int(request, "limit", 50),
        )
    )


async def session_detail(request: Request) -> JSONResponse:
    row = await services.get_session(request.path_params["id"])
    if row is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(row)


def _locale(request: Request) -> str | None:
    """Primary language tag from Accept-Language ("ru-RU,ru;q=0.9,en;q=0.8" → "ru").

    Good enough on purpose: `present_pool_exercise` already falls back en → ru → any, so a header
    we cannot parse costs a fallback, never a blank field.
    """
    header = request.headers.get("accept-language", "")
    first = header.split(",")[0].strip().split(";")[0]
    return first.split("-")[0].lower() or None


async def exercises(request: Request) -> JSONResponse:
    # An explicit `?locale=` beats Accept-Language: the header is the browser's setting, while the
    # query param is the language the user actually picked in the app's own switcher.
    locale = request.query_params.get("locale") or _locale(request)
    return JSONResponse(await services.list_exercises(locale=locale))


async def exercise_pool(request: Request) -> JSONResponse:
    q = request.query_params
    equipment = q.getlist("equipment") or None
    return JSONResponse(
        await services.search_exercise_pool(
            muscle=q.get("muscle"),
            equipment=equipment,
            movement_pattern=q.get("movement_pattern"),
            category=q.get("category"),
            query=q.get("query"),
            limit=int(q.get("limit", 40)),
            locale=q.get("locale") or _locale(request),
        )
    )


async def stats_progression(request: Request) -> JSONResponse:
    exercise_id = request.query_params.get("exercise_id")
    if not exercise_id:
        return JSONResponse({"error": "exercise_id is required"}, status_code=400)
    return JSONResponse(await services.get_stats("progression", exercise_id=exercise_id))


async def stats_volume(request: Request) -> JSONResponse:
    bucket = request.query_params.get("bucket", "week")
    if bucket not in ("week", "month"):
        bucket = "week"
    return JSONResponse(
        await services.get_volume(bucket=bucket, period=request.query_params.get("period"))
    )


# How far the caller's clock may differ from the server's before we stop believing it. Covers
# every real timezone offset (±14h) with room to spare; anything beyond is a broken device clock.
_CLIENT_DATE_SKEW = timedelta(days=2)


def _client_date(request: Request) -> date | None:
    """The caller's own local date, when it sends one. The muscle panel decays load by age in
    days, and the server clock is UTC — without this an Americas user's evening session reads a
    day old the moment UTC rolls over.

    Clamped to ±2 days of the server's date, because this value drives date arithmetic and a query
    window. An unclamped one is not merely wrong: `0001-01-05` overflows `date - timedelta` into a
    500, and any far-past date widens the fetch window to the user's entire history *and* makes
    every set read as freshly performed (ages clamp at 0), so a phone with a broken clock would
    paint a fully-red body off a full-table scan. Unparseable or out-of-range falls back to the
    server's date."""
    raw = request.query_params.get("today")
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        return None
    today = date.today()
    return parsed if abs(parsed - today) <= _CLIENT_DATE_SKEW else None


async def stats_muscle_volume(request: Request) -> JSONResponse:
    return JSONResponse(
        await services.get_muscle_volume(
            period=request.query_params.get("period", "week"), today=_client_date(request)
        )
    )


async def program(request: Request) -> JSONResponse:
    row = await services.get_program()
    if row is None:
        return JSONResponse({"error": "no active program"}, status_code=404)
    return JSONResponse(row)


async def prs(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_all_prs(limit=_int(request, "limit", 20)))


async def body_metrics(request: Request) -> JSONResponse:
    return JSONResponse(await services.get_body_metrics(limit=_int(request, "limit", 100)))


async def create_body_metric(request: Request) -> JSONResponse:
    body = await _json_body(request)
    if body is None:
        return JSONResponse({"error": "invalid body"}, status_code=400)
    try:
        metric = BodyMetric.model_validate({"date": date.today().isoformat(), **body})
    except ValidationError as exc:
        return JSONResponse({"error": exc.errors()[0]["msg"]}, status_code=400)
    return JSONResponse(await services.log_body_metric(metric))


async def patch_set(request: Request) -> JSONResponse:
    body = await _json_body(request)
    if body is None:
        return JSONResponse({"error": "invalid body"}, status_code=400)
    session_id = body.get("session_id")
    exercise_id = body.get("exercise_id")
    set_number = body.get("set_number")
    patch = body.get("patch")
    if (
        not session_id
        or not exercise_id
        or not isinstance(set_number, int)
        or not isinstance(patch, dict)
    ):
        return JSONResponse(
            {"error": "session_id, exercise_id, set_number and patch are required"},
            status_code=400,
        )
    try:
        row = await services.update_set(
            session_id,
            exercise_id,
            set_number,
            patch,
            occurrence=body.get("occurrence") or 1,
        )
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if row is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(row)


async def rotate_token(request: Request) -> JSONResponse:
    body = await _json_body(request) or {}
    result = await services.rotate_token(lang=body.get("lang"))
    if not result["ok"]:
        return JSONResponse({"error": "no email on file"}, status_code=409)
    return JSONResponse(result)


async def landmarks(request: Request) -> JSONResponse:
    """Per-muscle MEV/MAV weekly-set landmarks — single source of truth for the muscle heat map
    and the coaching prompts (the frontend copy in muscle.ts migrates to this)."""
    return JSONResponse({"set_landmarks": SET_LANDMARKS, "alias": LANDMARK_ALIAS})


# Branding fields mirror web/vite.config.ts's VitePWA manifest — keep the two in sync. What this
# copy adds is the token-aware start_url: iOS home-screen web apps get a storage container
# separate from Safari's, so the static manifest's start_url "/" lands an installed app on the
# landing page with no saved token to restore. The frontend swaps <link rel="manifest"> to this
# route on token pages; start_url is RELATIVE so, resolved against /{token}/api/manifest, it
# becomes /{token}/app for whichever token fetched it — one constant response, no token handling.
# "id" pins the app identity to "/" (what installs under the static manifest defaulted to), so
# Chrome treats this as the same app, not a second install.
_TOKEN_MANIFEST = {
    "name": "AIm: AI coach and workout journal",
    "short_name": "AIm",
    "lang": "en",
    "description": "Goal, plan and progress inside your AI",
    "theme_color": "#0B0D0E",
    "background_color": "#0B0D0E",
    "display": "standalone",
    "id": "/",
    "scope": "/",
    "start_url": "../app",
    "icons": [
        {"src": "/pwa-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/pwa-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {
            "src": "/pwa-512-maskable.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable",
        },
        {"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
    ],
}


async def manifest(request: Request) -> JSONResponse:
    return JSONResponse(_TOKEN_MANIFEST, media_type="application/manifest+json")


api_app = Starlette(
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=_allow_origins,
            allow_methods=["GET", "POST", "PATCH"],
            allow_headers=["content-type"],
        )
    ],
    routes=[
        Route("/health", health),
        Route("/me", me),
        Route("/summary", summary),
        Route("/adherence", adherence),
        Route("/connection", connection),
        Route("/profile", profile),
        Route("/goals", goals),
        Route("/export", export),
        Route("/sessions", sessions),
        Route("/sessions/{id}", session_detail),
        Route("/exercises", exercises),
        Route("/exercise-pool", exercise_pool),
        Route("/program", program),
        Route("/stats/progression", stats_progression),
        Route("/stats/volume", stats_volume),
        Route("/stats/muscle-volume", stats_muscle_volume),
        Route("/prs", prs),
        Route("/body-metrics", body_metrics),
        Route("/body-metrics", create_body_metric, methods=["POST"]),
        Route("/sets", patch_set, methods=["PATCH"]),
        Route("/rotate-token", rotate_token, methods=["POST"]),
        Route("/landmarks", landmarks),
        Route("/manifest", manifest),
    ],
)
