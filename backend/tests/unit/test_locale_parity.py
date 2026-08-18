"""Backend-side locale coverage must match the frontend's language list.

Three places carry per-language strings and they are maintained by hand: the signup email
(email.STRINGS), the XLSX export headers (export_xlsx._L10N) and the frontend catalogs under
web/src/app/i18n/locales. test_email.py already iterates STRINGS, so a new language there is
covered automatically; _L10N had no test at all, which meant a missing locale would ship silently
and users of that language would get an export with headers in another one.

The source of truth for which languages exist is web/shared/languages.mjs, the same file the Vite
config and the guide renderer read.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from workout_storage import email as email_mod
from workout_storage import export_xlsx

WEB = Path(__file__).resolve().parents[3] / "web"


def _shipped_languages() -> list[str]:
    source = (WEB / "shared" / "languages.mjs").read_text(encoding="utf-8")
    match = re.search(r"export const LANGS = \[(.*?)\]", source, re.S)
    assert match, "LANGS not found in web/shared/languages.mjs"
    return re.findall(r'"([a-z-]+)"', match.group(1))


def test_email_strings_cover_every_shipped_language() -> None:
    assert sorted(email_mod.STRINGS) == sorted(_shipped_languages())


def test_xlsx_headers_cover_every_shipped_language() -> None:
    assert sorted(export_xlsx._L10N) == sorted(_shipped_languages())


@pytest.mark.parametrize("table_name", ["STRINGS", "_L10N"])
def test_every_language_has_the_same_keys(table_name: str) -> None:
    table = email_mod.STRINGS if table_name == "STRINGS" else export_xlsx._L10N
    reference = set(table["en"])
    for lang, strings in table.items():
        missing = reference - set(strings)
        extra = set(strings) - reference
        assert not missing and not extra, (
            f"{table_name}['{lang}'] differs from English: missing={sorted(missing)} "
            f"extra={sorted(extra)}"
        )


def test_frontend_catalogs_exist_for_every_shipped_language() -> None:
    """A language present in LANGS but missing an i18n catalog directory would render the app in
    the fallback language while the static landing head claims the missing one."""
    locales = WEB / "src" / "app" / "i18n" / "locales"
    for lang in _shipped_languages():
        directory = locales / lang
        assert directory.is_dir(), f"missing i18n catalogs for '{lang}' at {directory}"
        namespaces = {p.stem for p in directory.glob("*.json")}
        english = {p.stem for p in (locales / "en").glob("*.json")}
        assert namespaces == english, (
            f"'{lang}' namespaces differ from English: "
            f"missing={sorted(english - namespaces)} extra={sorted(namespaces - english)}"
        )


def test_catalogs_are_valid_json() -> None:
    locales = WEB / "src" / "app" / "i18n" / "locales"
    for path in locales.glob("*/*.json"):
        json.loads(path.read_text(encoding="utf-8"))
