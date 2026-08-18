"""The coach nudge: a user who only logs workouts gets a throttled server hint in the
log_session response offering intake (no profile) or a program (profile but no program),
so the coach isn't dead weight for pure loggers."""

import pytest
from fastmcp import Client

from .conftest import call_tool as _call
from .conftest import mcp_server
from .test_coaching import CORE_PATCH, CORE_PATCH_GYM

pytestmark = pytest.mark.e2e


SESSION = {
    "date": "2026-07-03",
    "entries": [
        {
            "exercise_id": "ex_nudge_press",
            "sets": [{"set_number": 1, "weight_kg": 20, "reps": 10}],
        }
    ],
}


async def test_first_log_without_intake_carries_intake_hint(as_user):
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=SESSION)
        assert "coach_hint" in logged
        assert "intake" in logged["coach_hint"]


async def test_nudge_is_throttled_within_cooldown(as_user):
    async with Client(mcp_server()) as client:
        first = await _call(client, "log_session", session=SESSION)
        assert "coach_hint" in first
        second = await _call(client, "log_session", session={**SESSION, "date": "2026-07-04"})
        assert "coach_hint" not in second


async def test_intake_done_but_no_program_offers_program(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        logged = await _call(client, "log_session", session=SESSION)
        assert "coach_hint" in logged
        assert "new_program" in logged["coach_hint"]


async def test_no_nudge_when_intake_and_program_exist(as_user, example_doc):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH_GYM)
        await _call(client, "import_document", document=example_doc)
        logged = await _call(client, "log_session", session=SESSION)
        assert "coach_hint" not in logged


async def test_nudge_returns_after_cooldown_expires(as_user):
    from workout_storage.db import connect

    async with Client(mcp_server()) as client:
        first = await _call(client, "log_session", session=SESSION)
        assert "coach_hint" in first
        # age the throttle event past the 7-day cooldown
        async with connect() as conn:
            await conn.execute(
                "update coach_events set created_at = created_at - interval '8 days' "
                "where type = 'coach_offered'"
            )
        third = await _call(client, "log_session", session={**SESSION, "date": "2026-07-05"})
        assert "coach_hint" in third
