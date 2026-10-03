"""FastMCP server instance with all workout tools registered.

Importable as `mcp` for the FastMCP dev inspector and for building the ASGI app (see app.py).
"""

from __future__ import annotations

from fastmcp import FastMCP

from . import tools
from .coaching import SERVER_INSTRUCTIONS
from .demo_guard import DemoGuardMiddleware
from .observability import ToolCallLoggingMiddleware, setup_logging

setup_logging()

mcp = FastMCP(
    name="workout-storage",
    # Every behavioural instruction the server gives lives here and nowhere else; tool results
    # carry data only. See coaching.py.
    instructions=SERVER_INSTRUCTIONS,
)

tools.register(mcp)
# Order matters: ToolCallLoggingMiddleware wraps DemoGuardMiddleware, so a blocked/rate-limited
# demo call still gets logged to tool_calls (ok=False) — which the guard's own rate check counts.
mcp.add_middleware(ToolCallLoggingMiddleware())
mcp.add_middleware(DemoGuardMiddleware())
