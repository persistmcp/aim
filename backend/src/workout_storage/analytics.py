"""Server-side PostHog capture (product analytics + error tracking).

Enabled only when POSTHOG_API_KEY is set; without it every call is a silent no-op, so local
dev and tests need no configuration. The client runs in sync mode — on serverless the process
can be frozen right after the response, so background batching would lose events — and each
capture is awaited through a worker thread to keep the event loop free. Failures are logged
and never surface: analytics must not break a request.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

_client: Any | None = None
_disabled = False


def _get_client() -> Any | None:
    global _client, _disabled
    if _client is not None or _disabled:
        return _client
    api_key = os.environ.get("POSTHOG_API_KEY")
    if not api_key:
        _disabled = True
        return None
    try:
        from posthog import Posthog

        _client = Posthog(
            api_key,
            host=os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com"),
            sync_mode=True,  # deliver before the function can be frozen
            timeout=3,
        )
    except Exception:
        log.exception("posthog init failed", extra={"event": "analytics_init_failed"})
        _disabled = True
    return _client


async def capture(
    distinct_id: str | None,
    event: str,
    properties: dict[str, Any] | None = None,
    *,
    set_person: dict[str, Any] | None = None,
) -> None:
    client = _get_client()
    if client is None:
        return
    props = dict(properties or {})
    if set_person:
        props["$set"] = set_person
    try:
        await asyncio.to_thread(
            client.capture,
            distinct_id=distinct_id or "anonymous",
            event=event,
            properties=props,
        )
    except Exception:
        log.exception("posthog capture failed", extra={"event": "analytics_capture_failed"})


async def capture_exception(exc: BaseException, distinct_id: str | None) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        await asyncio.to_thread(
            client.capture_exception, exc, distinct_id=distinct_id or "anonymous"
        )
    except Exception:
        log.exception("posthog capture failed", extra={"event": "analytics_capture_failed"})
