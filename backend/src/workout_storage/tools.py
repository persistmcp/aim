"""MCP tool definitions. Thin wrappers over services; registered onto a FastMCP instance.

All tools operate on the user resolved from the URL token. Inputs are validated by the pydantic
models so the schema Claude sees matches workout_tracker.schema.json.
"""

from __future__ import annotations

from datetime import date as Date
from typing import Any, Literal

from fastmcp import FastMCP

from . import services
from .coach import CoachEventType, CoachProfilePatch, GoalInput
from .models import BodyMetric, Exercise, Session, WorkoutDocument

# MCP tool annotations: a human-readable `title` plus behavior hints (readOnlyHint /
# destructiveHint / idempotentHint). Directory Policy §5.E requires all applicable annotations,
# `title` among them — it is what a client shows in a permission prompt, so titles read as actions
# a person would recognise rather than as function names.
#
# Hints are unconditional per tool, so only unconditionally-true ones are set: log_session,
# upsert_goal, log_body_metric, log_coach_event and import_document are idempotent only when the
# model supplies ids, which a hint can't express — they stay at the spec default rather than
# promise a safe retry that can duplicate a workout, a goal, or an imported history.


def _reads(title: str) -> dict[str, Any]:
    return {"title": title, "readOnlyHint": True}


def _writes(title: str, *, idempotent: bool = False, destructive: bool = False) -> dict[str, Any]:
    hints: dict[str, Any] = {
        "title": title,
        "readOnlyHint": False,
        "destructiveHint": destructive,
    }
    if idempotent:
        hints["idempotentHint"] = True
    return hints


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=_writes("Log workout session"))
    async def log_session(session: Session) -> dict[str, Any]:
        """Log a completed workout session (exercises → sets, cardio, wearable metrics) at once.
        Returns the stored session including any auto-created exercise catalog entries.
        The response may carry a `coach_hint`: a server note to gently offer coaching
        (intake or a program) after confirming the log — offer once, never push.
        If the conversation is about PLANNING training (not just logging), call
        get_coaching_context first.
        Ask how long the session took (or estimate from set count) and set `duration_sec` —
        omitting it renders as an empty duration in the app's history and session views."""
        return await services.log_session(session)

    @mcp.tool(annotations=_writes("Update workout session", idempotent=True))
    async def update_session(session_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        """Fix session-level fields. Allowed keys: date, day_label, duration_sec, location,
        bodyweight_kg, session_rpe, energy_level, status, notes, tags, start_time, end_time."""
        return await services.update_session(session_id, patch)

    @mcp.tool(annotations=_writes("Correct a logged set", idempotent=True))
    async def update_set(
        session_id: str,
        exercise_id: str,
        set_number: int,
        patch: dict[str, Any],
        occurrence: int = 1,
    ) -> dict[str, Any] | None:
        """Fix a key metric of a single set, located by session + exercise + set_number.
        Allowed patch keys: weight_kg, reps, rir, rpe, tempo, rest_sec, duration_sec, distance_m,
        is_per_side, completed, notes, type. `occurrence` (1-based) picks which instance when the
        exercise appears more than once in the session. Returns the updated set, or null if none."""
        return await services.update_set(session_id, exercise_id, set_number, patch, occurrence)

    @mcp.tool(annotations=_reads("Get a workout session"))
    async def get_session(session_id: str) -> dict[str, Any] | None:
        """Get one session with its full nested entries, sets, cardio and wearable metrics."""
        return await services.get_session(session_id)

    @mcp.tool(annotations=_reads("List workout sessions"))
    async def get_sessions(
        date_from: Date | None = None, date_to: Date | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        """List sessions (newest first) with summary fields and total volume.
        Optional date range."""
        return await services.list_sessions(date_from=date_from, date_to=date_to, limit=limit)

    @mcp.tool(annotations=_writes("Delete a workout session", idempotent=True, destructive=True))
    async def delete_session(session_id: str) -> dict[str, Any]:
        """Delete a session and all its entries/sets. Returns {deleted: bool}."""
        return {"deleted": await services.delete_session(session_id)}

    @mcp.tool(annotations=_writes("Record a body measurement"))
    async def log_body_metric(metric: BodyMetric) -> dict[str, Any]:
        """Record a body measurement (weight, body-fat %, circumferences) for a date."""
        return await services.log_body_metric(metric)

    @mcp.tool(annotations=_reads("Get body measurements"))
    async def get_body_metrics(limit: int = 100) -> list[dict[str, Any]]:
        """List body measurements, newest first."""
        return await services.get_body_metrics(limit=limit)

    @mcp.tool(annotations=_writes("Add or update an exercise", idempotent=True))
    async def upsert_exercise(exercise: Exercise) -> dict[str, Any]:
        """Create or update an exercise in the user's catalog (keyed by its id/name).
        Prefer a pool exercise: call search_exercise_pool first and pass its `slug` as the `id`
        plus `pool_slug`, so the movement keeps one identity and one history.
        Only hand-write an exercise when the pool genuinely has nothing for it — then always set
        `instructions` (2-3 short technique cues, in the user's language), `primary_muscles`,
        `category` and `equipment`: the muscle map and the app UI are blank without them.
        Fields you omit are left as they are, so a partial update is safe."""
        return await services.upsert_exercise(exercise)

    @mcp.tool(annotations=_reads("Search the exercise catalog"))
    async def search_exercise_pool(
        muscle: str | None = None,
        equipment: list[str] | None = None,
        movement_pattern: str | None = None,
        category: str | None = None,
        query: str | None = None,
        limit: int = 40,
        locale: str | None = None,
    ) -> dict[str, Any]:
        """Search the curated global exercise pool — THE place to pick exercises from when
        building a program or a workout. Filter by `muscle` (e.g. 'lats', 'side_delts'),
        `equipment` (list of what the user actually has; only exercises fully covered by it are
        returned), `movement_pattern`, `category`, or `query` (a name in any supported language).
        Every entry carries a canonical `slug` — reuse it verbatim as the exercise_id — plus
        localized name and technique cues, primary/secondary/tertiary muscles, and rep/rest
        defaults. `in_user_catalog` marks the ones this user has trained before.
        Invent your own exercise only when nothing here fits."""
        return await services.search_exercise_pool(
            muscle=muscle,
            equipment=equipment,
            movement_pattern=movement_pattern,
            category=category,
            query=query,
            limit=limit,
            locale=locale,
        )

    @mcp.tool(annotations=_reads("List the user's exercises"))
    async def list_exercises(
        muscle: str | None = None,
        equipment: str | None = None,
        movement_pattern: str | None = None,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        """List THIS USER's own exercise catalog — what they have actually trained, with their
        logged metadata (instructions / video_url / image_url / pool_slug). Optional filters:
        `muscle`, `equipment`, `movement_pattern`, `query` (substring of the name or id).
        Use this to reuse an id the user already has; use search_exercise_pool to choose a NEW
        exercise."""
        return await services.list_exercises(
            muscle=muscle,
            equipment=equipment,
            movement_pattern=movement_pattern,
            query=query,
        )

    @mcp.tool(annotations=_reads("Get the training program"))
    async def get_program() -> dict[str, Any] | None:
        """Get the active training program with its day templates (planned blocks/supersets and
        per-exercise targets). Returns null if no active program — to build one, call
        get_coaching_context(task='new_program') and follow it; never invent a program from
        generic knowledge. Edit via import_document."""
        return await services.get_program()

    @mcp.tool(annotations=_reads("Get training statistics"))
    async def get_stats(
        kind: Literal["progression", "volume", "prs"],
        exercise_id: str | None = None,
        date_from: Date | None = None,
    ) -> dict[str, Any]:
        """Statistics for ONE exercise, or for training as a whole.

        exercise_id is REQUIRED for kind='progression' and kind='prs' (they are per-exercise) and
        is ignored for kind='volume' (whole-training-volume over time). Calling progression/prs
        without it is an error, not a whole-library default — if the user did not name an
        exercise, pick its id from list_exercises first, or use kind='volume'.

        'progression' → per-date top set, est-1RM (Epley), volume + PRs; 'prs' → personal records;
        'volume' → total training volume over time with trend %. For coaching decisions (what to
        train, what weight) start from get_coaching_context instead — it bundles the fresh numbers
        with the user's context."""
        return await services.get_stats(kind, exercise_id=exercise_id, date_from=date_from)

    @mcp.tool(annotations=_writes("Import training history"))
    async def import_document(document: WorkoutDocument) -> dict[str, Any]:
        """Bulk-import a full workout document (exercises, sessions, body metrics, programs).
        Programs must be designed via get_coaching_context(task='new_program') and explicitly
        approved by the user before importing. Any active program in the document is validated
        server-side (the same checklist as review_program_draft) before anything is saved; a
        response with ok=false and a violations list means nothing was written — fix each one
        and call import_document again."""
        return await services.import_document(document)

    # --- coaching (docs/COACHING_PLAN.md) --------------------------------------

    @mcp.tool(annotations=_reads("Get coaching context"))
    async def get_coaching_context(
        task: Literal[
            "intake", "next_workout", "new_program", "weekly_review", "deload_check", "checkin"
        ],
        constraints: str | None = None,
    ) -> dict[str, Any]:
        """Coaching instructions + this user's fresh training context for the task. Call at the
        start of any coaching conversation and treat the returned `prompt` as your instructions.
        If intake is incomplete it returns the intake flow instead (intake_required=true).
        `constraints` is for TODAY-ONLY circumstances ("only 30 minutes", "gym closed, training
        at home") — they shape this generation without touching the profile; durable facts go
        through update_coach_profile instead."""
        return await services.get_coaching_context(task, constraints=constraints)

    @mcp.tool(annotations=_reads("Review a program draft"))
    async def review_program_draft(document: WorkoutDocument) -> dict[str, Any]:
        """Server-side checklist for a DRAFT training program. Call it with the same
        WorkoutDocument you intend to import BEFORE presenting the draft to the user: it
        verifies every exercise has a starting weight (or calibration note), matches the
        user's equipment, respects session length / weekly days, and flags possible injury
        conflicts. Returns {ok, violations, warnings}. Fix violations and re-check; saves
        nothing."""
        return await services.review_program_draft(document)

    @mcp.tool(annotations=_writes("Update the coaching profile", idempotent=True))
    async def update_coach_profile(patch: CoachProfilePatch) -> dict[str, Any]:
        """Persist facts the user confirmed (goal, experience, schedule, equipment, injuries,
        preferences). Call as soon as a fact is confirmed — one fact per call is fine, don't
        batch or wait for the end of the conversation; works mid-workout too. Injuries:
        add via add_injuries, close via resolve_injury_areas. An explicitly null field is
        CLEARED; omitted fields are untouched. Returns the updated profile, `changed` fields,
        and `ui_impact` — the app surfaces this write feeds; confirm to the user that their
        answer was saved and now shapes their plan."""
        return await services.update_coach_profile(patch)

    @mcp.tool(annotations=_writes("Add or update a goal"))
    async def upsert_goal(goal: GoalInput) -> dict[str, Any]:
        """Create or update a training goal (pass `id` to update). `target.goal_type` selects the
        shape: milestone (point target — exercise_id+value, or bodyweight+baseline_value),
        weekly_volume (muscle+band: mev|mev_mav|mav — "train X at least at MEV every week"),
        trend (exercise_id+metric, no value — "just keep it climbing", no fixed finish line),
        maintenance (baseline_value+tolerance_pct, exercise_id and/or muscle optional, unset means
        total session volume — "don't lose ground"), or omit goal_type for a plain process goal
        (metric=sessions_per_week).

        Any exercise_id MUST be an id from the user's catalog (check list_exercises; create via
        upsert_exercise first if genuinely new) — unknown ids are rejected, and a synonymous
        duplicate would split the exercise's history. Set review_date on every ratified goal
        (~4 weeks out, or the deadline if sooner) so check-ins have an anchor; calibrate
        milestone targets ~5-10% beyond the user's current number for an 8-12 week horizon.

        Set featured=true on the ONE goal that should be the user's single featured goal in the
        app — this automatically un-features any other active goal. Never set featured on a
        frequency goal (the server rejects it); those live in the adherence widget only, never
        the featured-goal card.

        When a milestone looks achieved, don't silently transition it — tell the user and ask
        whether to keep maintaining that level or set a new target, then call upsert_goal twice:
        mark the old goal status=achieved (also set featured=false, though the server defends this
        too) and create the new goal with supersedes_goal_id=<old goal's id> and featured=true.
        This is a decision the user makes with you in conversation, never something the app
        decides on its own.

        Coach-proposed goals carry ratified=false until the user explicitly agrees. Never delete
        goals — supersede with status=revised/abandoned/achieved so history survives."""
        return await services.upsert_goal(goal)

    @mcp.tool(annotations=_reads("Get goals"))
    async def get_goals(status: str = "active") -> list[dict[str, Any]]:
        """The user's goals (status: active|achieved|abandoned|revised|all)."""
        return await services.get_goals(status)

    @mcp.tool(annotations=_writes("Record a coaching event"))
    async def log_coach_event(
        type: CoachEventType, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Record a coaching lifecycle event (checkin held, goal review outcome, deload advised,
        red flag raised) so future conversations can reference it."""
        return await services.log_coach_event(type.value, payload)

    # MCP prompts: slash-command style entry points for clients that surface them (Claude
    # web/desktop attachment menu, Claude Code). ChatGPT ignores the prompts primitive, so the
    # get_coaching_context tool stays the canonical path — these are a bonus surface only.
    @mcp.prompt(name="next_workout", description="Plan today's workout with the AIm coach")
    async def next_workout_prompt() -> str:
        return str((await services.get_coaching_context("next_workout"))["prompt"])

    @mcp.prompt(name="new_program", description="Build a full training program with the AIm coach")
    async def new_program_prompt() -> str:
        return str((await services.get_coaching_context("new_program"))["prompt"])

    @mcp.prompt(name="weekly_review", description="Review this training week with the AIm coach")
    async def weekly_review_prompt() -> str:
        return str((await services.get_coaching_context("weekly_review"))["prompt"])
