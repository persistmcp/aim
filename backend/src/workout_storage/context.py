"""Per-request user context.

The token-resolver middleware (auth.py) sets ``current_user_id`` after mapping the URL token to a
user. Tools and services read it so every operation is scoped to that user.
"""

from __future__ import annotations

from contextvars import ContextVar

current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

# Set by auth.py when the URL token matches DEMO_TOKEN. Read by demo_guard.py to apply write
# limits without every tool/service function needing to know about the demo account.
is_demo_user: ContextVar[bool] = ContextVar("is_demo_user", default=False)

# An opaque, salted per-caller key — set by auth.py for DEMO requests only, read by
# observability.py when writing `tool_calls`. Every real user already has their own user_id; the
# public demo token is shared by everyone who ever pastes it into an assistant, so without this
# its telemetry is one undifferentiated blob (193 calls over 11 days: one prospect, or ten, or
# our own QA?). Never a raw IP or user agent — see observability.client_key.
client_key: ContextVar[str | None] = ContextVar("client_key", default=None)


def get_user_id() -> str:
    uid = current_user_id.get()
    if uid is None:
        raise RuntimeError("No user in context (token not resolved)")
    return uid
