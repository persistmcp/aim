"""The PWA manifest exists in two hand-maintained copies: the static one in
web/vite.config.ts (VitePWA) and the token-aware one in api._TOKEN_MANIFEST. They deliberately
differ in start_url/id/scope handling, but the branding fields must match — an installed app
should not change its name depending on which manifest the browser happened to fetch.

The api.py comment has always said "keep the two in sync"; this makes it enforceable. It caught
nothing when written (both were Russian, consistently) — its job is the next change, when only
one side gets updated.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from workout_storage.api import _TOKEN_MANIFEST

VITE_CONFIG = Path(__file__).resolve().parents[3] / "web" / "vite.config.ts"


def _vite_manifest_field(name: str) -> str:
    """Pull one string field out of the VitePWA manifest block in vite.config.ts."""
    source = VITE_CONFIG.read_text(encoding="utf-8")
    start = source.index("manifest: {")
    block = source[start : source.index("workbox: {", start)]
    match = re.search(rf'^\s*{name}:\s*("(?:[^"\\]|\\.)*")', block, re.MULTILINE)
    assert match, f"{name} not found in the VitePWA manifest block of {VITE_CONFIG}"
    return json.loads(match.group(1))


@pytest.mark.parametrize("field", ["name", "short_name", "lang", "description"])
def test_branding_matches_the_static_manifest(field: str) -> None:
    assert _TOKEN_MANIFEST[field] == _vite_manifest_field(field), (
        f"{field} differs between api._TOKEN_MANIFEST and web/vite.config.ts. "
        "Both manifests describe the same installed app — update them together."
    )


def test_manifest_language_matches_the_i18n_fallback() -> None:
    """English, matching i18n fallbackLng and the x-default landing. The manifest is served to
    every user regardless of their chosen language, so it follows the site's default rather than
    the language the copy happened to be authored in."""
    assert _TOKEN_MANIFEST["lang"] == "en"
