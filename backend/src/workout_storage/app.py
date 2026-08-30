"""Parent ASGI app — a single entrypoint that dispatches to sub-apps.

  /_cron/backup        → backup app (cron, CRON_SECRET auth, NOT token-scoped)
  /_cron/reset-demo    → demo-account reset app (cron, CRON_SECRET auth, NOT token-scoped)
  /mcp, /oauth/*,      → OAuth 2.1 (Supabase-issued tokens, NOT token-scoped) — see oauth.py
  /.well-known/oauth-*
  everything else      → token-resolver → FastMCP / reserved API / UI

After the token-resolver strips the leading `/{token}` segment:
  /mcp  → FastMCP streamable-HTTP app (stateless), scoped to the resolved user
  /api  → reserved stub router for the future frontend
  /     → placeholder for the future UI

External URLs: `/{token}/mcp`, `/{token}/api/...`, `/{token}`, `/_cron/backup`, `/_cron/reset-demo`,
and the OAuth set: `/mcp`, `/oauth/consent`, `/.well-known/oauth-*`.

A single entrypoint (rather than separate Vercel functions) avoids depending on Vercel rewrite
ordering: vercel.json rewrites every path here and this app owns all routing.
"""

from __future__ import annotations

from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.types import Receive, Scope, Send

from . import oauth
from .api import api_app
from .auth import TokenResolverMiddleware
from .backup import BACKUP_PATH, backup_app
from .reset_demo import RESET_DEMO_PATH, reset_demo_app
from .server import mcp
from .signup import SIGNUP_PREFIX, signup_app


async def ui_root(request: Request) -> JSONResponse:
    # Placeholder until the mobile-web UI is built (see docs/FIGMA_MAKE_PROMPT.md).
    return JSONResponse({"app": "workout-storage", "ui": "coming soon"})


def _build_inner_app() -> Any:
    # FastMCP owns the /mcp route directly (as a Route, not a sub-Mount) so `/{token}/mcp` serves
    # without a trailing-slash 307 redirect. The reserved /api and the UI placeholder are added onto
    # the same app, which already carries the FastMCP session-manager lifespan.
    inner = mcp.http_app(path="/mcp", stateless_http=True, json_response=True)
    inner.router.routes.append(Mount("/api", app=api_app))
    # Token-scoped, so auth.py resolves the token before this runs: reaching it at all is the
    # proof of identity that the OAuth consent screen otherwise has no way to obtain in a browser
    # that has never opened the app. See oauth.resume.
    inner.router.routes.append(Route(oauth.RESUME_PATH, oauth.resume))
    inner.router.routes.append(Route("/", ui_root))
    return inner


class App:
    """Dispatch the cron path to the backup app; route everything else through token resolution.

    Non-HTTP scopes (notably `lifespan`) go to the token app, which carries FastMCP's lifespan.
    The OAuth app shares that same inner app (see oauth.build_oauth_app), so there is still exactly
    one FastMCP session manager and one lifespan no matter which door a request comes in through.
    """

    def __init__(self) -> None:
        inner = _build_inner_app()
        self.token_app = TokenResolverMiddleware(inner)
        # Absent when Supabase credentials are not configured (local dev, tests): the token routes
        # keep working and `/mcp` simply stays unrouted rather than answering half-configured.
        self.oauth_app = oauth.build_oauth_app(inner) if oauth.enabled() else None

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
            # OAuth: token-less by definition, so it must short-circuit ahead of the resolver too,
            # which would otherwise read "mcp" or ".well-known" as somebody's token and 404.
            if self.oauth_app is not None and oauth.oauth_paths(path):
                if path.startswith(oauth.CONSENT_PATH):
                    return await oauth.consent_app(scope, receive, send)
                return await self.oauth_app(scope, receive, send)
        return await self.token_app(scope, receive, send)


app = App()
