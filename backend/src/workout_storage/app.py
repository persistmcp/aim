"""Parent ASGI app — a single entrypoint that dispatches to sub-apps.

  /_cron/backup        → backup app (cron, CRON_SECRET auth, NOT token-scoped)
  /_cron/reset-demo    → demo-account reset app (cron, CRON_SECRET auth, NOT token-scoped)
  everything else      → token-resolver → FastMCP / reserved API / UI

After the token-resolver strips the leading `/{token}` segment:
  /mcp  → FastMCP streamable-HTTP app (stateless), scoped to the resolved user
  /api  → reserved stub router for the future frontend
  /     → placeholder for the future UI

External URLs: `/{token}/mcp`, `/{token}/api/...`, `/{token}`, `/_cron/backup`, `/_cron/reset-demo`.

A single entrypoint (rather than separate Vercel functions) avoids depending on Vercel rewrite
ordering: vercel.json rewrites every path here and this app owns all routing.
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.types import Receive, Scope, Send

from .api import api_app
from .auth import TokenResolverMiddleware
from .backup import BACKUP_PATH, backup_app
from .reset_demo import RESET_DEMO_PATH, reset_demo_app
from .server import mcp
from .signup import SIGNUP_PREFIX, signup_app


async def ui_root(request: Request) -> JSONResponse:
    # Placeholder until the mobile-web UI is built (see docs/FIGMA_MAKE_PROMPT.md).
    return JSONResponse({"app": "workout-storage", "ui": "coming soon"})


def _build_token_app() -> TokenResolverMiddleware:
    # FastMCP owns the /mcp route directly (as a Route, not a sub-Mount) so `/{token}/mcp` serves
    # without a trailing-slash 307 redirect. The reserved /api and the UI placeholder are added onto
    # the same app, which already carries the FastMCP session-manager lifespan.
    inner = mcp.http_app(path="/mcp", stateless_http=True, json_response=True)
    inner.router.routes.append(Mount("/api", app=api_app))
    inner.router.routes.append(Route("/", ui_root))
    return TokenResolverMiddleware(inner)


class App:
    """Dispatch the cron path to the backup app; route everything else through token resolution.

    Non-HTTP scopes (notably `lifespan`) go to the token app, which carries FastMCP's lifespan.
    """

    def __init__(self) -> None:
        self.token_app = _build_token_app()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path.rstrip("/") == BACKUP_PATH:
                return await backup_app(scope, receive, send)
            if path.rstrip("/") == RESET_DEMO_PATH:
                return await reset_demo_app(scope, receive, send)
            # Public, token-less signup — must bypass token resolution (which would 404 on "api").
            if path.startswith(SIGNUP_PREFIX):
                return await signup_app(scope, receive, send)
        return await self.token_app(scope, receive, send)


app = App()
