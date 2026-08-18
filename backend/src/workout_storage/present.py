"""Normalize DB rows into the shape clients sent in.

Reads come straight from SQL, so they carry internal columns (`user_id`, FK ids) and DB names
(`position`, `program_external_id`) that differ from the pydantic models. These helpers strip the
internal noise and rename fields back so what you read matches what you logged. Applied only at the
MCP boundary (services); internal callers (auth, backup, scripts) use the raw rows.
"""

from __future__ import annotations

from typing import Any

_INTERNAL = {"user_id"}


def _clean(row: dict[str, Any], *drop: str) -> dict[str, Any]:
    return {k: v for k, v in row.items() if k not in _INTERNAL and k not in drop}


def present_set(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row, "entry_id")


def present_entry(row: dict[str, Any]) -> dict[str, Any]:
    entry = _clean(row, "session_id")
    if "position" in entry:
        entry["order"] = entry.pop("position")
    entry["sets"] = [present_set(s) for s in row.get("sets", [])]
    return entry


def _rename_session(row: dict[str, Any]) -> dict[str, Any]:
    s = _clean(row)
    if "program_external_id" in s:
        s["program_id"] = s.pop("program_external_id")
    if "day_template_external_id" in s:
        s["day_template_id"] = s.pop("day_template_external_id")
    return s


def present_session(row: dict[str, Any]) -> dict[str, Any]:
    s = _rename_session(row)
    s["entries"] = [present_entry(e) for e in row.get("entries", [])]
    if row.get("metrics"):
        s["metrics"] = _clean(row["metrics"], "session_id")
    s["cardio"] = [_clean(c, "session_id") for c in row.get("cardio", [])]
    return s


def present_session_summary(row: dict[str, Any]) -> dict[str, Any]:
    """Flat session row from list_sessions (no nested entries)."""
    return _rename_session(row)


def present_body_metric(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row)


def present_exercise(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row)


# Language a caller gets when it asks for none. English, matching the web app's runtime fallback
# (web/src/app/i18n/index.ts): a client with no signal is likelier to be global than Russian.
DEFAULT_LOCALE = "en"


def present_pool_exercise(row: dict[str, Any], *, locale: str | None = None) -> dict[str, Any]:
    """Flatten a pool row to one language.

    The table stores every locale in `names` / `instructions`; a caller wants one string. Falling
    back locale → en → ru → any means a partially translated entry still renders a name rather than
    an empty card. `match_keys` is machinery for lookup, not something a client should ever see.
    """
    entry = _clean(row, "match_keys")
    wanted = (locale or DEFAULT_LOCALE).split("-")[0]
    entry["name"] = _pick_locale(row.get("names"), wanted) or row["slug"]
    entry["instructions"] = _pick_locale(row.get("instructions"), wanted)
    entry.pop("names", None)
    return entry


def _pick_locale(values: dict[str, str] | None, wanted: str) -> str | None:
    if not values:
        return None
    for key in (wanted, DEFAULT_LOCALE, "ru"):
        text = (values.get(key) or "").strip()
        if text:
            return text
    return next((v for v in values.values() if v and v.strip()), None)


def present_program(row: dict[str, Any]) -> dict[str, Any]:
    """Program row, renaming external_id → id to match what was imported."""
    p = _clean(row, "id")
    if "external_id" in p:
        p["id"] = p.pop("external_id")
    return p


def present_day_template(row: dict[str, Any]) -> dict[str, Any]:
    t = _clean(row, "id")
    if "external_id" in t:
        t["id"] = t.pop("external_id")
    if "program_external_id" in t:
        t["program_id"] = t.pop("program_external_id")
    return t


def present_coach_profile(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row)


def present_goal(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row)


def present_coach_event(row: dict[str, Any]) -> dict[str, Any]:
    return _clean(row)
