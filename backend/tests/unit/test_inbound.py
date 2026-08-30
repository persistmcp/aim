"""Unit tests for the inbound-email webhook: svix signature math and handler behaviour.

Covers U-INBOUND-1 (the five signature tests below) through U-INBOUND-5 from docs/TEST_CASES.md.
"""

import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest

from workout_storage.inbound import verify_svix_signature

SECRET_RAW = b"0123456789abcdef0123456789abcdef"
SECRET = "whsec_" + base64.b64encode(SECRET_RAW).decode()


def _sign(body: bytes, msg_id="msg_1", ts: int | None = None) -> dict:
    ts = ts or int(time.time())
    signed = f"{msg_id}.{ts}.".encode() + body
    sig = base64.b64encode(hmac.new(SECRET_RAW, signed, hashlib.sha256).digest()).decode()
    return {"svix-id": msg_id, "svix-timestamp": str(ts), "svix-signature": f"v1,{sig}"}


def test_valid_signature_accepted():
    body = b'{"type":"email.received"}'
    assert verify_svix_signature(SECRET, _sign(body), body) is True


def test_tampered_body_rejected():
    headers = _sign(b'{"type":"email.received"}')
    assert verify_svix_signature(SECRET, headers, b'{"type":"evil"}') is False


def test_stale_timestamp_rejected():
    body = b"{}"
    headers = _sign(body, ts=int(time.time()) - 3600)
    assert verify_svix_signature(SECRET, headers, body) is False


def test_missing_headers_rejected():
    assert verify_svix_signature(SECRET, {}, b"{}") is False


def test_multiple_space_separated_signatures():
    body = b"{}"
    headers = _sign(body)
    headers["svix-signature"] = "v1,garbage " + headers["svix-signature"]
    assert verify_svix_signature(SECRET, headers, body) is True


@pytest.fixture
def telegram_capture(monkeypatch):
    from workout_storage import telegram_alert

    calls = []

    async def fake_notify(source, error, user_id=None):
        calls.append((source, error, user_id))

    monkeypatch.setattr(telegram_alert, "notify", fake_notify)
    return calls


@pytest.fixture
def app_client(monkeypatch):
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("CONTACT_FORWARD_TO", "owner@example.com")
    from workout_storage.signup import signup_app

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=signup_app), base_url="http://t")


async def test_endpoint_rejects_unsigned(app_client):
    """U-INBOUND-2."""
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=b"{}")
    assert r.status_code == 401


async def test_endpoint_forwards_received_email(app_client, monkeypatch, telegram_capture):
    """U-INBOUND-2."""
    from types import SimpleNamespace

    sent = {}

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None, **kw):
            sent.update(json)
            return httpx.Response(200, json={"id": "email_1"})

    # Patch only the name inside the inbound module — the test's own httpx client must stay real.
    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=FakeClient))
    event = {
        "type": "email.received",
        "data": {
            "from": "visitor@example.com",
            "to": ["contact@aim-journal.com"],
            "subject": "Вопрос",
            "text": "Привет! Как подключить?",
        },
    }
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert sent["to"] == ["owner@example.com"]
    assert sent["reply_to"] == "visitor@example.com"
    assert sent["subject"] == "[contact] Вопрос"
    assert "Как подключить" in sent["html"]
    assert telegram_capture == []


async def test_endpoint_fetches_body_when_webhook_has_none(
    app_client, monkeypatch, telegram_capture
):
    """The real email.received payload carries only metadata + email_id — the body must be
    fetched from /emails/receiving/{id} with the admin key before forwarding."""
    from types import SimpleNamespace

    monkeypatch.setenv("RESEND_ADMIN_API_KEY", "re_admin_test")
    sent = {}
    fetched_urls = []

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, **kw):
            fetched_urls.append((url, headers["Authorization"]))
            return httpx.Response(
                200, json={"id": "recv_1", "text": "Привет! Как подключить?", "html": None}
            )

        async def post(self, url, headers=None, json=None, **kw):
            sent.update(json)
            return httpx.Response(200, json={"id": "email_1"})

    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=FakeClient))
    event = {
        "type": "email.received",
        "data": {
            "email_id": "recv_1",
            "from": "visitor@example.com",
            "to": ["contact@aim-journal.com"],
            "subject": "Вопрос",
        },
    }
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert fetched_urls == [
        ("https://api.resend.com/emails/receiving/recv_1", "Bearer re_admin_test")
    ]
    assert "Как подключить" in sent["html"]
    assert telegram_capture == []


async def test_endpoint_retries_on_transient_body_fetch_failure(
    app_client, monkeypatch, telegram_capture
):
    """A 5xx from the receiving fetch must bubble up as a webhook 500 so svix retries the whole
    delivery — the body is not lost, just delayed."""
    from types import SimpleNamespace

    monkeypatch.setenv("RESEND_ADMIN_API_KEY", "re_admin_test")

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, **kw):
            return httpx.Response(503, json={"error": "unavailable"})

    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=FakeClient))
    event = {"type": "email.received", "data": {"email_id": "recv_1", "from": "v@example.com"}}
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 500


async def test_endpoint_forwards_placeholder_when_admin_key_missing(
    app_client, monkeypatch, telegram_capture
):
    """No admin key is a configuration state, not a transient one: the mail is still forwarded
    (with the empty-body placeholder) and the owner is paged once, instead of a retry loop."""
    from types import SimpleNamespace

    monkeypatch.delenv("RESEND_ADMIN_API_KEY", raising=False)
    sent = {}

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None, **kw):
            sent.update(json)
            return httpx.Response(200, json={"id": "email_1"})

    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=FakeClient))
    event = {"type": "email.received", "data": {"email_id": "recv_1", "from": "v@example.com"}}
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert "(empty body)" in sent["html"]
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "inbound email body fetch"


async def test_endpoint_returns_500_on_forward_failure_so_svix_retries(
    app_client, monkeypatch, telegram_capture
):
    """U-INBOUND-3: a transient Resend API failure (as opposed to unset config, which is a
    deliberate no-op — see test_forward_noop_when_unconfigured below) must surface as a 500 so
    svix retries with backoff, distinct from the 401 an invalid signature gets (which svix treats
    as terminal). It also pages the owner — a blip self-heals via svix's retry, but the alert is
    collapsed to one message per minute (telegram_alert.py) so a retry storm doesn't spam."""

    class FailingClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None, **kw):
            return httpx.Response(502, json={"error": "upstream unavailable"})

    from types import SimpleNamespace

    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=FailingClient))
    event = {"type": "email.received", "data": {"from": "visitor@example.com", "text": "hi"}}
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 500
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "inbound email forward"
    assert "502" in telegram_capture[0][1]


async def test_endpoint_alerts_on_network_error_not_just_bad_status(
    app_client, monkeypatch, telegram_capture
):
    """The forwarding httpx call itself can raise (timeout, DNS, connection refused) — that path
    previously wasn't caught at all, so it never got logged or alerted, only whatever generic 500
    Starlette produces for an unhandled exception."""

    class BoomClient:
        def __init__(self, **kw): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None, **kw):
            raise TimeoutError("resend timed out")

    from types import SimpleNamespace

    monkeypatch.setattr("workout_storage.inbound.httpx", SimpleNamespace(AsyncClient=BoomClient))
    event = {"type": "email.received", "data": {"from": "visitor@example.com", "text": "hi"}}
    body = json.dumps(event).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 500
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "inbound email forward"
    assert "resend timed out" in telegram_capture[0][1]


async def test_forward_noop_when_unconfigured(monkeypatch, telegram_capture):
    """U-INBOUND-4: missing RESEND_API_KEY/CONTACT_FORWARD_TO is a configuration state, not a
    transient failure — _forward must return True (nothing to retry) rather than causing a 500
    loop. It still pages the owner once, since silently dropped contact mail is still a bug."""
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("CONTACT_FORWARD_TO", raising=False)
    from workout_storage.inbound import _forward

    assert await _forward({"from": "visitor@example.com", "text": "hi"}) is True
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "inbound email forward"


async def test_endpoint_ignores_events_it_does_not_track(app_client):
    """U-INBOUND-5.

    Was written when every non-received event was dropped. Delivery events are now recorded
    (see below), so this asserts the remaining case: a type we have no use for is answered 200
    rather than retried.
    """
    body = json.dumps({"type": "contact.created", "data": {}}).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert r.json().get("ignored") == "contact.created"


# --- delivery events (delivered / opened / bounced / ...) ---------------------
#
# Same endpoint and same secret as the inbound webhook above: these arrive because the extra
# event types are enabled on the one Resend webhook, not because a second endpoint exists.


def _capture_events(monkeypatch):
    """Swap the DB out for a list, so these stay unit tests."""
    from contextlib import asynccontextmanager

    recorded: list[dict] = []

    @asynccontextmanager
    async def fake_connect(*a, **kw):
        yield object()

    async def fake_record(conn, **kw):
        recorded.append(kw)

    async def fake_lookup(conn, email_id):
        return "user-1" if email_id == "known" else None

    monkeypatch.setattr("workout_storage.inbound.connect", fake_connect)
    monkeypatch.setattr("workout_storage.inbound.repo.record_email_event", fake_record)
    monkeypatch.setattr("workout_storage.inbound.repo.user_id_for_email_id", fake_lookup)
    return recorded


async def test_delivered_event_is_recorded_against_the_user(app_client, monkeypatch):
    recorded = _capture_events(monkeypatch)
    body = json.dumps(
        {
            "type": "email.delivered",
            "data": {"email_id": "known", "created_at": "2026-08-29T10:00:00.000Z"},
        }
    ).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert len(recorded) == 1
    assert recorded[0]["kind"] == "delivered"
    assert recorded[0]["user_id"] == "user-1"
    assert recorded[0]["resend_email_id"] == "known"
    # Z-suffixed timestamps must survive, not fall back to now().
    assert recorded[0]["occurred_at"] is not None


async def test_event_for_unknown_message_is_still_stored(app_client, monkeypatch):
    """An unattributable bounce is still a deliverability signal — keep it, user_id null."""
    recorded = _capture_events(monkeypatch)
    body = json.dumps({"type": "email.bounced", "data": {"email_id": "stranger"}}).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert recorded[0]["user_id"] is None
    assert recorded[0]["kind"] == "bounced"


async def test_bounce_pages_the_owner(app_client, monkeypatch, telegram_capture):
    """A bounce means a signup silently got nothing; an open does not deserve a page."""
    _capture_events(monkeypatch)
    for kind, expected in (("email.bounced", 1), ("email.opened", 1)):
        body = json.dumps({"type": kind, "data": {"email_id": "known"}}).encode()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(
                app=__import__("workout_storage.signup", fromlist=["signup_app"]).signup_app
            ),
            base_url="http://t",
        ) as c:
            await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
        assert len(telegram_capture) == expected


async def test_unknown_event_type_is_accepted_not_retried(app_client, monkeypatch):
    """Resend adding a new event type must not become a 500 that svix retries forever."""
    recorded = _capture_events(monkeypatch)
    body = json.dumps({"type": "email.something_new", "data": {"email_id": "known"}}).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert recorded == []


async def test_event_without_email_id_is_dropped(app_client, monkeypatch):
    recorded = _capture_events(monkeypatch)
    body = json.dumps({"type": "email.delivered", "data": {}}).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 200
    assert recorded == []


async def test_storage_failure_returns_500_so_svix_retries(
    app_client, monkeypatch, telegram_capture
):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def boom(*a, **kw):
        raise RuntimeError("db down")
        yield  # pragma: no cover

    monkeypatch.setattr("workout_storage.inbound.connect", boom)
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "known"}}).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))
    assert r.status_code == 500
    assert telegram_capture


async def test_real_resend_bounce_payload_shape(app_client, monkeypatch, telegram_capture):
    """Built from Resend's own documented payload, not from an invented one.

    The earlier tests here used a payload I made up, which verifies the handler against my
    assumptions rather than against reality. This is the example from
    resend.com/docs/webhooks/emails/bounced verbatim, trimmed of nothing that matters:
    the id lives at data.email_id, created_at appears both at the top level and inside data,
    and the bounce detail is a nested object.
    """
    recorded = _capture_events(monkeypatch)
    body = json.dumps(
        {
            "type": "email.bounced",
            "created_at": "2026-11-22T23:41:12.126Z",
            "data": {
                "broadcast_id": "8b146471-e88e-4322-86af-016cd36fd216",
                "created_at": "2026-11-22T23:41:11.894Z",
                "email_id": "known",
                "message_id": "<111-222-333@email.example.com>",
                "from": "AIm <coach@aim-journal.com>",
                "to": ["someone@example.com"],
                "subject": "Your AIm journal is ready",
                "bounce": {
                    "message": "The recipient's address is on the suppression list.",
                    "subType": "Suppressed",
                    "type": "Permanent",
                },
            },
        }
    ).encode()
    async with app_client as c:
        r = await c.post("/api/public/inbound-email", content=body, headers=_sign(body))

    assert r.status_code == 200
    assert len(recorded) == 1
    ev = recorded[0]
    assert ev["kind"] == "bounced"
    assert ev["resend_email_id"] == "known"
    assert ev["user_id"] == "user-1"
    # data.created_at, not the envelope's, and it must parse rather than fall back to now().
    assert ev["occurred_at"] is not None
    assert ev["occurred_at"].year == 2026
    # The bounce reason has to survive, that is the whole point of storing a bounce.
    assert ev["detail"]["bounce"]["type"] == "Permanent"
    # The recipient address must NOT be copied into telemetry; users.email already holds it.
    assert "someone@example.com" not in json.dumps(ev["detail"])
    assert "to" not in ev["detail"]
    # A bounce means a signup silently got nothing, so it must page.
    assert telegram_capture
