"""Corner cases of the two funnel-critical flows: fixing logged data and the first
coaching conversation (intake gate → profile → program).

The fix-a-set promise ("скажи, что в третьем было 10 — исправит") dies silently if a
patch key typo is dropped instead of rejected, so patch validation gets its own tests.
"""

import pytest
from fastmcp import Client

from .conftest import call_tool as _call
from .conftest import mcp_server
from .test_coaching import CORE_PATCH

pytestmark = pytest.mark.e2e


def _session(date="2026-07-01", **kw):
    base = {
        "date": date,
        "entries": [
            {
                "exercise_id": "ex_corner_press",
                "sets": [
                    {"set_number": 1, "weight_kg": 20, "reps": 12},
                    {"set_number": 2, "weight_kg": 20, "reps": 11},
                ],
            }
        ],
    }
    base.update(kw)
    return base


# --- patch validation: a typo must be an error, not a silent no-op ---------------


async def test_update_set_rejects_unknown_patch_key(as_user):
    """`weight` instead of `weight_kg` must fail loudly, not report success."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        with pytest.raises(Exception, match="weight"):
            await _call(
                client,
                "update_set",
                session_id=logged["id"],
                exercise_id="ex_corner_press",
                set_number=1,
                patch={"weight": 25},
            )


async def test_update_set_mixed_patch_is_atomic(as_user):
    """One bad key rejects the whole patch — the good key must NOT half-apply."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        with pytest.raises(Exception, match="weigth"):
            await _call(
                client,
                "update_set",
                session_id=logged["id"],
                exercise_id="ex_corner_press",
                set_number=2,
                patch={"weigth_kg": 25, "reps": 9},
            )
        got = await _call(client, "get_session", session_id=logged["id"])
        assert got["entries"][0]["sets"][1]["reps"] == 11  # untouched


async def test_update_session_rejects_unknown_patch_key(as_user):
    """Session patch with an unknown key must not return a success-shaped session."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        with pytest.raises(Exception, match="weight_kg"):
            # plausible model mistake: bodyweight lives under `bodyweight_kg`
            await _call(
                client,
                "update_session",
                session_id=logged["id"],
                patch={"weight_kg": 80},
            )


async def test_update_set_valid_key_but_missing_target_is_null(as_user):
    """Distinguish 'bad key' (error) from 'no such set' (null)."""
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        res = await _call(
            client,
            "update_set",
            session_id=logged["id"],
            exercise_id="ex_corner_press",
            set_number=99,
            patch={"reps": 10},
        )
        assert res is None


async def test_update_set_occurrence_picks_second_instance(as_user):
    """Same exercise twice in one session: occurrence=2 fixes the later entry only."""
    doubled = {
        "date": "2026-07-02",
        "entries": [
            {
                "exercise_id": "ex_corner_press",
                "order": 1,
                "sets": [{"set_number": 1, "weight_kg": 20, "reps": 12}],
            },
            {
                "exercise_id": "ex_corner_press",
                "order": 2,
                "sets": [{"set_number": 1, "weight_kg": 18, "reps": 15}],
            },
        ],
    }
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=doubled)
        updated = await _call(
            client,
            "update_set",
            session_id=logged["id"],
            exercise_id="ex_corner_press",
            set_number=1,
            patch={"reps": 13},
            occurrence=2,
        )
        assert updated["reps"] == 13
        got = await _call(client, "get_session", session_id=logged["id"])
        by_order = sorted(got["entries"], key=lambda e: e["order"])
        assert by_order[0]["sets"][0]["reps"] == 12  # first instance untouched
        assert by_order[1]["sets"][0]["reps"] == 13


async def test_non_uuid_session_id_is_a_clean_null_not_a_db_error(as_user):
    """The model may pass any string as session_id; a Postgres uuid-cast error must never
    leak into the tool response."""
    async with Client(mcp_server()) as client:
        assert await _call(client, "get_session", session_id="not-a-real-id") is None
        assert (await _call(client, "delete_session", session_id="nope"))["deleted"] is False
        res = await _call(
            client,
            "update_session",
            session_id="nope",
            patch={"notes": "x"},
        )
        assert res is None


async def test_session_reachable_by_external_id(as_user, example_doc):
    """Imported sessions carry external ids like sess_0003; the model quotes them back."""
    async with Client(mcp_server()) as client:
        await _call(client, "import_document", document=example_doc)
        got = await _call(client, "get_session", session_id="sess_0003")
        assert got is not None and got["external_id"] == "sess_0003"

        updated = await _call(
            client,
            "update_set",
            session_id="sess_0003",
            exercise_id="ex_lat_pulldown",
            set_number=1,
            patch={"reps": 9},
        )
        assert updated["reps"] == 9


async def test_stats_progression_requires_exercise_id(as_user):
    async with Client(mcp_server()) as client:
        with pytest.raises(Exception, match="exercise_id"):
            await _call(client, "get_stats", kind="progression")


# --- value bounds: a fix obeys the same rules as a log ----------------------------


async def test_negative_weight_rejected_on_log(as_user):
    """A transcription slip (minus 24 kg) must not poison volume/1RM/muscle map."""
    bad = _session()
    bad["entries"][0]["sets"][0]["weight_kg"] = -24
    async with Client(mcp_server()) as client:
        with pytest.raises(Exception, match="weight_kg"):
            await _call(client, "log_session", session=bad)


async def test_negative_weight_rejected_on_patch(as_user):
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        with pytest.raises(Exception, match="weight_kg"):
            await _call(
                client,
                "update_set",
                session_id=logged["id"],
                exercise_id="ex_corner_press",
                set_number=1,
                patch={"weight_kg": -24},
            )
        with pytest.raises(Exception, match="rpe"):
            await _call(
                client,
                "update_set",
                session_id=logged["id"],
                exercise_id="ex_corner_press",
                set_number=1,
                patch={"rpe": 15},
            )
        with pytest.raises(Exception, match="session_rpe"):
            await _call(
                client,
                "update_session",
                session_id=logged["id"],
                patch={"session_rpe": 15},
            )


async def test_negative_cardio_rejected(as_user):
    bad = {
        "date": "2026-07-01",
        "entries": [],
        "cardio": [{"type": "run", "distance_m": -5000}],
    }
    async with Client(mcp_server()) as client:
        with pytest.raises(Exception, match="distance_m"):
            await _call(client, "log_session", session=bad)


async def test_relog_same_id_replaces_not_duplicates(as_user):
    """MCP clients retry on lost responses: the same session id logged twice must end up
    as ONE stored session (replace, like import), not a doubled workout."""
    sess = {**_session(), "id": "sess_retry_1"}
    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session=sess)
        await _call(client, "log_session", session=sess)
        rows = await _call(client, "get_sessions", limit=50)
        matching = [s for s in rows if s.get("external_id") == "sess_retry_1"]
        assert len(matching) == 1


async def test_pathological_limits_do_not_hit_postgres(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "log_session", session=_session())
        assert isinstance(await _call(client, "get_sessions", limit=-1), list)
        assert isinstance(await _call(client, "get_body_metrics", limit=0), list)


# --- first-conversation corners ---------------------------------------------------


async def test_intake_gate_blocks_every_coaching_task(as_user):
    """All five non-intake tasks fall back to intake while the profile is empty."""
    async with Client(mcp_server()) as client:
        for task in ("next_workout", "new_program", "weekly_review", "deload_check", "checkin"):
            ctx = await _call(client, "get_coaching_context", task=task)
            assert ctx["intake_required"] is True, task
            assert ctx["task"] == "intake", task


async def test_home_addendum_keys_off_locations_not_equipment(as_user):
    """A gym-only user gets no home addendum even with bodyweight-only equipment —
    documents that the switch reads `locations`, not `equipment`."""
    async with Client(mcp_server()) as client:
        gym_patch = {**CORE_PATCH, "locations": ["gym"], "equipment": ["bodyweight"]}
        await _call(client, "update_coach_profile", patch=gym_patch)
        ctx = await _call(client, "get_coaching_context", task="new_program")
        assert "Home / minimal-equipment addendum" not in ctx["prompt"]

        await _call(client, "update_coach_profile", patch={"locations": ["gym", "home"]})
        ctx2 = await _call(client, "get_coaching_context", task="new_program")
        assert "Home / minimal-equipment addendum" in ctx2["prompt"]


async def test_autocreated_exercise_without_muscles_does_not_break_context(as_user):
    """log_session auto-creates unknown exercises with no muscle mapping; weekly stats
    and context assembly must survive them."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        await _call(client, "log_session", session=_session())
        exercises = await _call(client, "list_exercises")
        auto = next(e for e in exercises if e["id"] == "ex_corner_press")
        assert auto["primary_muscles"] == []

        ctx = await _call(client, "get_coaching_context", task="weekly_review")
        assert ctx["task"] == "weekly_review"
        assert "<training_data>" in ctx["prompt"]


async def test_deleted_session_leaves_no_stats_behind(as_user):
    async with Client(mcp_server()) as client:
        logged = await _call(client, "log_session", session=_session())
        vol = await _call(client, "get_stats", kind="volume")
        assert vol["series"], "volume should be non-empty after logging"

        deleted = await _call(client, "delete_session", session_id=logged["id"])
        assert deleted["deleted"] is True
        vol2 = await _call(client, "get_stats", kind="volume")
        assert vol2["series"] == []


async def test_program_location_tags_survive_roundtrip(as_user):
    """The plan contract tells the coach to tag days with custom_fields.location; the tag
    must come back from get_program or gym/home day planning breaks."""
    doc = {
        "schema_version": "1.0.0",
        "programs": [
            {
                "id": "prog_corner",
                "name": "Дом + зал",
                "frequency_per_week": 2,
                "day_template_ids": ["tpl_c_gym", "tpl_c_home"],
                "status": "active",
            }
        ],
        "day_templates": [
            {
                "id": "tpl_c_gym",
                "name": "День в зале",
                "program_id": "prog_corner",
                "custom_fields": {"location": "gym"},
                "blocks": [],
            },
            {
                "id": "tpl_c_home",
                "name": "День дома",
                "program_id": "prog_corner",
                "custom_fields": {"location": "home"},
                "blocks": [],
            },
        ],
    }
    async with Client(mcp_server()) as client:
        await _call(client, "import_document", document=doc)
        prog = await _call(client, "get_program")
        locs = {d["name"]: d["custom_fields"].get("location") for d in prog["days"]}
        assert locs == {"День в зале": "gym", "День дома": "home"}
