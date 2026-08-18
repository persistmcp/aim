"""Vercel Python entrypoint. Exposes the ASGI `app` for the serverless runtime.

Vercel installs requirements.txt but not our local package, so add `backend/src/` to the path
before import. This file and requirements.txt must stay at the repo root: Vercel's zero-config
Python builder only auto-detects functions under a root-level `api/` (see .vercelignore, which
hides the rest of the Python project so Vercel doesn't try to build it as a whole).
All routes flow through here (see vercel.json rewrites): `/{token}/mcp`, `/{token}/api`, `/{token}`.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend", "src"))

from workout_storage.app import app  # noqa: E402

__all__ = ["app"]
