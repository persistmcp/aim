"""Publish the canonical prompt templates to prompt_seed.json and (optionally) the DB.

workout_storage/prompts.py (TEMPLATES + TEMPLATE_VERSION) is the single canonical source — it
doubles as the in-code fallback, so the coach works even with an empty prompt_templates table.
This script always regenerates the seed from code (prompt_seed.json is a reviewable artifact,
not an edit surface) and publishes the bodies as production rows at TEMPLATE_VERSION.

Template iteration workflow (docs/COACHING_PLAN.md §12.4): edit TEMPLATES in prompts.py, bump
TEMPLATE_VERSION, re-run with --apply. No automation on purpose — run manually.

Usage:
    uv run python scripts/seed_prompts.py            # write prompt_seed.json only
    uv run python scripts/seed_prompts.py --apply    # also upsert into the DB (needs DATABASE_URL)
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from workout_storage import repo
from workout_storage.db import connect
from workout_storage.prompts import TEMPLATE_VERSION, TEMPLATES

OUT = Path(__file__).resolve().parent.parent / "prompt_seed.json"


def build() -> list[dict]:
    return [
        {
            "key": key,
            "version": TEMPLATE_VERSION,
            "label": "production",
            "body": body,
            "changelog": f"seed v{TEMPLATE_VERSION}",
        }
        for key, body in TEMPLATES.items()
    ]


async def apply(entries: list[dict]) -> None:
    async with connect() as conn:
        for e in entries:
            await repo.upsert_prompt_template(
                conn,
                key=e["key"],
                version=e["version"],
                body=e["body"],
                label=e["label"],
                changelog=e["changelog"],
            )
    print(f"applied {len(entries)} templates to the DB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed coaching prompt templates")
    parser.add_argument("--apply", action="store_true", help="upsert into the DB as well")
    args = parser.parse_args()

    entries = build()
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} — {len(entries)} templates")
    if args.apply:
        asyncio.run(apply(entries))


if __name__ == "__main__":
    main()
