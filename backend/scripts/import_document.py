"""Import a full workout document for a user (also serves as a restore from a backup JSON).

Usage:
    uv run python scripts/import_document.py --token <user-token> [--file workout_example.json]

Requires DATABASE_URL in the environment / .env.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from workout_storage import repo, services
from workout_storage.context import current_user_id
from workout_storage.db import connect
from workout_storage.models import WorkoutDocument

DEFAULT_FILE = Path(__file__).parents[1] / "workout_example.json"


async def main() -> None:
    parser = argparse.ArgumentParser(description="Import a workout document for a user")
    parser.add_argument("--token", required=True, help="the user's token")
    parser.add_argument("--file", default=str(DEFAULT_FILE))
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="bypass the active-program quality gate (services.import_document validate=False) "
        "for restoring a pre-existing backup verbatim even if it predates the gate",
    )
    args = parser.parse_args()

    async with connect() as conn:
        user = await repo.get_user_by_token(conn, args.token)
    if user is None:
        raise SystemExit(f"No user found for token {args.token!r}")

    doc = WorkoutDocument.model_validate(json.loads(Path(args.file).read_text(encoding="utf-8")))
    reset = current_user_id.set(str(user["id"]))
    try:
        counts = await services.import_document(doc, validate=not args.skip_validation)
    finally:
        current_user_id.reset(reset)
    print(f"Imported: {counts}")


if __name__ == "__main__":
    asyncio.run(main())
