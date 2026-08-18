"""Structured logging + MCP tool-call telemetry.

`setup_logging()` configures the root logger once to emit one JSON object per line to stdout,
which is what Vercel runtime logs display. `ToolCallLoggingMiddleware` times every MCP tool call,
logs the outcome, and best-effort inserts a row into `tool_calls` — Vercel Hobby retains runtime
logs for only an hour, so the table is the durable, SQL-queryable history.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools.base import ToolResult
from mcp.types import CallToolRequestParams

from . import analytics, repo, telegram_alert
from .context import client_key as client_key_var
from .context import current_user_id, is_demo_user
from .db import connect
from .serialize import jsonable

# Correlates the access-log line (auth.py) with tool_call lines emitted during the same request.
request_id: ContextVar[str | None] = ContextVar("request_id", default=None)

# Bound on the serialized tool arguments stored per call, so a huge log_session payload can't
# bloat the telemetry table or the log stream.
MAX_ARGS_CHARS = 2000

log = logging.getLogger("workout_storage.observability")


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def mask_token(token: str) -> str:
    """Identifiable in logs without being usable as a credential."""
    if not token:
        return "<empty>"
    if len(token) <= 8:  # a short "token" would be fully revealed by its prefix
        return f"<len {len(token)}>"
    return f"{token[:4]}…{len(token)}"


# Keyed hash for client_key(). CLIENT_KEY_SALT is the intended source; CRON_SECRET is a
# serverless-safe fallback (already set in prod, identical across instances, never leaves the
# server) so the feature is not silently dead if the env var is forgotten. The per-process random
# is the last resort for dev/tests — grouping still works within one process, and nothing depends
# on it being stable.
_PROCESS_SALT = secrets.token_hex(16)

# Enough of the digest to separate callers without inviting anyone to treat it as an identity.
_CLIENT_KEY_CHARS = 16


def _client_salt() -> str:
    return os.environ.get("CLIENT_KEY_SALT") or os.environ.get("CRON_SECRET") or _PROCESS_SALT


def _digest(value: str) -> str:
    mac = hmac.new(_client_salt().encode(), value.encode(), hashlib.sha256)
    return mac.hexdigest()[:_CLIENT_KEY_CHARS]


def client_key(
    *, session_id: str | None = None, ip: str | None = None, user_agent: str | None = None
) -> str | None:
    """An opaque key that separates two callers sharing one token, without identifying either.

    Preference order matches how much the value actually means: an MCP session id names one
    client's connection outright, so it is used when present (the server runs stateless_http, so
    only clients that mint their own send one). Otherwise a coarse IP+user-agent fingerprint —
    good enough to tell "one person all week" from "five different assistants", and blunt enough
    that it collapses everyone behind one NAT into one key.

    The inputs are ALWAYS hashed under a server-side salt: `tool_calls` must never hold a raw IP
    or user agent, and an unsalted hash of an IP is trivially reversible by enumeration.
    Returns None when there is nothing to go on (in-process calls, tests, cron).
    """
    if session_id:
        return f"s:{_digest(session_id)}"
    if not ip and not user_agent:
        return None
    fingerprint = f"{ip or '-'}|{user_agent or '-'}"
    return f"f:{_digest(fingerprint)}"


class JsonFormatter(logging.Formatter):
    """One JSON object per line; anything passed via `extra=` is inlined as top-level keys."""

    # Attribute names present on every LogRecord — whatever else appears came from `extra=`.
    _STANDARD = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
        "taskName",
        "message",
        "asctime",
    }

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = request_id.get()
        if rid:
            out["request_id"] = rid
        for key, value in record.__dict__.items():
            if key not in self._STANDARD:
                out[key] = value
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False, default=str)


def setup_logging() -> None:
    """Idempotent: attach one JSON stdout handler to the root logger."""
    root = logging.getLogger()
    if any(isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())


def truncate_args(arguments: dict[str, Any] | None) -> dict[str, Any] | None:
    """Keep args (JSON-safe) when small; otherwise store a bounded prefix of their JSON."""
    if arguments is None:
        return None
    safe = jsonable(arguments)  # MCP args are JSON-decoded already; jsonable guards stray types
    serialized = json.dumps(safe, ensure_ascii=False)
    if len(serialized) <= MAX_ARGS_CHARS:
        return safe
    return {"_truncated": serialized[:MAX_ARGS_CHARS]}


class ToolCallLoggingMiddleware(Middleware):
    """Log every MCP tool call (tool, user, duration, outcome) and persist it to `tool_calls`.

    Persistence is best-effort: a telemetry failure is logged but never fails the tool call.
    """

    async def on_call_tool(
        self,
        context: MiddlewareContext[CallToolRequestParams],
        call_next: CallNext[CallToolRequestParams, ToolResult],
    ) -> ToolResult:
        tool = context.message.name
        user_id = current_user_id.get()
        client = client_key_var.get()  # demo requests only; None for everyone else
        started = time.monotonic()
        error: str | None = None
        try:
            return await call_next(context)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            await analytics.capture_exception(exc, user_id)
            raise
        finally:
            duration_ms = int((time.monotonic() - started) * 1000)
            log.log(
                logging.ERROR if error else logging.INFO,
                "tool_call %s",
                tool,
                extra={
                    "event": "tool_call",
                    "tool": tool,
                    "user_id": user_id,
                    "client": client,
                    "duration_ms": duration_ms,
                    "ok": error is None,
                    "error": error,
                },
            )
            props: dict[str, Any] = {
                "tool": tool,
                "ok": error is None,
                "duration_ms": duration_ms,
                "error": error,
            }
            # Everyone on the demo token shares one distinct_id, so PostHog cannot split them
            # either — carry the same key there.
            if client:
                props["client"] = client
            # DB insert, PostHog capture and (on failure) the Telegram alert are independent —
            # overlap them.
            tasks = [
                self._persist(user_id, tool, context.message.arguments, error, duration_ms, client),
                analytics.capture(user_id, "mcp_tool_call", props),
            ]
            # The public demo account's guard rails (demo_guard.py) raise on purpose — that's
            # working as intended, not the server being broken, so it shouldn't page anyone.
            if error and not is_demo_user.get():
                tasks.append(telegram_alert.notify(tool, error, user_id))
            await asyncio.gather(*tasks)

    async def _persist(
        self,
        user_id: str | None,
        tool: str,
        arguments: dict[str, Any] | None,
        error: str | None,
        duration_ms: int,
        client: str | None = None,
    ) -> None:
        try:
            async with connect() as conn:
                await repo.insert_tool_call(
                    conn,
                    user_id=user_id,
                    tool=tool,
                    args=truncate_args(arguments),
                    ok=error is None,
                    error=error,
                    duration_ms=duration_ms,
                    client_key=client,
                )
        except Exception:
            log.exception("tool_call persist failed", extra={"event": "tool_call_persist_error"})
