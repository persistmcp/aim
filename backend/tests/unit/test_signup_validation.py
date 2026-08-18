"""Unit tests for pure signup helpers (no DB)."""

from types import SimpleNamespace

import pytest

from workout_storage.repo import normalize_email
from workout_storage.signup import _EMAIL_RE, _client_ip


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("  Foo@Bar.COM ", "foo@bar.com"),
        ("a@b.co", "a@b.co"),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_normalize_email(raw, expected):
    assert normalize_email(raw) == expected


@pytest.mark.parametrize("good", ["a@b.co", "user.name+tag@sub.example.com"])
def test_email_regex_accepts_valid(good):
    assert _EMAIL_RE.match(good)


@pytest.mark.parametrize("bad", ["plainaddress", "a@b", "a b@c.com", "@no-local.com", "no-at.com"])
def test_email_regex_rejects_invalid(bad):
    assert not _EMAIL_RE.match(bad)


def _req(headers, client_host="9.9.9.9"):
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=client_host))


def test_client_ip_prefers_x_real_ip_over_xff():
    # x-real-ip (set by Vercel) wins over the client-spoofable x-forwarded-for.
    req = _req({"x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 7.7.7.7"})
    assert _client_ip(req) == "1.1.1.1"


def test_client_ip_falls_back_to_xff_leftmost():
    req = _req({"x-forwarded-for": "6.6.6.6, 7.7.7.7"})
    assert _client_ip(req) == "6.6.6.6"


def test_client_ip_falls_back_to_peer():
    assert _client_ip(_req({}, client_host="8.8.8.8")) == "8.8.8.8"
