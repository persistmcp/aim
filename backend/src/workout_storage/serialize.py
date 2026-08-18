"""Make DB rows / stats output JSON-safe for MCP tool results."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import cast
from uuid import UUID


def jsonable[T](obj: T) -> T:
    """Recursively converts Decimal/datetime/UUID to JSON-safe types, preserving structure.

    Typed `T -> T` rather than `Any -> Any`: every call site passes a dict/list and expects one
    back, so this keeps callers' own return types (e.g. `dict[str, Any]`) intact without a cast
    at every call site. The `cast`s below describe *outer* shape preservation, not that nested
    leaf values are unchanged (Decimal becomes float, UUID becomes str, etc).
    """
    if isinstance(obj, dict):
        return cast(T, {k: jsonable(v) for k, v in obj.items()})
    if isinstance(obj, (list, tuple)):
        return cast(T, [jsonable(v) for v in obj])
    if isinstance(obj, Decimal):
        return cast(T, float(obj))
    if isinstance(obj, (datetime, date)):
        return cast(T, obj.isoformat())
    if isinstance(obj, UUID):
        return cast(T, str(obj))
    return obj
