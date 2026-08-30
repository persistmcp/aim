"""Inbound email → forward to the owner.

Resend Receiving delivers mail for aim-journal.com (MX → Amazon SES → Resend) and POSTs an
`email.received` webhook here (`/api/public/inbound-email`, registered on the public app in
signup.py). The webhook carries metadata only — no html/text — so the body is fetched from
`GET /emails/receiving/{email_id}` with RESEND_ADMIN_API_KEY (the send-only RESEND_API_KEY
gets a 401 on read endpoints). We verify the svix signature and forward the message to
CONTACT_FORWARD_TO through the normal Resend send API, with reply_to set to the original
sender so a plain "Reply" in the owner's inbox answers the right person. Attachments are not
forwarded (logged only).

Returning non-2xx makes Resend/svix retry with backoff — so a transient forward failure is
answered with 500 (retry), while a bad signature is 401 (drop).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html as html_mod
import json
import logging
import os
import time
from collections.abc import Mapping
from datetime import datetime
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import repo, telegram_alert
from .db import connect
from .email import RESEND_ENDPOINT

log = logging.getLogger(__name__)

INBOUND_PATH = "inbound-email"
_TOLERANCE_SEC = 5 * 60


def verify_svix_signature(
    secret: str, headers: Mapping[str, str], body: bytes, now: float | None = None
) -> bool:
    """Standard svix HMAC check: base64(hmac_sha256(key, f"{id}.{ts}.{body}"))."""
    msg_id = headers.get("svix-id", "")
    timestamp = headers.get("svix-timestamp", "")
    signatures = headers.get("svix-signature", "")
    if not (msg_id and timestamp and signatures):
        return False
    try:
        if abs((now or time.time()) - int(timestamp)) > _TOLERANCE_SEC:
            return False
        key = base64.b64decode(secret.removeprefix("whsec_"))
    except (ValueError, TypeError):
        return False
    signed = f"{msg_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        hmac.compare_digest(expected, part.partition(",")[2])
        for part in signatures.split(" ")
        if part
    )


class _TransientFetchError(Exception):
    """Body fetch failed in a way a svix retry can heal (network blip, Resend 5xx)."""


async def _fetch_body(email_id: str) -> dict[str, Any] | None:
    """Fetch html/text for a received email; the webhook payload itself carries neither.

    Returns None when fetching is impossible for a non-transient reason (no admin key, 4xx) —
    the caller forwards a placeholder instead of dropping the mail. Raises _TransientFetchError
    for blips worth a svix retry.
    """
    api_key = os.environ.get("RESEND_ADMIN_API_KEY")
    if not api_key:
        log.warning(
            "inbound body fetch skipped: RESEND_ADMIN_API_KEY unset",
            extra={"event": "inbound_email_body_fetch_unconfigured"},
        )
        await telegram_alert.notify(
            "inbound email body fetch", "RESEND_ADMIN_API_KEY unset, forwarding without body"
        )
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{RESEND_ENDPOINT}/receiving/{email_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except Exception as exc:
        raise _TransientFetchError(f"{type(exc).__name__}: {exc}") from exc
    if resp.status_code >= 500:
        raise _TransientFetchError(f"status {resp.status_code}")
    if resp.status_code >= 300:
        log.error(
            "inbound body fetch failed",
            extra={"event": "inbound_email_body_fetch_failed", "status": resp.status_code},
        )
        await telegram_alert.notify(
            "inbound email body fetch", f"status {resp.status_code}, forwarding without body"
        )
        return None
    fetched: dict[str, Any] = resp.json()
    return fetched


async def _forward(data: dict[str, Any]) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    forward_to = os.environ.get("CONTACT_FORWARD_TO")
    if not api_key or not forward_to:
        log.warning(
            "inbound email dropped: RESEND_API_KEY/CONTACT_FORWARD_TO unset",
            extra={"event": "inbound_email_unconfigured"},
        )
        await telegram_alert.notify(
            "inbound email forward", "RESEND_API_KEY/CONTACT_FORWARD_TO unset, mail dropped"
        )
        return True  # nothing to retry — configuration, not a transient failure

    email_id = data.get("email_id") or data.get("id")
    if not (data.get("html") or data.get("text")) and email_id:
        try:
            fetched = await _fetch_body(str(email_id))
        except _TransientFetchError as exc:
            log.error(
                "inbound body fetch failed transiently",
                extra={"event": "inbound_email_body_fetch_failed", "status": str(exc)},
            )
            return False  # svix retries the whole webhook, fetch included
        if fetched:
            data = {**data, "html": fetched.get("html"), "text": fetched.get("text")}

    sender = data.get("from") or "unknown sender"
    subject = data.get("subject") or "(no subject)"
    body_html = data.get("html")
    if not body_html:
        text = data.get("text") or "(empty body)"
        body_html = f'<pre style="font-family:inherit">{html_mod.escape(text)}</pre>'
    to_esc = html_mod.escape(str(data.get("to")))
    meta = (
        f'<p style="color:#6B7280;font-size:12px">Inbound to {to_esc}'
        f" from {html_mod.escape(str(sender))}</p><hr>"
    )

    payload = {
        "from": os.environ.get("EMAIL_FROM", "AIm <coach@aim-journal.com>"),
        "to": [forward_to],
        "reply_to": sender if isinstance(sender, str) else None,
        "subject": f"[contact] {subject}",
        "html": meta + body_html,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_ENDPOINT, headers={"Authorization": f"Bearer {api_key}"}, json=payload
            )
        ok = resp.status_code < 300
        status: int | str = resp.status_code
    except Exception as exc:
        ok = False
        status = f"{type(exc).__name__}: {exc}"
    log.log(
        logging.INFO if ok else logging.ERROR,
        "inbound email forwarded" if ok else "inbound email forward failed",
        extra={
            "event": "inbound_email" if ok else "inbound_email_forward_failed",
            "from": sender,
            "subject": subject,
            "attachments": len(data.get("attachments") or []),
            "status": status,
        },
    )
    if not ok:
        # Resend/svix will retry automatically (see inbound_email's 500), so one blip self-heals;
        # this is only noisy if the forward is broken across every retry, which is exactly the
        # case worth knowing about.
        await telegram_alert.notify("inbound email forward", str(status))
    return ok


_DELIVERY_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
    "email.failed",
}


def _parse_ts(value: Any) -> datetime | None:
    """Resend timestamps are ISO 8601, sometimes with a trailing Z psycopg will not take."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _record_delivery_event(kind: str | None, data: dict[str, Any]) -> JSONResponse:
    """Store one delivery event against the person we sent the message to.

    Answers 200 for anything we do not track, including event types Resend adds later: an
    unrecognised type is not an error, and a non-2xx would make svix retry it forever. Storage
    failures DO return 500 so the event is retried rather than silently lost.
    """
    if kind not in _DELIVERY_EVENTS:
        return JSONResponse({"ok": True, "ignored": kind})

    email_id = data.get("email_id") or data.get("id")
    if not isinstance(email_id, str) or not email_id:
        # Nothing to join on; keeping it would be a row we can never interpret.
        log.warning("delivery event without email id", extra={"event": "email_event_no_id"})
        return JSONResponse({"ok": True, "ignored": "no email id"})

    short = kind.removeprefix("email.")
    # Bounce/complaint context only. Deliberately not the recipient address: users.email already
    # holds it, and duplicating PII into a telemetry table buys nothing.
    detail: dict[str, Any] = {}
    for key in ("bounce_type", "bounce", "reason", "click", "subject"):
        if key in data:
            detail[key] = data[key]

    try:
        async with connect() as conn:
            user_id = await repo.user_id_for_email_id(conn, email_id)
            await repo.record_email_event(
                conn,
                resend_email_id=email_id,
                kind=short,
                user_id=user_id,
                occurred_at=_parse_ts(data.get("created_at")),
                detail=detail or None,
            )
    except Exception as exc:  # noqa: BLE001 - answer 500 so svix retries instead of losing it
        log.exception("email event store failed", extra={"event": "email_event_store_failed"})
        await telegram_alert.notify("email delivery webhook", f"{type(exc).__name__}: {exc}")
        return JSONResponse({"error": "store failed"}, status_code=500)

    if short in ("bounced", "complained", "failed"):
        # A bounce means a signup silently got nothing. Worth waking someone, unlike an open.
        await telegram_alert.notify("activation email", f"{short}: {detail or 'no detail'}")
    log.info("email delivery event", extra={"event": "email_delivery", "kind": short})
    return JSONResponse({"ok": True})


async def inbound_email(request: Request) -> JSONResponse:
    secret = os.environ.get("RESEND_WEBHOOK_SECRET")
    body = await request.body()
    if not secret or not verify_svix_signature(secret, request.headers, body):
        log.warning("inbound webhook rejected", extra={"event": "inbound_email_rejected"})
        return JSONResponse({"error": "invalid signature"}, status_code=401)

    try:
        event = json.loads(body)
    except ValueError:
        return JSONResponse({"error": "invalid body"}, status_code=400)
    kind = event.get("type")
    if kind != "email.received":
        # Everything else Resend sends about OUR outbound mail: delivered, opened, clicked,
        # bounced, complained, delivery_delayed. These used to be dropped here, which is why
        # `email_sent=true` (Resend accepted it) was the only thing we ever knew about an
        # activation email, and two of four August signups vanished with no way to tell an
        # ignored mail from one that never arrived. Same endpoint and same secret on purpose:
        # enabling the extra event types on the existing Resend webhook is one checkbox, where a
        # second endpoint would mean a second signing secret to configure and rotate.
        return await _record_delivery_event(kind, event.get("data") or {})

    forwarded = await _forward(event.get("data") or {})
    if not forwarded:
        return JSONResponse({"error": "forward failed"}, status_code=500)  # svix will retry
    return JSONResponse({"ok": True})
