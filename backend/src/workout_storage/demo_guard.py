"""Write limits for the public demo account (auth.py's DEMO_TOKEN).

The demo token is listed on external directories (mcp.so, Glama, ...) so reviewers and their bots
can connect without signing up. Unlike every other user's token, it is not a secret — anyone who
finds the listing can call its tools. This middleware keeps that safe: it blocks the one truly
unbounded write path outright, rate-limits the rest, and caps total accumulated rows. A nightly
cron (see reset_demo.py) resets the account to its seeded baseline regardless, so any single guard
being bypassed only matters for at most a day.

Real users never pay for this: every check below is gated on `is_demo_user.get()` first.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools.base import ToolResult
from mcp.types import CallToolRequestParams

from . import repo
from .context import current_user_id, is_demo_user
from .db import connect

# Tools that write data, keyed by name as registered in tools.py. Read-only tools (get_*, list_*)
# are never rate-limited or blocked.
_WRITE_TOOLS = frozenset(
    {
        "log_session",
        "update_session",
        "delete_session",
        "update_set",
        "log_body_metric",
        "upsert_exercise",
        "update_coach_profile",
        "upsert_goal",
        "log_coach_event",
    }
)

# import_document is a bulk multi-table insert with no size limit on any of its lists (see
# WorkoutDocument in models.py) — a single call can create an unbounded number of rows. The demo
# account has no legitimate need for bulk import, so it's blocked outright rather than capped.
_BLOCKED_ON_DEMO = frozenset({"import_document"})

# Generous enough for a human or a directory bot to poke around, tight enough that a loop can't
# run up the bill or the row count before the next hourly window.
_WRITE_RATE_LIMIT = 30
_WRITE_RATE_WINDOW = timedelta(hours=1)

# Absolute ceiling on live session rows for the demo user, independent of the rate limit above —
# bounds worst-case storage growth even if writes trickle in slowly over many windows. The nightly
# reset cron normally keeps this from ever being reached.
_MAX_DEMO_SESSIONS = 100

_DEMO_LIMIT_MESSAGE = (
    "This is the public demo account and has reached its {what} limit. Data resets nightly — "
    "try again later, or get your own free account at https://aim-journal.com/."
)


class DemoGuardMiddleware(Middleware):
    async def on_call_tool(
        self,
        context: MiddlewareContext[CallToolRequestParams],
        call_next: CallNext[CallToolRequestParams, ToolResult],
    ) -> ToolResult:
        if not is_demo_user.get():
            return await call_next(context)

        tool = context.message.name
        if tool in _BLOCKED_ON_DEMO:
            raise ValueError(
                "Bulk import is disabled on the public demo account. Log a session with "
                "log_session instead, or get your own free account at https://aim-journal.com/."
            )
        if tool in _WRITE_TOOLS:
            user_id = current_user_id.get()
            assert user_id is not None  # is_demo_user is only set once a token resolved to a user
            async with connect() as conn:
                recent = await repo.count_recent_tool_calls(
                    conn, user_id, datetime.now(UTC) - _WRITE_RATE_WINDOW
                )
                if recent >= _WRITE_RATE_LIMIT:
                    raise ValueError(_DEMO_LIMIT_MESSAGE.format(what="rate"))
                if tool == "log_session":
                    sessions = await repo.count_sessions(conn, user_id)
                    if sessions >= _MAX_DEMO_SESSIONS:
                        raise ValueError(_DEMO_LIMIT_MESSAGE.format(what="storage"))

        return await call_next(context)
