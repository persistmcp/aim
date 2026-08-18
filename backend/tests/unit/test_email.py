"""Unit tests for the Resend magic-link sender (httpx mocked — no network)."""

import pytest

from workout_storage import email as email_mod


@pytest.fixture
def base_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://app.example.com/")  # trailing slash on purpose
    return "https://app.example.com"


def test_base_url_strips_trailing_slash(base_url):
    assert email_mod._base_url() == "https://app.example.com"


def test_magic_link_html_contains_both_urls():
    html = email_mod._magic_link_html("https://x/tok", "https://x/tok/mcp")
    assert "https://x/tok" in html and "https://x/tok/mcp" in html


def test_magic_link_html_localized_with_en_fallback():
    # Every supported language renders its own strings; unknown codes fall back to English.
    for lang in email_mod.STRINGS:
        html = email_mod._magic_link_html("https://x/tok", "https://x/tok/mcp", lang)
        assert email_mod.STRINGS[lang]["title"] in html
        assert email_mod.STRINGS[lang]["prompt"] in html
    fallback = email_mod._magic_link_html("https://x/tok", "https://x/tok/mcp", "de")
    assert email_mod.STRINGS["en"]["title"] in fallback


def test_magic_link_html_has_no_dashes():
    # Owner's copy rule: no em/en dashes anywhere in user-facing text.
    for lang in email_mod.STRINGS:
        html = email_mod._magic_link_html("https://x/tok", "https://x/tok/mcp", lang)
        assert "—" not in html and "–" not in html


@pytest.fixture
def telegram_capture(monkeypatch):
    from workout_storage import telegram_alert

    calls = []

    async def fake_notify(source, error, user_id=None):
        calls.append((source, error, user_id))

    monkeypatch.setattr(telegram_alert, "notify", fake_notify)
    return calls


async def test_send_magic_link_noop_without_key(monkeypatch, base_url, telegram_capture):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    # Must not touch the network when no key is configured.
    def _boom(*a, **k):  # pragma: no cover - asserts it isn't called
        raise AssertionError("httpx must not be called without RESEND_API_KEY")

    monkeypatch.setattr(email_mod.httpx, "AsyncClient", _boom)
    assert await email_mod.send_magic_link("user@example.com", "tok123") is False
    assert telegram_capture == [("magic-link email", "RESEND_API_KEY unset", None)]


async def test_send_magic_link_posts_expected_resend_payload(monkeypatch, base_url):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "Workout <hi@example.com>")
    calls = []

    class _FakeResp:
        def raise_for_status(self):
            pass

    class _FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            calls.append({"url": url, "headers": headers, "json": json})
            return _FakeResp()

    monkeypatch.setattr(email_mod.httpx, "AsyncClient", _FakeClient)

    ok = await email_mod.send_magic_link("User@Example.com", "tok123")
    assert ok is True
    assert len(calls) == 1
    c = calls[0]
    assert c["url"] == email_mod.RESEND_ENDPOINT
    assert c["headers"]["Authorization"] == "Bearer re_test_key"
    assert c["json"]["from"] == "Workout <hi@example.com>"
    assert c["json"]["to"] == ["User@Example.com"]
    # Body carries the user's personal UI + MCP URLs built from PUBLIC_BASE_URL.
    assert "https://app.example.com/tok123" in c["json"]["html"]
    assert "https://app.example.com/tok123/mcp" in c["json"]["html"]


async def test_send_magic_link_swallows_send_errors(monkeypatch, base_url, telegram_capture):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")

    class _BoomClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise RuntimeError("resend down")

    monkeypatch.setattr(email_mod.httpx, "AsyncClient", _BoomClient)
    # A send failure must never raise (would otherwise leak signup state / abort the request).
    assert await email_mod.send_magic_link("user@example.com", "tok") is False
    # This exact failure mode has silently blocked real signups before — it must page the owner.
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "magic-link email"
    assert "resend down" in telegram_capture[0][1]


async def test_send_magic_link_success_does_not_page(monkeypatch, base_url, telegram_capture):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")

    class _FakeResp:
        def raise_for_status(self):
            pass

    class _FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return _FakeResp()

    monkeypatch.setattr(email_mod.httpx, "AsyncClient", _FakeClient)
    assert await email_mod.send_magic_link("user@example.com", "tok") is True
    assert telegram_capture == []
