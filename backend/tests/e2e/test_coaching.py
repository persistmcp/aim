"""End-to-end coaching flow through the real FastMCP server (in-memory Client).

Covers the Phase-1 loop from docs/COACHING_PLAN.md: intake gate → eager profile writes with
ui_impact → goal co-creation → assembled context with methodology/safety/stats layers.
"""

import httpx
import pytest
from fastmcp import Client

from .conftest import call_tool as _call
from .conftest import mcp_server

pytestmark = pytest.mark.e2e


CORE_PATCH = {
    "primary_goal": "hypertrophy",
    "motivation": "хочу выглядеть и чувствовать себя лучше",
    "experience_level": "returning",
    "training_days_per_week": 3,
    "locations": ["home"],
    "equipment": ["dumbbell", "resistance_band"],
    "parq_flags": {"heart_condition": False, "chest_pain": False, "dizziness": False},
}

# Same intake, but for tests that import `example_doc`'s gym program: import_document now runs
# the same equipment/frequency checklist as review_program_draft (FUNCTIONAL_IMPROVEMENTS_PLAN.md
# #1), so a home/dumbbell profile would correctly reject that machine-and-cable program — this
# variant matches the fixture instead of exercising the gate those tests aren't about.
CORE_PATCH_GYM = {
    **CORE_PATCH,
    "training_days_per_week": 4,  # example_doc's program is frequency_per_week=4
    "locations": ["gym"],
    "equipment": ["cable", "machine", "lat_pulldown", "seated_row", "cable_crossover", "ez_bar"],
}


async def test_intake_gate_then_unlock(as_user):
    """Generation tasks are hard-gated until core intake fields exist (§12.2)."""
    async with Client(mcp_server()) as client:
        gated = await _call(client, "get_coaching_context", task="next_workout")
        assert gated["intake_required"] is True
        assert gated["task"] == "intake"
        assert "intake conversation" in gated["prompt"]

        result = await _call(client, "update_coach_profile", patch=CORE_PATCH)
        assert result["intake_status"] == "core_complete"
        assert result["profile"]["next_review_date"] is not None

        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert ctx["intake_required"] is False
        assert ctx["task"] == "next_workout"
        assert "Hypertrophy methodology" in ctx["prompt"]
        assert "Home / minimal-equipment addendum" in ctx["prompt"]  # home-only user
        assert "<training_data>" in ctx["prompt"]


async def test_incremental_patches_and_ui_impact(as_user):
    """Eager one-fact-per-call writes: status climbs, ui_impact names what the user will see."""
    async with Client(mcp_server()) as client:
        r1 = await _call(client, "update_coach_profile", patch={"primary_goal": "strength"})
        assert r1["intake_status"] == "in_progress"
        assert "dashboard_layout" in r1["ui_impact"]

        r2 = await _call(client, "update_coach_profile", patch={"training_days_per_week": 4})
        assert r2["ui_impact"] == ["adherence_target"]
        assert r2["changed"] == ["training_days_per_week"]
        assert r2["profile"]["primary_goal"] == "strength"  # earlier fact survived


async def test_injury_lifecycle_reaches_safety_layer(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        r = await _call(
            client,
            "update_coach_profile",
            patch={"add_injuries": [{"area": "shoulder", "note": "ноет на жиме"}]},
        )
        assert "muscle_map_injury_badge" in r["ui_impact"]
        assert r["profile"]["injuries"][0]["active"] is True

        # The tool advertises idempotentHint: an identical re-report (client retry) must not
        # duplicate the active entry.
        retried = await _call(
            client,
            "update_coach_profile",
            patch={"add_injuries": [{"area": "shoulder", "note": "ноет на жиме"}]},
        )
        assert len(retried["profile"]["injuries"]) == 1

        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert "shoulder" in ctx["prompt"].split("<user_profile>")[0]  # in the safety layer

        healed = await _call(
            client, "update_coach_profile", patch={"resolve_injury_areas": ["shoulder"]}
        )
        assert healed["profile"]["injuries"][0]["active"] is False
        ctx2 = await _call(client, "get_coaching_context", task="next_workout")
        assert "shoulder" not in ctx2["prompt"].split("<user_profile>")[0]

        # A recurrence after resolution is a NEW report, not a duplicate — it must append.
        again = await _call(
            client,
            "update_coach_profile",
            patch={"add_injuries": [{"area": "shoulder", "note": "ноет на жиме"}]},
        )
        assert [i["active"] for i in again["profile"]["injuries"]] == [False, True]


async def test_red_flag_escalates_deterministically(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        r = await _call(client, "update_coach_profile", patch={"parq_flags": {"chest_pain": True}})
        # Partial re-ask merges into the stored answers instead of clobbering them.
        assert r["profile"]["parq_flags"]["heart_condition"] is False  # from CORE_PATCH
        assert r["profile"]["parq_flags"]["chest_pain"] is True
        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert "medical clearance is advised" in ctx["prompt"]


async def test_explicit_null_clears_a_field(as_user):
    """Patch semantics: null = clear, omitted = untouched (schedule changed → cue removed)."""
    async with Client(mcp_server()) as client:
        patch = {**CORE_PATCH, "schedule_cue": "после работы"}
        await _call(client, "update_coach_profile", patch=patch)
        r = await _call(client, "update_coach_profile", patch={"schedule_cue": None})
        assert r["profile"]["schedule_cue"] is None
        assert r["profile"]["motivation"] == CORE_PATCH["motivation"]  # untouched


async def test_goal_cocreation_flow(as_user):
    """Coach proposes (ratified=false) → user agrees → ratified goal shows up in context."""
    async with Client(mcp_server()) as client:
        proposed = await _call(
            client,
            "upsert_goal",
            goal={
                "kind": "performance",
                "title": "Жим гантелей 30 кг × 8",
                "source": "coach_proposed",
                "ratified": False,
                "target": {"metric": "weight", "value": 30, "unit": "kg"},
            },
        )
        assert proposed["goal"]["ratified"] is False
        assert proposed["ui_impact"] == ["goal_progress_card"]

        ratified = await _call(
            client,
            "upsert_goal",
            goal={
                "id": str(proposed["goal"]["id"]),
                "kind": "performance",
                "title": "Жим гантелей 30 кг × 8",
                "source": "coach_proposed",
                "ratified": True,
            },
        )
        assert ratified["goal"]["ratified"] is True

        goals = await _call(client, "get_goals")
        assert len(goals) == 1

        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        ctx = await _call(client, "get_coaching_context", task="weekly_review")
        assert "Жим гантелей 30 кг × 8" in ctx["prompt"]


async def test_milestone_achieved_then_superseded_by_maintenance_goal(as_user):
    """The full handoff (2026-07-18): a milestone gets marked achieved and unfeatured, a new
    maintenance goal takes over as featured and links back via supersedes_goal_id — the exact
    two-call sequence the upsert_goal tool docstring instructs the coach to make. Never automatic:
    both calls are explicit, matching "the coach decides, in conversation, never the app"."""
    async with Client(mcp_server()) as client:
        # The goal's exercise must exist in the catalog first (2026-07-21 write guard) — the
        # same list_exercises/upsert_exercise-first flow the tool docstring now instructs.
        await _call(client, "upsert_exercise", exercise={"id": "ex_bench", "name": "Bench Press"})
        milestone = await _call(
            client,
            "upsert_goal",
            goal={
                "kind": "performance",
                "title": "Bench 100kg",
                "featured": True,
                "target": {
                    "goal_type": "milestone",
                    "metric": "weight",
                    "exercise_id": "ex_bench",
                    "value": 100,
                },
            },
        )
        assert milestone["goal"]["featured"] is True

        achieved = await _call(
            client,
            "upsert_goal",
            goal={
                "id": str(milestone["goal"]["id"]),
                "kind": "performance",
                "title": "Bench 100kg",
                "status": "achieved",
                "featured": False,
            },
        )
        assert achieved["goal"]["status"] == "achieved"
        assert achieved["goal"]["featured"] is False

        maintenance = await _call(
            client,
            "upsert_goal",
            goal={
                "kind": "outcome",
                "title": "Maintain 100kg bench",
                "featured": True,
                "supersedes_goal_id": str(milestone["goal"]["id"]),
                "target": {
                    "goal_type": "maintenance",
                    "metric": "weight",
                    "exercise_id": "ex_bench",
                    "baseline_value": 100,
                },
            },
        )
        assert maintenance["goal"]["featured"] is True
        assert maintenance["goal"]["supersedes_goal_id"] == str(milestone["goal"]["id"])

        # Exactly one goal_achieved event, one featured goal, the chain resolvable end to end.
        all_goals = await _call(client, "get_goals", status="all")
        assert len(all_goals) == 2
        featured = [g for g in all_goals if g.get("featured")]
        assert len(featured) == 1
        assert featured[0]["id"] == maintenance["goal"]["id"]
        chained = next(g for g in all_goals if g["id"] == maintenance["goal"]["id"])
        assert chained["supersedes_goal_id"] == str(milestone["goal"]["id"])


async def test_achieving_a_featured_goal_clears_featured_even_without_setting_it(as_user):
    """Server-side backstop (services.upsert_goal), beyond the tool docstring telling the coach to
    unset featured explicitly when closing out a goal — mirrors how medical_clearance_advised is
    defended beyond just the prompt telling the coach to set it. A closing-out call that forgets
    to include featured must still leave no featured goal behind."""
    async with Client(mcp_server()) as client:
        await _call(client, "upsert_exercise", exercise={"id": "ex_bench", "name": "Bench Press"})
        milestone = await _call(
            client,
            "upsert_goal",
            goal={
                "kind": "performance",
                "title": "Bench 100kg",
                "featured": True,
                "target": {
                    "goal_type": "milestone",
                    "metric": "weight",
                    "exercise_id": "ex_bench",
                    "value": 100,
                },
            },
        )
        assert milestone["goal"]["featured"] is True

        achieved = await _call(
            client,
            "upsert_goal",
            goal={
                "id": str(milestone["goal"]["id"]),
                "kind": "performance",
                "title": "Bench 100kg",
                "status": "achieved",
                # featured deliberately omitted — this is the exact slip the backstop exists for.
            },
        )
        assert achieved["goal"]["status"] == "achieved"
        assert achieved["goal"]["featured"] is False

        all_goals = await _call(client, "get_goals", status="all")
        assert not any(g.get("featured") for g in all_goals)


async def test_goal_with_unknown_exercise_id_rejected_with_catalog_hint(as_user):
    """The catalog-membership guard over the real MCP path: a synonymous invented id must come
    back as a ToolError whose message carries the actual catalog ids, so the coach can
    self-correct in one retry instead of writing a goal whose progress never resolves."""
    async with Client(mcp_server()) as client:
        await _call(client, "upsert_exercise", exercise={"id": "bench_press", "name": "Жим лёжа"})
        with pytest.raises(Exception, match="not in the user's exercise catalog") as err:
            await _call(
                client,
                "upsert_goal",
                goal={
                    "kind": "performance",
                    "title": "Bench 100kg",
                    "target": {
                        "goal_type": "milestone",
                        "metric": "weight",
                        "exercise_id": "barbell_bench",  # the classic synonym drift
                        "value": 100,
                    },
                },
            )
        assert "bench_press" in str(err.value)  # the hint lists real catalog ids


async def test_featured_goal_progress_reaches_the_coaching_prompt(as_user):
    """weekly_review's "did they hit their goal" check reads the same computed progress the app
    shows — get_coaching_context must attach it, not just the bare goal facts."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        # A logged set both registers the exercise in the catalog (the write guard's
        # prerequisite) and gives the milestone a deterministic current value: top 80 of 100.
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-07-03",
                "entries": [
                    {
                        "exercise_id": "ex_bench",
                        "sets": [{"set_number": 1, "weight_kg": 80, "reps": 5}],
                    }
                ],
            },
        )
        await _call(
            client,
            "upsert_goal",
            goal={
                "kind": "performance",
                "title": "Bench 100kg",
                "featured": True,
                "target": {
                    "goal_type": "milestone",
                    "metric": "weight",
                    "exercise_id": "ex_bench",
                    "value": 100,
                },
            },
        )
        ctx = await _call(client, "get_coaching_context", task="weekly_review")
        # A milestone's progress is the cheap "bar" envelope; asserting the computed field itself
        # (not just the goal's title, which would be present either way) confirms
        # get_coaching_context actually attaches progress, not just the bare goal facts. (This
        # used to feature a frequency goal to reach the same fallback — no longer writable:
        # GoalInput rejects featured frequency goals since 2026-07-21.) The richer
        # weekly_bands/trend/tolerance envelopes are unit-tested directly in
        # test_goal_progress.py, which doesn't need a live MCP round trip to exercise the math.
        assert "Bench 100kg" in ctx["prompt"]
        assert '"type": "bar"' in ctx["prompt"]
        assert '"pct": 80' in ctx["prompt"]  # top weight 80 of the 100 target


async def test_context_carries_program_and_logged_training(as_user, example_doc):
    """A user with real data gets it in the prompt: program summary, weekly sets, sessions —
    the coach must never plan blind next to an existing program."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH_GYM)
        await _call(client, "import_document", document=example_doc)
        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert "Верх тела — Тяга/Жим (суперсеты)" in ctx["prompt"]  # active_program summary
        assert "direct_sets_last_7d" in ctx["prompt"] or "weekly_sets_by_muscle" in ctx["prompt"]
        assert "recent_sessions" in ctx["prompt"]


async def test_constraints_are_transient(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        ctx = await _call(
            client,
            "get_coaching_context",
            task="next_workout",
            constraints="сегодня только 30 минут",
        )
        assert "сегодня только 30 минут" in ctx["prompt"]
        again = await _call(client, "get_coaching_context", task="next_workout")
        assert "сегодня только 30 минут" not in again["prompt"]


async def test_coach_event_tool_and_me(as_user):
    async with Client(mcp_server()) as client:
        event = await _call(client, "log_coach_event", type="checkin", payload={"note": "ok"})
        assert event["type"] == "checkin"

        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        await _call(
            client,
            "upsert_goal",
            goal={"kind": "process", "title": "3 тренировки в неделю"},
        )
        # get_me is the cheap coaching-state probe for any client.
        from workout_storage import services

        me = await services.get_me()
        assert me["intake_status"] == "core_complete"
        assert me["goals"] == ["3 тренировки в неделю"]


async def test_http_landmarks_endpoint(user_token):
    _, token = user_token
    from workout_storage.app import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(f"/{token}/api/landmarks")
        assert r.status_code == 200
        body = r.json()
        assert body["set_landmarks"]["chest"] == {"mev": 8, "mav": 20}
        assert body["alias"]["upper_chest"] == "chest"
