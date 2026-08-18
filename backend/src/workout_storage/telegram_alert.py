"""Best-effort Telegram DM when something server-side breaks.

Enabled only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set; without them every call is a
silent no-op. A bot token paired with one fixed chat id is inherently private — only whoever holds
that chat id (the owner, via a bot created through @BotFather) ever receives a message; nobody
else can subscribe to it.

Called from every place in the app that can fail outside a normal request/response cycle or
outside an MCP tool call — see call sites in observability.py (tool calls), auth.py (token
resolution + any unhandled crash under a token-scoped request), backup.py, reset_demo.py,
signup.py and email.py (cron + signup, which bypass the token-scoped request path entirely and
so aren't covered by auth.py's hook).
"""

from __future__ import annotations

import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

_TIMEOUT = 5
# Collapses repeat failures of the same source into one message per window instead of flooding
# the chat when something is broken for everyone at once.
_MIN_INTERVAL_SEC = 60
_last_sent: dict[str, float] = {}


async def notify(source: str, error: str, user_id: str | None = None) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    now = time.monotonic()
    last = _last_sent.get(source)
    if last is not None and now - last < _MIN_INTERVAL_SEC:
        return
    _last_sent[source] = now
    text = f"⚠️ {source} failed\nuser: {user_id or '-'}\n{error[:500]}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
    except Exception:
        log.exception("telegram notify failed", extra={"event": "telegram_notify_failed"})
