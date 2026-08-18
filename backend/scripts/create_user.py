"""Create a user and print their connect URLs.

Usage:
    uv run python scripts/create_user.py --name "Alex" [--timezone Europe/Lisbon] [--token <token>]

Requires DATABASE_URL (and optionally PUBLIC_BASE_URL) in the environment / .env.
"""

from __future__ import annotations

import argparse
import asyncio
import os

from workout_storage import repo
from workout_storage.db import connect


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create a workout-storage user")
    parser.add_argument("--name")
    parser.add_argument("--timezone")
    parser.add_argument("--email", help="optional email to tie to the account")
    parser.add_argument("--token", help="optional fixed token; otherwise generated")
    args = parser.parse_args()

    async with connect() as conn:
        user = await repo.create_user(
            conn, name=args.name, token=args.token, timezone=args.timezone, email=args.email
        )

    base = os.environ.get("PUBLIC_BASE_URL", "https://<your-app>.vercel.app").rstrip("/")
    token = user["token"]
    print(f"user_id : {user['id']}")
    print(f"token   : {token}")
    print(f"MCP URL : {base}/{token}/mcp   ← add as a custom connector in Claude")
    print(f"UI  URL : {base}/{token}        ← (web UI, later)")


if __name__ == "__main__":
    asyncio.run(main())
