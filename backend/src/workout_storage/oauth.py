"""OAuth 2.1 access to the MCP server, with Supabase Auth as the authorization server.

Why this exists: Anthropic's Software Directory Policy §5.D requires remote MCP servers that need
authentication to use OAuth 2.0, which gates both the Plugin and the Connectors directories. AIm's
own credential is the token in the URL path (auth.py), which is not OAuth by any reading.

Why Supabase and not our own authorization server: the project's OAuth 2.1 server does the whole
protocol — discovery, PKCE, dynamic client registration, authorization codes, access and refresh
tokens, JWKS — so none of that is stored or signed here. It costs nothing on our plan. The one
piece Supabase deliberately does not host is the consent screen: it redirects the user to the path
configured as `oauth_server_authorization_path`, which is the page in this module.

Why the path token survives: `/{token}/mcp`, `/{token}/api/*` and the PWA are untouched, so no live
user has to reconnect and nothing about the app changes. OAuth lands on a *new*, token-less
`/mcp`, which is the only endpoint the directories are pointed at. See docs/OAUTH_DESIGN.md §2 for
why that trade was made deliberately, including its downside.

Identity: OAuth tokens name the user by `sub`, an `auth.users` id. Our rows are keyed on
`users.id`. The two are joined lazily, on first authorization, through `users.supabase_user_id`.
"""

from __future__ import annotations

import logging
import os
import re
import urllib.parse
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from . import email as email_service
from . import repo, telegram_alert
from .auth import DEMO_TOKEN
from .context import current_user_id, is_demo_user
from .db import connect

log = logging.getLogger(__name__)

CONSENT_PATH = "/oauth/consent"
RESUME_PATH = "/oauth/resume"
MCP_PATH = "/mcp"

# Carries the AIm token from the emailed resume link to the consent screen, for the case the page
# cannot solve on its own: the connector is being added in a browser that has never opened the app,
# so there is nothing in localStorage to identify anybody. Short-lived because it only has to
# survive one redirect, HttpOnly because the page has no reason to read it — the server does.
_RESUME_COOKIE = "aim_connect"
_RESUME_COOKIE_TTL = 1800

_TIMEOUT = 15
# Shares signup.py's per-IP hourly window: both send mail to an address supplied by whoever is
# asking, so they are the same abuse surface and may as well share the same budget.
_RESUME_RATE_LIMIT = 5


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    return value.strip().rstrip("/") if value else None


def supabase_url() -> str | None:
    return _env("SUPABASE_URL")


def public_base_url() -> str:
    return _env("PUBLIC_BASE_URL") or "https://aim-journal.com"


def enabled() -> bool:
    """OAuth is opt-in per environment: without Supabase credentials the app behaves exactly as it
    did before this module existed, and `/mcp` stays unmounted rather than half-working."""
    return bool(supabase_url() and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def build_provider() -> Any:
    """The FastMCP auth provider that verifies Supabase-issued access tokens.

    Imported lazily: fastmcp's auth package pulls in authlib and joserfc, and every code path that
    does not serve `/mcp` (the cron jobs, signup, the read API) has no reason to pay for that.
    """
    from fastmcp.server.auth.providers.supabase import SupabaseProvider

    project_url = supabase_url()
    if project_url is None:
        raise RuntimeError("SUPABASE_URL is not set")
    return SupabaseProvider(
        project_url=project_url,
        base_url=public_base_url(),
        # Must match the project's JWT algorithm. Verified against a real token from this project:
        # header alg ES256, kid a400aa3c…, aud "authenticated", iss <project>/auth/v1.
        algorithm="ES256",
    )


# --- talking to Supabase Auth ------------------------------------------------


def _auth_base() -> str:
    return f"{supabase_url()}/auth/v1"


def _service_headers() -> dict[str, str]:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY", "")


async def mint_supabase_session(email: str) -> str | None:
    """Return a Supabase access token for `email`, creating the auth user on first use.

    The consent endpoints below are user-scoped: they need a token whose `sub` is the person
    approving, and a service key will not do (gotrue rejects it with "missing sub claim"). Supabase
    has no admin call that hands out a user session, so we take the long way round: ask for a magic
    link, then follow it ourselves instead of mailing it. The redirect carries the session in its
    URL fragment.

    CALLER CONTRACT, and the reason this function is not dangerous: it will mint a session for
    *any* address handed to it. It must only ever be called with the email of a user who has
    already proved themselves to us — in practice the owner of a resolved AIm token. Passing an
    address that came from the request body would let anyone log in as anyone.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False) as client:
            created = await client.post(
                f"{_auth_base()}/admin/generate_link",
                headers=_service_headers(),
                json={"type": "magiclink", "email": email},
            )
            created.raise_for_status()
            link = created.json().get("action_link")
            if not link:
                return None
            # 303 back to the site root with `#access_token=…`; we want the fragment, not the page.
            followed = await client.get(link, headers={"apikey": _anon_key()})
            location = followed.headers.get("location", "")
    except Exception as exc:  # noqa: BLE001 - a broken bridge must not 500 the consent screen
        log.exception("supabase session bridge failed", extra={"event": "oauth_bridge_failed"})
        await telegram_alert.notify("oauth session bridge", f"{type(exc).__name__}: {exc}")
        return None

    fragment = urllib.parse.urlparse(location).fragment
    tokens = urllib.parse.parse_qs(fragment).get("access_token") or []
    if not tokens:
        log.warning("supabase bridge returned no session", extra={"event": "oauth_bridge_empty"})
        return None
    return str(tokens[0])


async def _user_request(
    method: str, path: str, access_token: str, payload: dict[str, Any] | None = None
) -> tuple[int, dict[str, Any]]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.request(
            method,
            f"{_auth_base()}{path}",
            headers={"apikey": _anon_key(), "Authorization": f"Bearer {access_token}"},
            json=payload,
        )
    try:
        body = resp.json()
    except ValueError:
        body = {}
    return resp.status_code, body if isinstance(body, dict) else {}


async def authorization_details(access_token: str, authorization_id: str) -> dict[str, Any]:
    """What the client is asking for, for display on the consent screen.

    Two shapes come back, and both are normal. A first-time authorization returns the client, the
    user and the scope. One the user has already approved for this client returns a `redirect_url`
    outright — Supabase's "already consented" fast path — and there is nothing to ask about.
    """
    status, body = await _user_request(
        "GET", f"/oauth/authorizations/{authorization_id}", access_token
    )
    if status != 200:
        return {"error": body.get("error_code") or "unavailable"}
    return body


async def decide(access_token: str, authorization_id: str, approve: bool) -> dict[str, Any]:
    """Approve or deny, and return the URL to send the browser to.

    The GET is not redundant. Posting a decision on an authorization this session has not fetched
    is answered with `oauth_authorization_not_found` — verified against the live project — so
    gotrue evidently binds the pending authorization on read. Doing it here keeps this endpoint
    self-sufficient rather than silently depending on the consent page having called
    `/details` first with a *different* minted session.
    """
    lookup = await authorization_details(access_token, authorization_id)
    if lookup.get("error"):
        return lookup
    if lookup.get("redirect_url"):
        # Already consented for this client: gotrue resolved it on read and there is nothing left
        # to decide. Deny cannot retract a grant that was made earlier, so say so rather than
        # pretending the click did something.
        return lookup if approve else {"error": "already_authorized"}

    status, body = await _user_request(
        "POST",
        f"/oauth/authorizations/{authorization_id}/consent",
        access_token,
        {"action": "approve" if approve else "deny"},
    )
    if status != 200:
        return {"error": body.get("error_code") or "unavailable"}
    return body


# --- mapping a Supabase identity onto an AIm account -------------------------


class ResolvedUser(NamedTuple):
    """Who a verified OAuth token belongs to, and whether that is the shared demo account.

    `is_demo` travels with the id on purpose. demo_guard's write limits key off the `is_demo_user`
    contextvar, and if only auth.py's path-token middleware ever set it, an OAuth caller on the
    demo account would bypass the rate limit, the storage cap and the import block — on the one
    account whose credential is public.
    """

    user_id: str
    is_demo: bool


async def resolve_oauth_user_id(claims: dict[str, Any]) -> ResolvedUser | None:
    """Map a verified access token's claims to a user, linking the account on first use.

    `sub` is authoritative and is tried first. Falling back to the email is what links an account
    that predates OAuth — and it is only sound because Supabase verified that address before
    issuing the token. An unverified email would let anyone claim any account by signing up with
    the right address, so the claim is checked explicitly rather than assumed.
    """
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        return None
    try:
        # `supabase_user_id` is a uuid column, and gotrue always issues uuid subjects. A token
        # carrying anything else would make psycopg raise InvalidTextRepresentation and turn a
        # request that should be a clean refusal into a 500 — the same failure mode auth.py
        # already guards against for NUL bytes in the path token.
        uuid.UUID(subject)
    except ValueError:
        log.warning("oauth token with a non-uuid subject", extra={"event": "oauth_bad_subject"})
        return None

    async with connect() as conn:
        user = await repo.get_user_by_supabase_id(conn, subject)
        if user:
            return ResolvedUser(str(user["id"]), user.get("token") == DEMO_TOKEN)

        email = claims.get("email")
        if not email or claims.get("email_verified") is False:
            return None
        user = await repo.get_user_by_email(conn, email)
        if user is None:
            # No AIm account for this address. Creating one here would let the OAuth flow double as
            # signup, which is tempting and is deliberately not done yet: signup.py owns account
            # creation (rate limits, analytics, the welcome mail) and duplicating it here would
            # fork that logic. Until it is refactored, an unknown address is refused.
            log.info("oauth login for unknown email", extra={"event": "oauth_unknown_user"})
            return None

        if not await repo.link_supabase_user(conn, str(user["id"]), subject):
            # Already bound to a different Supabase identity — see repo.link_supabase_user.
            log.warning("oauth identity conflict", extra={"event": "oauth_link_conflict"})
            return None
        await repo.mark_email_verified(conn, str(user["id"]))
        log.info("linked supabase identity", extra={"event": "oauth_linked"})
        return ResolvedUser(str(user["id"]), user.get("token") == DEMO_TOKEN)


class OAuthUserMiddleware:
    """Set `current_user_id` from a verified OAuth token, the way auth.py sets it from a path token.

    Everything downstream — repo.py, all 20 tools — reads that one contextvar and stays unaware of
    which of the two credentials the caller used. This is the entire integration point.

    Runs behind RequireAuthMiddleware, so `scope["user"]` is present and its token already
    signature-checked. Note the claims are read directly: fastmcp's JWTVerifier populates `claims`
    but leaves AccessToken.subject unset, so reading `.subject` here would silently yield None.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        user = scope.get("user")
        claims = getattr(getattr(user, "access_token", None), "claims", None) or {}
        resolved = await resolve_oauth_user_id(claims)
        if resolved is None:
            # The token is valid but names nobody we know. 403, not 401: re-authorizing would
            # produce the same token and the same answer, so telling the client to retry is a loop.
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            return await send(
                {"type": "http.response.body", "body": b'{"error":"no AIm account for this login"}'}
            )

        reset = current_user_id.set(resolved.user_id)
        demo_reset = is_demo_user.set(resolved.is_demo)
        try:
            await self.app(scope, receive, send)
        finally:
            current_user_id.reset(reset)
            is_demo_user.reset(demo_reset)


# --- the consent screen ------------------------------------------------------

_PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Connect to AIm</title>
<style>
 :root{color-scheme:light dark}
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e8eaed;
      font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 .card{width:min(420px,calc(100vw - 32px));background:#171a21;border:1px solid #262b36;
       border-radius:14px;padding:28px}
 h1{margin:0 0 4px;font-size:20px}
 p{margin:8px 0;color:#a8b0bd}
 .who{margin:16px 0;padding:12px 14px;background:#0f1115;border-radius:10px;font-size:14px}
 .row{display:flex;gap:10px;margin-top:20px}
 button{flex:1;padding:11px 16px;border-radius:10px;border:1px solid #2c3340;font:inherit;
        font-size:15px;cursor:pointer;background:#1e232c;color:#e8eaed}
 button.primary{background:#3d7dff;border-color:#3d7dff;color:#fff;font-weight:600}
 button[disabled]{opacity:.5;cursor:default}
 input{width:100%;box-sizing:border-box;margin-top:14px;padding:11px 13px;border-radius:10px;
        border:1px solid #2c3340;background:#0f1115;color:#e8eaed;font:inherit;font-size:15px}
 .err{color:#ff8a8a;font-size:14px;margin-top:12px}
 a{color:#8ab4ff}
 /* .row and .who set display, which outranks the `hidden` attribute's UA style. Without this the
    Allow/Cancel buttons show on the sign-in-first screen, where nothing is wired to them. */
 [hidden]{display:none!important}
</style></head><body>
<div class="card">
  <h1>Connect to AIm</h1>
  <p id="lead">Checking your session…</p>
  <div class="who" id="who" hidden></div>
  <div class="row" id="actions" hidden>
    <button id="deny">Cancel</button>
    <button id="allow" class="primary">Allow</button>
  </div>
  <div id="signin" hidden>
    <input id="email" type="email" inputmode="email" autocomplete="email"
           placeholder="you@example.com" />
    <div class="row">
      <button id="send" class="primary">Email me a link</button>
    </div>
  </div>
  <div class="err" id="err" hidden></div>
</div>
<script>
 var AID = new URLSearchParams(location.search).get("authorization_id");
 var $ = function(id){ return document.getElementById(id) };
 // The token the app stores when it is opened in this browser. Usually present, because the
 // email's one button lands people in the app first. When it is not — the connector is being
 // added on a different device — the server falls back to the cookie the resume link sets, and
 // failing that we mail the link. Never a dead end.
 var token = null;
 try { token = localStorage.getItem("ws_token") } catch (e) {}
 function fail(msg, hint){
   $("lead").textContent = msg;
   if (hint) { $("err").hidden = false; $("err").innerHTML = hint }
 }
 function post(path, body){
   return fetch(path, {method:"POST", headers:{"content-type":"application/json"},
                       body: JSON.stringify(body)}).then(function(r){ return r.json() });
 }
 function askForEmail(){
   $("lead").textContent = "Sign in to finish connecting.";
   $("err").hidden = true;
   $("signin").hidden = false;
   $("email").focus();
   $("send").onclick = function(){
     var value = $("email").value.trim();
     if (!value) { $("email").focus(); return }
     $("send").disabled = true;
     post("/oauth/consent/resume", {authorization_id: AID, email: value}).then(function(){
       $("signin").hidden = true;
       $("lead").textContent = "Check your email.";
       $("who").hidden = false;
       $("who").textContent = "We sent a link to " + value +
         ". Open it on this device to finish connecting.";
     }).catch(function(){ $("send").disabled = false; fail("Could not reach AIm."); });
   };
 }
 if (!AID) { fail("This link is missing its authorization id."); }
 else {
   post("/oauth/consent/details", {authorization_id: AID, token: token}).then(function(d){
     if (d.redirect_url) { location.href = d.redirect_url; return }
     if (d.need_signin) { askForEmail(); return }
     if (d.no_email) {
       $("lead").textContent = "This account cannot use the new connection yet.";
       $("who").hidden = false;
       $("who").textContent = "It was created before email sign-in. Connect with your personal " +
         "address instead: " + d.fallback_url;
       return;
     }
     if (d.error) { fail("Could not load this request.", d.error); return }
     $("lead").textContent = d.client_name
       ? d.client_name + " wants to access your training log."
       : "An application wants to access your training log.";
     $("who").hidden = false;
     $("who").textContent = "Account: " + (d.email || "your AIm account");
     $("actions").hidden = false;
     function decide(approve){
       $("allow").disabled = $("deny").disabled = true;
       post("/oauth/consent/decide",
            {authorization_id: AID, token: token, approve: approve}).then(function(r){
         if (r.redirect_url) { location.href = r.redirect_url }
         else { fail("That did not go through.", r.error || "Please try again."); }
       });
     }
     $("allow").onclick = function(){ decide(true) };
     $("deny").onclick = function(){ decide(false) };
   }).catch(function(){ fail("Could not reach AIm.") });
 }
</script>
</body></html>
"""


async def consent_page(request: Request) -> HTMLResponse:
    # Served from the backend rather than the SPA so the OAuth flow does not depend on the web
    # build, its router or its service worker — see docs/OAUTH_DESIGN.md §5.
    return HTMLResponse(_PAGE, headers={"X-Robots-Tag": "noindex, nofollow"})


class _Session(NamedTuple):
    """A Supabase session for a caller we have already identified, plus their address."""

    access_token: str
    email: str
    authorization_id: str


async def _session_for_request(
    body: dict[str, Any], cookie: str | None = None
) -> _Session | JSONResponse:
    """Resolve the caller's AIm token, then bridge it to a Supabase session.

    Returns either the session or the response to send instead. The AIm token is checked *first*
    and the email is taken from the row it resolves to — never from the request body — which is
    what keeps mint_supabase_session's caller contract (see its docstring).
    """
    authorization_id = body.get("authorization_id")
    if not isinstance(authorization_id, str):
        return JSONResponse({"error": "bad request"}, status_code=400)

    # localStorage first (the app was opened in this browser), then the cookie the resume link
    # sets. Neither is a weaker proof than the other: both are the same token, and the token is
    # what identifies a user everywhere else in this app.
    token = body.get("token")
    if not isinstance(token, str) or not token:
        token = cookie
    if not token:
        # Not an error — the page turns this into "we will email you a link" rather than a wall.
        return JSONResponse({"need_signin": True})

    async with connect() as conn:
        user = await repo.get_user_by_token(conn, token)
    if user is None:
        return JSONResponse({"error": "unknown token"}, status_code=404)
    email = user.get("email")
    if not email:
        # Accounts made from the CLI before self-service signup have no address, and Supabase has
        # nobody to issue a session to without one. This surfaced as a red "this account has no
        # email address" with nowhere to go, on the owner's own account of all places. Hand back
        # the personal address instead: it still works, and it is the only thing this account can
        # actually connect with.
        log.info("consent on an account with no email", extra={"event": "oauth_no_email"})
        return JSONResponse({"no_email": True, "fallback_url": f"{public_base_url()}/{token}/mcp"})

    access_token = await mint_supabase_session(str(email))
    if not access_token:
        return JSONResponse({"error": "sign-in unavailable"}, status_code=502)
    return _Session(access_token, str(email), authorization_id)


async def consent_details(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed body → bad request
        return JSONResponse({"error": "invalid body"}, status_code=400)

    session = await _session_for_request(body, request.cookies.get(_RESUME_COOKIE))
    if isinstance(session, JSONResponse):
        return session

    details = await authorization_details(session.access_token, session.authorization_id)
    if details.get("redirect_url"):
        return JSONResponse({"redirect_url": details["redirect_url"]})
    if details.get("error"):
        return JSONResponse({"error": details["error"]}, status_code=400)
    client_name = (details.get("client") or {}).get("name")
    return JSONResponse({"client_name": client_name, "email": session.email})


async def consent_decide(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed body → bad request
        return JSONResponse({"error": "invalid body"}, status_code=400)

    session = await _session_for_request(body, request.cookies.get(_RESUME_COOKIE))
    if isinstance(session, JSONResponse):
        return session

    approve = bool(body.get("approve"))
    result = await decide(session.access_token, session.authorization_id, approve)
    if result.get("error"):
        return JSONResponse({"error": result["error"]}, status_code=400)
    log.info(
        "oauth consent decided",
        extra={"event": "oauth_consent", "approved": approve},
    )
    return JSONResponse({"redirect_url": result.get("redirect_url")})


_AUTHORIZATION_ID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
# Mirrors signup.py's check. Duplicated rather than imported: the two endpoints are independent
# entry points and coupling them buys nothing but an import cycle waiting to happen.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _preferred_lang(header: str | None) -> str:
    """Pick a language for the resume email from the browser.

    Signup takes it from the landing page the person was reading; here there is no such signal, so
    the browser's own preference is the best one available. Falling back to English silently would
    mean a Russian user who is mid-connect suddenly gets an English email.
    """
    for part in (header or "").split(","):
        code = part.split(";")[0].strip().lower().split("-")[0]
        if code in email_service.STRINGS:
            return code
    return email_service.DEFAULT_LANG


async def consent_resume(request: Request) -> JSONResponse:
    """Mail the user their own magic link, pointed back at the authorization they started.

    This is the answer to "I am adding the connector on my laptop but the app is on my phone".
    Nothing new is issued: it is the same token, the same email and the same five translations
    signup already sends, with the button aimed at RESUME_PATH instead of the app's front door.

    The response never says whether the address is registered — same rule as signup.py, for the
    same reason. Rate-limited per IP through the signup throttle, because an endpoint that sends
    mail on request is an endpoint someone will point at a stranger.
    """
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - malformed body → bad request
        return JSONResponse({"error": "invalid body"}, status_code=400)

    email = repo.normalize_email(body.get("email") if isinstance(body, dict) else None)
    authorization_id = body.get("authorization_id") if isinstance(body, dict) else None
    if not email or not _EMAIL_RE.match(email) or not isinstance(authorization_id, str):
        return JSONResponse({"error": "valid email required"}, status_code=400)
    if not _AUTHORIZATION_ID.match(authorization_id):
        # It ends up inside a URL in an email; anything unexpected stops here.
        return JSONResponse({"error": "bad request"}, status_code=400)

    ip = request.headers.get("x-real-ip") or "unknown"
    since = datetime.now(UTC) - timedelta(hours=1)
    try:
        async with connect() as conn:
            if await repo.count_recent_signups(conn, ip, since) >= _RESUME_RATE_LIMIT:
                return JSONResponse({"ok": True})
            await repo.record_signup_event(conn, ip)
            user = await repo.get_user_by_email(conn, email)
    except Exception as exc:  # noqa: BLE001 - never surface storage state to an unauthenticated caller
        log.exception("consent resume failed", extra={"event": "oauth_resume_failed"})
        await telegram_alert.notify("oauth resume", f"{type(exc).__name__}: {exc}")
        return JSONResponse({"ok": True})

    if user and user.get("token"):
        await email_service.send_magic_link(
            email,
            str(user["token"]),
            lang=_preferred_lang(request.headers.get("accept-language")),
            connect_path=f"{RESUME_PATH}?authorization_id={authorization_id}",
        )
        log.info("consent resume mailed", extra={"event": "oauth_resume_sent"})
    else:
        log.info("consent resume for unknown email", extra={"event": "oauth_resume_unknown"})
    return JSONResponse({"ok": True})


async def resume(request: Request) -> Response:
    """Land the emailed resume link back on the consent screen, now identified.

    Mounted *inside* the token-scoped app, so auth.py has already resolved and stripped the token
    by the time this runs — arriving here at all is the proof of identity. All this does is put
    that token somewhere the consent page's server side can read it, and send the browser on.
    """
    user_id = current_user_id.get()
    authorization_id = request.query_params.get("authorization_id", "")
    if user_id is None or not _AUTHORIZATION_ID.match(authorization_id):
        return RedirectResponse(CONSENT_PATH, status_code=303)

    async with connect() as conn:
        user = await repo.get_user(conn, user_id)
    response = RedirectResponse(
        f"{CONSENT_PATH}?authorization_id={authorization_id}", status_code=303
    )
    if user and user.get("token"):
        response.set_cookie(
            _RESUME_COOKIE,
            str(user["token"]),
            max_age=_RESUME_COOKIE_TTL,
            httponly=True,
            secure=True,
            samesite="lax",
            path=CONSENT_PATH,
        )
    return response


consent_app = Starlette(
    routes=[
        Route(CONSENT_PATH, consent_page),
        Route(f"{CONSENT_PATH}/details", consent_details, methods=["POST"]),
        Route(f"{CONSENT_PATH}/decide", consent_decide, methods=["POST"]),
        Route(f"{CONSENT_PATH}/resume", consent_resume, methods=["POST"]),
    ]
)


# --- the OAuth-protected MCP endpoint ----------------------------------------


def build_oauth_app(inner: ASGIApp) -> ASGIApp:
    """Wrap the existing MCP app so `/mcp` requires a Supabase-issued token.

    Deliberately reuses `inner` — the same Starlette app the path-token route serves — instead of
    building a second one with `create_streamable_http_app`. A second app would create a second
    StreamableHTTPSessionManager with its own lifespan, and app.py only ever runs one. One MCP
    app, one lifespan, two ways in.
    """
    from mcp.server.auth.middleware.bearer_auth import RequireAuthMiddleware
    from mcp.server.auth.routes import build_resource_metadata_url
    from starlette.applications import Starlette as _Starlette
    from starlette.routing import Route as _Route

    provider = build_provider()

    # get_routes computes the resource URL as a side effect, so it has to run before the metadata
    # URL is built. It returns the RFC 9728 protected-resource document (the spec's one hard
    # server-side MUST) plus the authorization-server metadata Supabase forwards.
    routes = list(provider.get_routes(mcp_path=MCP_PATH))
    resource_url = provider._get_resource_url(MCP_PATH)
    metadata_url = build_resource_metadata_url(resource_url) if resource_url else None

    routes.append(
        _Route(
            MCP_PATH,
            endpoint=RequireAuthMiddleware(
                OAuthUserMiddleware(inner), provider.required_scopes, metadata_url
            ),
            # Stateless transport: no GET stream to keep open, matching how the path-token route
            # is mounted in app.py.
            methods=["POST", "DELETE"],
        )
    )
    return _Starlette(routes=routes, middleware=provider.get_middleware())


def oauth_paths(path: str) -> bool:
    """Paths app.py must route here instead of through token resolution."""
    return (
        path == MCP_PATH
        or path.startswith(f"{CONSENT_PATH}")
        or path.startswith("/.well-known/oauth-")
    )


__all__ = [
    "CONSENT_PATH",
    "RESUME_PATH",
    "resume",
    "MCP_PATH",
    "build_oauth_app",
    "consent_app",
    "enabled",
    "oauth_paths",
    "resolve_oauth_user_id",
]
