"""End-to-end coaching flow through the real FastMCP server (in-memory Client).

Covers the Phase-1 loop: intake gate → eager profile writes with ui_impact → goal co-creation →
the data-only context (intake, safety, planning parameters, training data). The context carries
no prompt: every test here asserts on a field, which is also what makes a dropped field break a
test.
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
        assert gated["requested_task"] == "next_workout"
        assert gated["intake"]["complete"] is False
        assert gated["intake"]["next_field"] == "motivation"  # first topic in intake order
        # Gated means gated: no planning numbers or training data leak out before the intake.
        assert "planning_parameters" not in gated
        assert "training_data" not in gated
        assert "prompt" not in gated

        result = await _call(client, "update_coach_profile", patch=CORE_PATCH)
        assert result["intake_status"] == "core_complete"
        assert result["profile"]["next_review_date"] is not None

        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert ctx["intake_required"] is False
        assert ctx["task"] == "next_workout"
        assert ctx["intake"]["complete"] is True
        # The goal's methodology travels as numbers, keyed by the stored primary goal.
        assert ctx["planning_parameters"]["primary_goal"] == "hypertrophy"
        assert ctx["planning_parameters"]["weekly_hard_sets_per_muscle"] == [10, 20]
        assert ctx["user_profile"]["locations"] == ["home"]  # home-only user
        assert "first_session_load_estimates" in ctx  # a generation task
        assert "training_data" in ctx


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
        # In the safety block, resolved to the region and the patterns that load it.
        assert ctx["safety"]["active_injury_areas"] == ["shoulder"]
        [injury] = ctx["safety"]["injuries"]
        assert injury["area"] == "shoulder"
        assert injury["note"] == "ноет на жиме"
        assert injury["loads"]["region"] == "shoulder"
        assert "vertical_push" in injury["loads"]["movement_patterns"]

        healed = await _call(
            client, "update_coach_profile", patch={"resolve_injury_areas": ["shoulder"]}
        )
        assert healed["profile"]["injuries"][0]["active"] is False
        ctx2 = await _call(client, "get_coaching_context", task="next_workout")
        assert ctx2["safety"]["active_injury_areas"] == []
        assert ctx2["safety"]["injuries"] == []
        # A healed injury is not reported as current anywhere in the context.
        assert ctx2["user_profile"]["injuries"] == []

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
        # Deterministic: the server sets the flag from the answer, the model does not judge it.
        assert ctx["safety"]["medical_clearance_advised"] is True
        assert ctx["safety"]["screening_status"] == "answered"
        assert ctx["safety"]["parq_flags"]["chest_pain"] is True


async def test_update_coach_profile_returns_the_next_intake_field_and_goal_candidates(as_user):
    """Each intake write answers with where the intake now stands — one next field, not the list
    of nine — and once a goal direction is on file with no goal saved, computed candidates in
    upsert_goal's shape. They are offered, not assigned: ratified=false, and none is written."""
    async with Client(mcp_server()) as client:
        first = await _call(client, "update_coach_profile", patch={"motivation": "здоровье"})
        assert first["intake"]["complete"] is False
        assert first["intake"]["next_field"] == "experience_level"
        # The offered values are exactly the ones the patch accepts, "returning" included.
        from workout_storage.coach import CoachExperience

        options = first["intake"]["next_field_options"]
        assert set(options) == {e.value for e in CoachExperience}
        assert "goal_candidates" not in first  # no primary_goal yet

        r = await _call(client, "update_coach_profile", patch=CORE_PATCH)
        assert r["intake"]["complete"] is True
        candidates = r["goal_candidates"]
        assert candidates
        for c in candidates:
            assert c["ratified"] is False
            assert c["source"] == "coach_proposed"
            assert c["basis"]
        assert await _call(client, "get_goals") == [], "a candidate must not be saved"

        await _call(client, "upsert_goal", goal={"kind": "process", "title": "3 раза в неделю"})
        after = await _call(client, "update_coach_profile", patch={"schedule_cue": "утром"})
        assert "goal_candidates" not in after, "a user with an active goal gets no candidates"


async def test_never_asked_health_questions_read_as_not_assessed(as_user):
    """No parq answers on file is not a clean screening: the context says `not_assessed`, and
    medical_clearance_advised is null rather than false, since false reads as a cleared
    screening."""
    async with Client(mcp_server()) as client:
        no_parq = {k: v for k, v in CORE_PATCH.items() if k != "parq_flags"}
        await _call(client, "update_coach_profile", patch=no_parq)
        ctx = await _call(client, "get_coaching_context", task="next_workout")
        assert ctx["safety"]["screening_status"] == "not_assessed"
        assert ctx["safety"]["medical_clearance_advised"] is None


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
        [goal] = ctx["goals"]
        assert goal["title"] == "Жим гантелей 30 кг × 8"
        assert goal["ratified"] is True
        # A user with an active goal is not offered fresh candidates on top of it.
        assert "goal_candidates" not in ctx


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


async def test_featured_goal_progress_reaches_the_coaching_context(as_user):
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
        goal = next(g for g in ctx["goals"] if g["title"] == "Bench 100kg")
        assert goal["progress"]["type"] == "bar"
        assert goal["progress"]["pct"] == 80  # top weight 80 of the 100 target


async def test_context_carries_program_and_logged_training(as_user, example_doc):
    """A user with real data gets it in the context: program summary, weekly sets, sessions —
    the coach must never plan blind next to an existing program."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH_GYM)
        await _call(client, "import_document", document=example_doc)
        ctx = await _call(client, "get_coaching_context", task="next_workout")
        data = ctx["training_data"]
        assert "Верх тела — Тяга/Жим (суперсеты)" in str(data["active_program"])
        assert "weekly_sets_by_muscle" in data
        assert data["recent_sessions"], "the imported history must reach the coach"
        assert "recent_lifts" in data


async def test_context_carries_the_last_logged_working_sets(as_user):
    """Starting weights come from what the user last lifted, so the context carries it: per
    exercise, the working sets of the last day it was trained, warm-ups left out."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        for day, weight in (("2026-07-01", 20), ("2026-07-03", 22.5)):
            await _call(
                client,
                "log_session",
                session={
                    "date": day,
                    "entries": [
                        {
                            "exercise_id": "ex_db_press",
                            "sets": [
                                {"set_number": 1, "weight_kg": 10, "reps": 10, "type": "warmup"},
                                {"set_number": 2, "weight_kg": weight, "reps": 8},
                            ],
                        }
                    ],
                },
            )
        ctx = await _call(client, "get_coaching_context", task="next_workout")
    [lift] = [x for x in ctx["training_data"]["recent_lifts"] if x["exercise_id"] == "ex_db_press"]
    assert lift["last_date"] == "2026-07-03"
    assert lift["last_sets"] == [{"weight_kg": 22.5, "reps": 8}]
    assert lift["days_logged"] == 2


async def test_constraints_are_transient(as_user):
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch=CORE_PATCH)
        ctx = await _call(
            client,
            "get_coaching_context",
            task="next_workout",
            constraints="сегодня только 30 минут",
        )
        assert ctx["todays_constraints"] == "сегодня только 30 минут"
        again = await _call(client, "get_coaching_context", task="next_workout")
        assert "todays_constraints" not in again
        assert "сегодня только 30 минут" not in str(again)  # not written into the profile


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
