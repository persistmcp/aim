"""Unit tests for the Telegram alert (no network, no DB)."""

from __future__ import annotations

import pytest

from workout_storage import telegram_alert


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    telegram_alert._last_sent.clear()
    yield
    telegram_alert._last_sent.clear()


def _spy_client(calls):
    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))

    return _Client


async def test_notify_is_noop_without_env(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    calls = []
    monkeypatch.setattr(telegram_alert.httpx, "AsyncClient", _spy_client(calls))

    await telegram_alert.notify("log_session", "boom", "user-1")

    assert calls == []


async def test_notify_posts_to_telegram_when_configured(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")
    calls = []
    monkeypatch.setattr(telegram_alert.httpx, "AsyncClient", _spy_client(calls))

    await telegram_alert.notify("log_session", "boom", "user-1")

    assert len(calls) == 1
    url, kwargs = calls[0]
    assert url == "https://api.telegram.org/bottok/sendMessage"
    assert kwargs["json"]["chat_id"] == "42"
    assert "log_session" in kwargs["json"]["text"]
    assert "boom" in kwargs["json"]["text"]


async def test_notify_collapses_repeat_failures_within_window(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")
    calls = []
    monkeypatch.setattr(telegram_alert.httpx, "AsyncClient", _spy_client(calls))

    await telegram_alert.notify("log_session", "boom", "user-1")
    await telegram_alert.notify("log_session", "boom again", "user-1")

    assert len(calls) == 1


async def test_notify_does_not_collapse_different_tools(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")
    calls = []
    monkeypatch.setattr(telegram_alert.httpx, "AsyncClient", _spy_client(calls))

    await telegram_alert.notify("log_session", "boom", "user-1")
    await telegram_alert.notify("update_set", "boom", "user-1")

    assert len(calls) == 2


async def test_notify_swallows_http_errors(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "42")

    class _BoomClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, **kwargs):
            raise RuntimeError("network down")

    monkeypatch.setattr(telegram_alert.httpx, "AsyncClient", _BoomClient)

    await telegram_alert.notify("log_session", "boom", "user-1")  # must not raise
