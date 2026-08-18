"""Unit tests for structured logging helpers (no DB, no server)."""

import json
import logging

from workout_storage.observability import (
    MAX_ARGS_CHARS,
    JsonFormatter,
    client_key,
    mask_token,
    request_id,
    setup_logging,
    truncate_args,
)


def _record(msg="hello", level=logging.INFO, **extra):
    record = logging.LogRecord("test.logger", level, __file__, 1, msg, (), None)
    for k, v in extra.items():
        setattr(record, k, v)
    return record


def test_json_formatter_emits_valid_json_with_extras():
    line = JsonFormatter().format(_record(event="tool_call", tool="log_session", duration_ms=42))
    out = json.loads(line)
    assert out["msg"] == "hello"
    assert out["level"] == "INFO"
    assert out["logger"] == "test.logger"
    assert out["event"] == "tool_call"
    assert out["tool"] == "log_session"
    assert out["duration_ms"] == 42
    assert "ts" in out


def test_json_formatter_includes_request_id_when_set():
    reset = request_id.set("abc123")
    try:
        out = json.loads(JsonFormatter().format(_record()))
        assert out["request_id"] == "abc123"
    finally:
        request_id.reset(reset)
    out = json.loads(JsonFormatter().format(_record()))
    assert "request_id" not in out


def test_json_formatter_serializes_non_json_extras():
    # Values like dates/UUIDs must not crash the formatter (default=str).
    from datetime import date

    out = json.loads(JsonFormatter().format(_record(day=date(2026, 7, 5))))
    assert out["day"] == "2026-07-05"


def test_mask_token_never_reveals_the_token():
    token = "supersecrettoken1234567890"
    masked = mask_token(token)
    assert token not in masked
    assert masked.startswith(token[:4])
    assert mask_token("") == "<empty>"


def test_truncate_args_bounds_large_payloads():
    small = {"a": 1}
    assert truncate_args(small) == small
    assert truncate_args(None) is None
    big = {"notes": "x" * (MAX_ARGS_CHARS * 2)}
    out = truncate_args(big)
    assert set(out) == {"_truncated"}
    assert len(out["_truncated"]) == MAX_ARGS_CHARS


IP = "203.0.113.7"
UA = "claude-desktop/1.4 (macOS)"


def test_client_key_is_stable_for_the_same_caller(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt-a")
    assert client_key(ip=IP, user_agent=UA) == client_key(ip=IP, user_agent=UA)


def test_client_key_separates_different_callers(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt-a")
    same_ip_other_client = client_key(ip=IP, user_agent="chatgpt-connector/2")
    other_ip_same_client = client_key(ip="198.51.100.9", user_agent=UA)
    assert len({client_key(ip=IP, user_agent=UA), same_ip_other_client, other_ip_same_client}) == 3


def test_client_key_never_carries_the_raw_ip_or_user_agent(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt-a")
    key = client_key(ip=IP, user_agent=UA)
    assert IP not in key
    assert "claude-desktop" not in key
    # Salted, so the digest cannot be recomputed (and the IP space enumerated) off-server.
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt-b")
    assert client_key(ip=IP, user_agent=UA) != key


def test_client_key_prefers_a_session_id(monkeypatch):
    monkeypatch.setenv("CLIENT_KEY_SALT", "salt-a")
    session = client_key(session_id="sess-123", ip=IP, user_agent=UA)
    assert session.startswith("s:")
    # Same session from a different network is still the same caller.
    assert session == client_key(session_id="sess-123", ip="198.51.100.9", user_agent="other")
    assert client_key(ip=IP, user_agent=UA).startswith("f:")


def test_client_key_is_none_without_anything_to_go_on():
    assert client_key() is None
    assert client_key(session_id=None, ip=None, user_agent=None) is None


def test_client_key_falls_back_to_cron_secret_then_a_process_salt(monkeypatch):
    """The column must not be silently dead if CLIENT_KEY_SALT was never set in prod."""
    monkeypatch.delenv("CLIENT_KEY_SALT", raising=False)
    monkeypatch.setenv("CRON_SECRET", "cron-secret")
    with_cron = client_key(ip=IP, user_agent=UA)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert with_cron and client_key(ip=IP, user_agent=UA) not in (None, with_cron)


def test_setup_logging_is_idempotent():
    root = logging.getLogger()
    setup_logging()
    count = sum(isinstance(h.formatter, JsonFormatter) for h in root.handlers)
    setup_logging()
    assert sum(isinstance(h.formatter, JsonFormatter) for h in root.handlers) == count == 1
