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
        assert email_mod.STRINGS[lang]["connect_cta"] in html
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
    assert await email_mod.send_magic_link("user@example.com", "tok123") is None
    assert telegram_capture == [("magic-link email", "RESEND_API_KEY unset", None)]


async def test_send_magic_link_posts_expected_resend_payload(monkeypatch, base_url):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "Workout <hi@example.com>")
    calls = []

    class _FakeResp:
        def json(self):
            return {"id": "re_msg_1"}

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
    # The Resend message id is the join key for delivery webhooks; it must come back.
    assert ok == "re_msg_1"
    assert len(calls) == 1
    c = calls[0]
    assert c["url"] == email_mod.RESEND_ENDPOINT
    assert c["headers"]["Authorization"] == "Bearer re_test_key"
    assert c["json"]["from"] == "Workout <hi@example.com>"
    assert c["json"]["to"] == ["User@Example.com"]
    # The app link is personal and built from PUBLIC_BASE_URL; the connection address is not --
    # it is the OAuth endpoint, the same for everybody, with no token in it. Asserting the token
    # is absent from it is the point: printing a personal MCP URL here is what the OAuth work
    # replaced.
    assert "https://app.example.com/tok123" in c["json"]["html"]
    assert "https://app.example.com/mcp" in c["json"]["html"]
    assert "tok123/mcp" not in c["json"]["html"]
    assert "tok123/mcp" not in c["json"]["text"]


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
    assert await email_mod.send_magic_link("user@example.com", "tok") is None
    # This exact failure mode has silently blocked real signups before — it must page the owner.
    assert len(telegram_capture) == 1
    assert telegram_capture[0][0] == "magic-link email"
    assert "resend down" in telegram_capture[0][1]


async def test_send_magic_link_success_does_not_page(monkeypatch, base_url, telegram_capture):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")

    class _FakeResp:
        def json(self):
            return {"id": "re_msg_1"}

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
    assert await email_mod.send_magic_link("user@example.com", "tok") == "re_msg_1"
    assert telegram_capture == []


def test_mcp_url_is_a_real_anchor_not_styled_text():
    """The gesture that was failing: long-press to copy only works on a real link.

    Plain text inside a <code> tag forces selection handles across a wrapped 60-character
    string, which is what people were giving up on.
    """
    html = email_mod._magic_link_html("https://x.dev/tok", "https://x.dev/tok/mcp", "en")
    assert '<a href="https://x.dev/tok/mcp"' in html


def test_the_only_button_goes_to_the_connect_page():
    """One action, and it is not the app.

    Sending someone into an empty journal first read as "it is broken" in the first-run review,
    since nothing is logged until the assistant is connected. /connect is inside the app, so
    this still lands them in their own account.
    """
    html = email_mod._magic_link_html("https://x.dev/tok", "https://x.dev/tok/mcp", "en")
    assert html.count("https://x.dev/tok/connect") == 1
    # The bare app URL must not appear as its own link any more.
    assert 'href="https://x.dev/tok"' not in html
    assert html.index("https://x.dev/tok/connect") < html.index("https://x.dev/tok/mcp")


def test_every_language_has_a_preheader_before_the_body():
    """Without it clients preview the brand line and waste the slot next to the subject."""
    for lang, s in email_mod.STRINGS.items():
        html = email_mod._magic_link_html("https://x.dev/tok", "https://x.dev/tok/mcp", lang)
        assert s["preheader"] in html, lang
        assert html.index(s["preheader"]) < html.index(s["title"]), lang


def test_the_address_block_says_it_is_for_copying_not_opening():
    """A browser GET on the MCP URL answers 405, so a tap looks like a broken link."""
    for lang, s in email_mod.STRINGS.items():
        html = email_mod._magic_link_html("https://x.dev/tok", "https://x.dev/tok/mcp", lang)
        assert s["mcp_hint"] in html, lang


def test_html_is_a_document_not_a_fragment():
    """Resend is handed this verbatim.

    It used to be a bare <div>, so the mail went out with no charset for the Cyrillic and
    accented copy, no lang, and nothing marking the dark palette as deliberate.
    """
    for lang in email_mod.STRINGS:
        html = email_mod._magic_link_html("https://x.dev/t", "https://x.dev/t/mcp", lang)
        assert html.startswith("<!doctype html>"), lang
        assert f'<html lang="{lang}">' in html, lang
        assert '<meta charset="utf-8">' in html, lang
        assert 'name="color-scheme" content="dark"' in html, lang
        assert html.rstrip().endswith("</html>"), lang


def test_plain_text_part_is_written_not_derived():
    """Never trust the auto-converter with the hidden preview block's padding entities."""
    text = email_mod._magic_link_text("https://x.dev/t", "https://x.dev/t/mcp", "en")
    assert "https://x.dev/t/mcp" in text and "https://x.dev/t/connect" in text
    assert "&#" not in text and "<" not in text
    assert email_mod.STRINGS["en"]["preheader"] not in text
