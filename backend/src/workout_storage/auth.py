"""Token-resolver ASGI middleware.

The leading URL path segment is the user's token. This middleware maps it to a user, sets the
`current_user_id` contextvar for the request, strips the token from the path, and forwards to the
inner router (which owns `/mcp`, `/api`, `/`). Unknown/missing token → 404.

It is also the access log: every token-scoped request gets a request id and one structured line
with method, path (token stripped — never logged), status, duration and user id. Unknown-token
requests are logged at WARNING with a masked token so scanning attempts are visible.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Iterable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import repo, telegram_alert
from .context import client_key as client_key_var
from .context import current_user_id, is_demo_user
from .db import connect
from .observability import client_key, mask_token, new_request_id, request_id

log = logging.getLogger(__name__)

# The public, non-secret token for the demo account listed on external directories (mcp.so,
# Glama, etc). Overridable via env so it can be rotated without a code change if it gets abused.
DEMO_TOKEN = os.environ.get("DEMO_TOKEN", "demo")


def _header(scope: Scope, name: str) -> str | None:
    wanted = name.encode()
    headers: Iterable[tuple[bytes, bytes]] = scope.get("headers") or []
    for key, value in headers:
        if key.lower() == wanted:
            return value.decode("latin-1")
    return None


def demo_client_key(scope: Scope) -> str | None:
    """Opaque per-caller key for a request on the SHARED demo token (see context.client_key).

    Only ever called for demo requests: a real user is already identified by their own account,
    and fingerprinting them would be data we have no use for. The raw inputs stay in this
    function — what leaves it is a salted digest.
    """
    forwarded = _header(scope, "x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else None
    if not ip:
        peer: tuple[str, int] | None = scope.get("client")
        ip = peer[0] if peer else None
    return client_key(
        # Streamable HTTP runs stateless here, so the server issues no session id; a client that
        # mints its own still sends it, and it beats any fingerprint when present.
        session_id=_header(scope, "mcp-session-id"),
        ip=ip,
        user_agent=_header(scope, "user-agent"),
    )


async def resolve_token(token: str) -> str | None:
    if not token or "\x00" in token:
        # A NUL byte can never be part of a real token (secrets.token_urlsafe output) and
        # Postgres text columns reject it outright (psycopg.DataError) — treat it as "not
        # found" instead of letting a malformed URL 500 the request.
        return None
    async with connect() as conn:
        user = await repo.get_user_by_token(conn, token)
        return str(user["id"]) if user else None


async def _send_404(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 404,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"error":"unknown token"}'})


class TokenResolverMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        rid_reset = request_id.set(new_request_id())
        started = time.monotonic()
        method = scope.get("method", "-")
        try:
            path = scope.get("path", "/")
            head, _, tail = path.lstrip("/").partition("/")
            rest = "/" + tail
            try:
                user_id = await resolve_token(head)
            except Exception as exc:
                # DB down / timeout during token resolution: without this line the request
                # dies with only a bare traceback and no structured signal.
                log.exception(
                    "token resolution failed",
                    extra={
                        "event": "request_failed",
                        "method": method,
                        "path": rest,
                        "duration_ms": int((time.monotonic() - started) * 1000),
                    },
                )
                # Every request goes through this path — if it's broken, nothing else in the app
                # can run either, so this is the single most important alert in the whole app.
                await telegram_alert.notify(
                    "token resolution (DB down?)", f"{type(exc).__name__}: {exc}"
                )
                raise
            if user_id is None:
                log.warning(
                    "unknown token",
                    extra={
                        "event": "unknown_token",
                        "method": method,
                        "path": rest,
                        "token": mask_token(head),
                        "duration_ms": int((time.monotonic() - started) * 1000),
                    },
                )
                return await _send_404(send)

            new_scope = dict(scope)
            new_scope["path"] = rest
            new_scope["raw_path"] = rest.encode()

            status_holder = {"status": 0}

            async def send_logged(message: Message) -> None:
                if message["type"] == "http.response.start":
                    status_holder["status"] = message["status"]
                await send(message)

            is_demo = head == DEMO_TOKEN
            reset = current_user_id.set(user_id)
            demo_reset = is_demo_user.set(is_demo)
            client = demo_client_key(scope) if is_demo else None
            client_reset = client_key_var.set(client)
            crashed = False
            try:
                await self.app(new_scope, receive, send_logged)
            except Exception as exc:
                # The inner app raised before/after starting the response: the client gets the
                # server's 500, but send_logged never saw a status — record it as 500, not 0.
                # This is the catch-all for /api/* and /mcp transport-level failures — anything
                # that isn't a normal MCP tool-call error, which FastMCP turns into a JSON-RPC
                # error response instead of raising here (that class is alerted from
                # observability.py's ToolCallLoggingMiddleware instead, so this doesn't double up).
                crashed = True
                await telegram_alert.notify(
                    f"{method} {rest}", f"{type(exc).__name__}: {exc}", user_id
                )
                raise
            finally:
                current_user_id.reset(reset)
                is_demo_user.reset(demo_reset)
                client_key_var.reset(client_reset)
                status = status_holder["status"] or (500 if crashed else 0)
                extra = {
                    "event": "request",
                    "method": method,
                    "path": rest,
                    "status": status,
                    "user_id": user_id,
                    "duration_ms": int((time.monotonic() - started) * 1000),
                }
                if client:
                    extra["client"] = client
                log.log(
                    logging.ERROR if crashed else logging.INFO,
                    "%s %s → %s",
                    method,
                    rest,
                    status,
                    exc_info=crashed,
                    extra=extra,
                )
        finally:
            request_id.reset(rid_reset)
