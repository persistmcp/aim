"""FastMCP server instance with all workout tools registered.

Importable as `mcp` for the FastMCP dev inspector and for building the ASGI app (see app.py).
"""

from __future__ import annotations

from fastmcp import FastMCP

from . import tools
from .demo_guard import DemoGuardMiddleware
from .observability import ToolCallLoggingMiddleware, setup_logging

setup_logging()

mcp = FastMCP(
    name="workout-storage",
    instructions=(
        "Personal workout storage and coaching. Use these tools to log training sessions, fix "
        "individual set metrics, read sessions back, manage the exercise catalog, record body "
        "measurements, and compute progression / volume statistics. This server also provides "
        "coaching: at the start of any training-related conversation call get_coaching_context "
        "with the matching task (planning a workout → next_workout, building a program → "
        "new_program, reviewing the week → weekly_review) and follow the prompt it returns. If "
        "the user is new (intake incomplete) it returns the intake conversation — run it. "
        "Never design a program or workout from generic knowledge alone: the coaching context "
        "carries this user's goal, experience, equipment, injuries and logged weights — without "
        "it your plan will be wrong for them. Persist every durable fact the user confirms "
        "immediately via update_coach_profile / upsert_goal; pass one-off circumstances via "
        "the constraints argument instead. When the user states their current body weight, "
        "also record it via log_body_metric (dated today) — the app's weight tile and charts "
        "read measurements, not the profile field."
    ),
)

tools.register(mcp)
# Order matters: ToolCallLoggingMiddleware wraps DemoGuardMiddleware, so a blocked/rate-limited
# demo call still gets logged to tool_calls (ok=False) — which the guard's own rate check counts.
mcp.add_middleware(ToolCallLoggingMiddleware())
mcp.add_middleware(DemoGuardMiddleware())
