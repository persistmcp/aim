"""Business logic: open a scoped connection, call the repo, return JSON-safe data.

Thin orchestration between the MCP tools and the SQL layer. Every function scopes to the user
resolved from the URL token (via context.get_user_id).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from . import coach, landmarks, present, prompts, repo, stats
from . import email as email_service
from .context import get_user_id
from .db import connect
from .models import (
    BodyMetric,
    Equipment,
    Exercise,
    MuscleGroup,
    RepRange,
    Session,
    WorkoutDocument,
)
from .serialize import jsonable

# period keyword → lookback window in days (None = all time)
_PERIOD_DAYS = {"week": 7, "1m": 30, "month": 30, "3m": 90, "6m": 180, "year": 365, "all": None}


def _period_date_from(period: str | None) -> date | None:
    if not period:
        return None
    days = _PERIOD_DAYS.get(period.lower())
    return date.today() - timedelta(days=days) if days else None


def _week_start(today: date | None = None) -> date:
    """Monday of the current calendar week (weekday(): Monday == 0). The single definition of
    "this week" shared by the Home tiles, adherence, weekly goal history and the coaching prompts —
    the coach and the UI must never disagree on which days a week covers. The muscle-load panel is
    deliberately NOT one of them: it runs on a rolling window plus per-muscle decay
    (get_muscle_volume), because a calendar boundary blanked the whole heatmap every Monday.

    `today` is injectable so callers that already take an explicit date stay pure: _streak
    advertises itself as date-injectable, but reached this helper's `date.today()` through
    _weekly_volume_history, so its volume baseline silently followed the wall clock instead of
    the date it was handed."""
    today = today or date.today()
    return today - timedelta(days=today.weekday())


def _iso_week_key(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _last_n_week_starts(n: int, today: date | None = None) -> list[date]:
    """Mondays of the last n calendar weeks, oldest first, ending at the current week — reuses
    _week_start's Monday-start convention so a goal's weekly history never disagrees with the
    rest of the app about which days a week covers."""
    current = _week_start(today)
    return [current - timedelta(weeks=i) for i in range(n - 1, -1, -1)]


# A user who only logs workouts can go months without ever meeting the coach (the assistant
# only sees coaching when it calls get_coaching_context). log_session is the natural moment
# they're already talking about training, so the server piggybacks a one-line offer there —
# throttled, because a nag on every log would poison the main loop.
_NUDGE_EVENT = "coach_offered"
_NUDGE_COOLDOWN = timedelta(days=7)
_NUDGE_TEXTS = {
    "no_intake": (
        "Coaching note: this user has never met the coach (intake not complete). After "
        "confirming the log, offer once: a ~2-minute intake to co-create a goal and get a "
        "program built for their equipment. If they agree, call get_coaching_context with "
        "task='intake' and follow it. If they decline, drop the subject."
    ),
    "no_program": (
        "Coaching note: this user has no active training program. After confirming the log, "
        "offer once to build one from their history (if they agree, call get_coaching_context "
        "with task='new_program' and follow it). If they decline, drop the subject."
    ),
}


async def _coach_nudge(conn: repo.Conn, uid: str) -> str | None:
    """A throttled coach_hint for log_session, or None when coaching is already in place."""
    profile = await repo.ensure_coach_profile(conn, uid)
    if not coach.is_intake_complete(profile["intake_status"]):
        reason = "no_intake"
    elif await repo.get_active_program(conn, uid) is None:
        reason = "no_program"
    else:
        return None
    last = await repo.latest_coach_event(conn, uid, _NUDGE_EVENT)
    if last and datetime.now(UTC) - last["created_at"] < _NUDGE_COOLDOWN:
        return None
    await repo.insert_coach_event(conn, uid, _NUDGE_EVENT, {"reason": reason})
    return _NUDGE_TEXTS[reason]


async def log_session(session: Session) -> dict[str, Any]:
    uid = get_user_id()
    async with connect() as conn:
        # MCP clients retry on lost responses; when the model supplies an id, a re-log with the
        # same id replaces the earlier row (same idempotency as import) instead of duplicating
        # the workout.
        if session.id:
            await repo.delete_session_by_external_id(conn, uid, session.id)
        session_id = await repo.insert_session(conn, uid, session)
        inserted = await repo.get_session(conn, uid, session_id)
        assert inserted is not None  # just inserted in this same transaction
        result = jsonable(present.present_session(inserted))
        hint = await _coach_nudge(conn, uid)
        if hint:
            result["coach_hint"] = hint
        return result


async def update_session(session_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    uid = get_user_id()
    async with connect() as conn:
        row = await repo.update_session(conn, uid, session_id, patch)
        return jsonable(present.present_session(row)) if row else None


async def update_set(
    session_id: str, exercise_id: str, set_number: int, patch: dict[str, Any], occurrence: int = 1
) -> dict[str, Any] | None:
    uid = get_user_id()
    async with connect() as conn:
        row = await repo.update_set(
            conn, uid, session_id, exercise_id, set_number, patch, occurrence=occurrence
        )
        return jsonable(present.present_set(row)) if row else None


async def get_session(session_id: str) -> dict[str, Any] | None:
    uid = get_user_id()
    async with connect() as conn:
        row = await repo.get_session(conn, uid, session_id)
        return jsonable(present.present_session(row)) if row else None


async def list_sessions(
    date_from: date | None = None, date_to: date | None = None, limit: int = 50
) -> list[dict[str, Any]]:
    uid = get_user_id()
    limit = max(1, min(limit, 500))  # a stray limit=-1 must not reach Postgres
    async with connect() as conn:
        rows = await repo.list_sessions(
            conn, uid, date_from=date_from, date_to=date_to, limit=limit
        )
        return jsonable([present.present_session_summary(r) for r in rows])


async def delete_session(session_id: str) -> bool:
    uid = get_user_id()
    async with connect() as conn:
        return await repo.delete_session(conn, uid, session_id)


async def log_body_metric(metric: BodyMetric) -> dict[str, Any]:
    uid = get_user_id()
    async with connect() as conn:
        row = await repo.insert_body_metric(conn, uid, metric)
        return jsonable(present.present_body_metric(row))


async def get_body_metrics(limit: int = 100) -> list[dict[str, Any]]:
    uid = get_user_id()
    limit = max(1, min(limit, 500))
    async with connect() as conn:
        rows = await repo.list_body_metrics(conn, uid, limit=limit)
        return jsonable([present.present_body_metric(r) for r in rows])


async def _upsert_exercise_linked(conn: repo.Conn, uid: str, exercise: Exercise) -> dict[str, Any]:
    """Write an exercise, resolving its pool link and filling only what is empty on both sides.

    Shared by the MCP tool and by `import_document`, which used to call the repo directly and so
    silently skipped every rule below.
    """
    canonical = await repo.find_exercise_id_case_insensitive(
        conn, uid, exercise.id or exercise.name
    )
    if canonical is not None and canonical != (exercise.id or exercise.name):
        # "Bench_Press" and "bench_press" are one movement. Postgres compares the primary key
        # case-sensitively, so without this the second spelling forks the catalogue — and now that
        # the fork inherits full pool metadata it looks like a legitimate second identity rather
        # than an obviously empty stub.
        exercise = exercise.model_copy(update={"id": canonical})
    existing = await repo.get_exercise(conn, uid, exercise.id or exercise.name)
    if existing is None:
        slug = exercise.pool_slug or await _resolve_pool_link(conn, exercise)
    else:
        # For a row that already exists the link is never re-derived from its name. Only an
        # explicit `pool_slug` in the payload can change it — otherwise the stored one stands.
        slug = exercise.pool_slug or existing.get("pool_slug")
    if slug is not None:
        source = await repo.get_pool_exercises(conn, [slug])
        exercise = _merge_pool_defaults(exercise, source[0] if source else None, slug, existing)
    return await repo.upsert_exercise(conn, uid, exercise)


async def upsert_exercise(exercise: Exercise) -> dict[str, Any]:
    uid = get_user_id()
    async with connect() as conn:
        row = await _upsert_exercise_linked(conn, uid, exercise)
        return jsonable(present.present_exercise(row))


async def _resolve_pool_link(conn: repo.Conn, exercise: Exercise) -> str | None:
    """The pool slug this new exercise refers to, from its id first and its name second.

    Only ever consulted for a row that does not exist yet. `resolve_pool_slug` deliberately
    refuses generic names — "присед" must not silently become a barbell back squat.
    """
    for candidate in (exercise.id, exercise.name):
        if candidate and (slug := await repo.resolve_pool_slug(conn, candidate)):
            return slug
    return None


_EQUIPMENT_VALUES = frozenset(e.value for e in Equipment)
_MUSCLE_VALUES = frozenset(m.value for m in MuscleGroup)


# Fields the pool can supply, and where they live on the model.
_POOL_DEFAULTS = (
    "category",
    "movement_pattern",
    "primary_muscles",
    "secondary_muscles",
    "tertiary_muscles",
    "equipment",
    "is_unilateral",
    "long_length",
)


def _is_empty(value: Any) -> bool:
    return value is None or value == [] or value == ""


def _merge_pool_defaults(
    exercise: Exercise,
    source: dict[str, Any] | None,
    slug: str,
    existing: dict[str, Any] | None = None,
) -> Exercise:
    """Fill what the caller left out from the pool entry, and stamp the link.

    Two rules, and both are load-bearing:

    * A value the caller SENT always wins, including an explicitly empty list — a user tuning their
      own copy is exactly the case the pool must not override.
    * A value already STORED always wins too. Without this, a second call adding `instructions`
      reset a customised barbell-only bench back to the pool's `['barbell','bench']`, which is the
      overwrite the merge-upsert exists to prevent.

    What is left is the case this exists for: a field that is empty on both sides. That covers the
    first write of a brand-new exercise, and — the reason this function still runs on updates — a
    bare row auto-created by logging an ad-hoc name, which the coach later re-links by passing the
    pool slug. Gating the whole function on "row does not exist" left those rows linked but with no
    muscles at all, and `weekly_muscle_rows` inner-joins on exactly that metadata, so every set
    logged against them stayed invisible to the muscle panel.
    """
    update: dict[str, Any] = {"pool_slug": slug}
    stored = existing or {}

    def wanted(field: str, column: str | None = None) -> bool:
        return field not in exercise.model_fields_set and _is_empty(stored.get(column or field))

    if source is not None:
        for field in _POOL_DEFAULTS:
            if wanted(field) and source.get(field) is not None:
                update[field] = source[field]
        if wanted("default_rep_range", "default_rep_min") and source.get("default_rep_min"):
            update["default_rep_range"] = RepRange(
                min=source["default_rep_min"], max=source["default_rep_max"]
            )
        if wanted("default_rest_sec"):
            update["default_rest_sec"] = source.get("default_rest_sec")
    # Re-validate rather than model_copy: the pool stores plain strings ("compound", "chest") and
    # model_copy skips validation, which would hand the repo a str where it expects an enum.
    return Exercise(**{**exercise.model_dump(exclude_unset=True), **update})


async def list_exercises(
    muscle: str | None = None,
    equipment: str | None = None,
    movement_pattern: str | None = None,
    query: str | None = None,
    locale: str | None = None,
) -> list[dict[str, Any]]:
    uid = get_user_id()
    async with connect() as conn:
        rows = await repo.list_exercises(
            conn,
            uid,
            muscle=muscle,
            equipment=equipment,
            movement_pattern=movement_pattern,
            query=query,
        )
        # Technique text and images come from the pool when the user's own row has none. The row
        # itself stays untouched: `instructions` is one string with no locale, so storing a copy
        # would freeze the user into whichever language happened to be current at write time.
        linked = [r["pool_slug"] for r in rows if r.get("pool_slug")]
        pool = {p["slug"]: p for p in await repo.get_pool_exercises(conn, linked)}
    presented = []
    for row in rows:
        exercise = present.present_exercise(row)
        source = pool.get(row.get("pool_slug") or "") if not row.get("instructions") else None

        if source is not None:
            resolved = present.present_pool_exercise(source, locale=locale)
            exercise["instructions"] = resolved.get("instructions")
            exercise["instructions_source"] = "pool"
        linked_pool = pool.get(row.get("pool_slug") or "")
        if linked_pool is not None:
            # Illustrations live only in the pool — a user's own row has no picture of its own —
            # and the licence requires the credit to travel with them, so both cross together.
            if not exercise.get("image_url"):
                exercise["image_url"] = linked_pool.get("image_url")
                exercise["image_urls"] = linked_pool.get("image_urls") or []
                exercise["image_attribution"] = linked_pool.get("image_attribution")
                exercise["image_style"] = linked_pool.get("image_style")
            # Whether the rep range is reps, seconds or minutes. Without it here, a coach that
            # searched the pool once and comes back on day 2 to log "3 sets of plank" reads
            # `default_rep_min: 30` off this endpoint as thirty repetitions.
            exercise["dose_unit"] = linked_pool.get("dose_unit")
        presented.append(exercise)
    return jsonable(presented)


async def search_exercise_pool(
    muscle: str | None = None,
    equipment: list[str] | None = None,
    movement_pattern: str | None = None,
    category: str | None = None,
    query: str | None = None,
    limit: int = 40,
    locale: str | None = None,
) -> dict[str, Any]:
    """The curated global pool — what the coach should pick from before inventing an exercise.

    Returns the entries plus which of them the user has already trained, because "you have logged
    this one before" is the single most useful thing to know when choosing between two equivalent
    movements, and it saves a second round-trip to `list_exercises`.
    """
    uid = get_user_id()
    limit = max(1, min(limit, 100))
    # An unknown equipment word must not read as "nothing fits". `equipment=["resistance_bands"]`
    # (plural) matched no row and came back as an honest-looking empty result, so the coach could
    # tell the user there is no chest exercise for their kit when there is one.
    if muscle is not None and muscle not in _MUSCLE_VALUES:
        raise ValueError(f"unknown muscle {muscle!r}: use a value from {sorted(_MUSCLE_VALUES)}")
    unknown_equipment = [q for q in (equipment or []) if q not in _EQUIPMENT_VALUES]
    if unknown_equipment:
        raise ValueError(
            f"unknown equipment {unknown_equipment}: use values from "
            f"{sorted(_EQUIPMENT_VALUES)}. An empty list means the user has no equipment at all."
        )
    async with connect() as conn:
        rows = await repo.search_exercise_pool(
            conn,
            muscle=muscle,
            equipment=equipment,
            movement_pattern=movement_pattern,
            category=category,
            query=query,
            limit=limit,
        )
        known = await repo.list_exercises(conn, uid)
    trained = {r["pool_slug"] for r in known if r.get("pool_slug")}
    entries = []
    for row in rows:
        entry = present.present_pool_exercise(row, locale=locale)
        entry["in_user_catalog"] = row["slug"] in trained
        entries.append(entry)
    return jsonable(
        {
            "exercises": entries,
            "count": len(entries),
            "usage": (
                "Reuse `slug` verbatim as the exercise_id when you write a program, a session or a "
                "goal. Only invent your own exercise when nothing here fits."
            ),
        }
    )


async def get_stats(
    kind: str, exercise_id: str | None = None, date_from: date | None = None
) -> dict[str, Any]:
    """kind: 'progression' (needs exercise_id) | 'volume' | 'prs' (needs exercise_id)."""
    uid = get_user_id()
    async with connect() as conn:
        if kind in ("progression", "prs"):
            if not exercise_id:
                # The message is read by an LLM that just made this mistake — say what to do next,
                # not only what was wrong. ("exercise_id is required for this kind" was 4 of the
                # 7 get_stats calls on the demo account.)
                raise ValueError(
                    f"exercise_id is required for kind='{kind}' (it reports on one exercise). "
                    "Pick an id from list_exercises, or call kind='volume' for overall training "
                    "volume."
                )
            rows = await repo.sets_for_exercise(conn, uid, exercise_id)
            prs = stats.detect_prs(rows)
            if kind == "prs":
                return jsonable({"exercise_id": exercise_id, "prs": prs})
            points = stats.exercise_progression(rows)
            return jsonable(
                {
                    "exercise_id": exercise_id,
                    "progression": points,
                    "prs": prs,
                    # Trend on estimated 1RM, not raw top weight: for hypertrophy work the
                    # weight often plateaus while reps (and est-1RM) climb, so top-weight reads 0.
                    "trend_pct": stats.trend_pct([p["best_est_1rm"] for p in points]),
                    "top_weight_trend_pct": stats.trend_pct([p["top_weight"] for p in points]),
                }
            )
        if kind == "volume":
            rows = await repo.session_volumes(conn, uid, date_from=date_from)
            return jsonable(stats.volume_over_time(rows))
        raise ValueError(f"unknown stats kind: {kind!r}")


async def get_me() -> dict[str, Any]:
    """User profile + current weight/body-fat + active program name (Home greeting)."""
    uid = get_user_id()
    async with connect() as conn:
        # First authenticated load of the magic link confirms email ownership.
        await repo.mark_email_verified(conn, uid)
        user = await repo.get_user(conn, uid) or {}
        latest = await repo.list_body_metrics(conn, uid, limit=1)
        program = await repo.get_active_program(conn, uid)
        coaching = await repo.coach_state(conn, uid)
    latest_bm = latest[0] if latest else {}
    return jsonable(
        {
            # Stable pseudonymous id for analytics (posthog.identify) — never the token.
            "id": uid,
            "name": user.get("name"),
            "timezone": user.get("timezone"),
            "goals": coaching["goal_titles"],
            "program": program.get("name") if program else None,
            "current_weight": latest_bm.get("bodyweight_kg") or user.get("bodyweight_kg"),
            "current_body_fat": latest_bm.get("body_fat_pct") or user.get("body_fat_pct"),
            "intake_status": coaching["intake_status"],
            "next_review_date": coaching["next_review_date"],
        }
    )


async def get_summary() -> dict[str, Any]:
    """Home hero: this-week workout count, volume + % vs prior week, latest bodyweight."""
    uid = get_user_id()
    async with connect() as conn:
        vols = await repo.session_volumes(conn, uid)
        latest = await repo.list_body_metrics(conn, uid, limit=1)
        user = await repo.get_user(conn, uid) or {}
    # Calendar week, Mon–Sun, not a rolling 7-day window.
    week_start = _week_start()
    prev_start = week_start - timedelta(days=7)
    this_week = [v for v in vols if v["date"] >= week_start]
    prev_week = [v for v in vols if prev_start <= v["date"] < week_start]
    tv = sum(float(v["volume_kg"] or 0) for v in this_week)
    pv = sum(float(v["volume_kg"] or 0) for v in prev_week)
    return jsonable(
        {
            "workouts_this_week": len(this_week),
            "volume_this_week": round(tv, 1),
            "volume_change_pct": round((tv - pv) / pv * 100, 1) if pv else None,
            # Fall back to the intake-profile weight: a user who told the coach their weight but
            # never logged a body metric must still see it on the Home tile (same as get_me).
            "bodyweight": (latest[0]["bodyweight_kg"] if latest else None)
            or user.get("bodyweight_kg"),
        }
    )


# --- goal-aware dashboard config (COACHING_PLAN.md §8) ------------------------------------------
#
# Per-goal Home tile/module selection (§8.2 table). `endurance` deliberately falls back to the
# default set rather than the spec's cardio_min_week/distance_week tiles and cardio_stats module:
# cardio_activities is stored but never aggregated, and §8.3 says that work ships "only if an
# endurance user exists" — no speculative building. Revisit together when it does.
_DEFAULT_TILES = ["workouts_week", "volume_week", "bodyweight"]
_DEFAULT_MODULES = ["program", "muscle_load"]

_GOAL_TILES: dict[str, list[str]] = {
    "hypertrophy": ["workouts_week", "volume_week", "bodyweight"],
    "strength": ["workouts_week", "top_e1rm", "bodyweight"],
    "fat_loss": ["bodyweight_delta_30d", "workouts_week", "volume_week"],
    "general_health": ["workouts_week", "volume_week", "bodyweight"],
}
# Module ORDER within each set is part of the product: adherence sits right after the goal card
# (owner call 2026-07-22 — training regularity is the behavioral lever behind every goal and was
# getting buried below the program at the bottom of Home), and always before "program".
_GOAL_MODULES: dict[str, list[str]] = {
    "hypertrophy": ["goal_progress", "adherence", "muscle_load", "program", "volume_trend"],
    "strength": ["goal_progress", "adherence", "strength_progression", "program", "muscle_load"],
    # "program" was missing from COACHING_PLAN.md §8.2's own fat_loss row — every other wired
    # goal keeps it, and a real user should never lose their program off Home just because their
    # goal is fat_loss. Fixed here rather than in the design doc since the doc's intent (matching
    # every other goal) is clear; COACHING_PLAN.md needs a follow-up correction to match.
    # "volume_maintenance" (§8.2's own auto-banner idea) deliberately never landed as a separate
    # module: an always-on banner derived purely from primary_goal=fat_loss is exactly the
    # app-decides-not-the-coach behavior the goal taxonomy rules out (2026-07-18) — a fat_loss
    # user gets the same protection through the coach proposing a `maintenance`-type goal
    # (task.intake nudges this), rendered through the same goal_progress slot as everything else.
    "fat_loss": [
        "goal_progress",
        "bodyweight_trend",
        "adherence",
        "program",
        "muscle_load",
    ],
    "general_health": ["adherence", "program", "muscle_load"],
}


def _present_goal_with_type(row: dict[str, Any]) -> dict[str, Any]:
    """present_goal plus the inferred goal_type (coach.infer_goal_type) — every goal a client
    sees carries this, so the frontend never re-implements the legacy-metric inference."""
    presented = present.present_goal(row)
    presented["goal_type"] = coach.infer_goal_type(row.get("target"))
    return presented


def _goal_progress(
    goal: dict[str, Any],
    *,
    progressions: dict[str, list[dict[str, Any]]],
    bodyweight: float | None,
    sessions_this_week: int,
) -> dict[str, Any]:
    """Attach server-computed `current`/`progress_pct` to a goal per its `target.metric`
    (COACHING_PLAN.md §8.2 GoalProgress cards) — the cheap path, run for every active goal.
    Unquantifiable or unrecognized metrics — and quantifiable ones missing the data they need (no
    exercise_id, no baseline_value) — come back with `current`/`progress_pct` both null; the UI
    renders those as title-only, no bar, rather than fabricate a percentage from data that isn't
    there. Also attaches a `progress` envelope (`{"type": "bar", "pct": ...}` or null) — the same
    shape richer goal types use (see _featured_goal_progress), so a consumer that only cares about
    "is there a bar" doesn't need to know about `progress_pct` specifically."""
    target = goal.get("target") or {}
    metric = target.get("metric")
    value = target.get("value")
    current: float | None = None
    progress_pct: int | None = None

    if metric == "sessions_per_week":
        current = float(sessions_this_week)
        if value:
            progress_pct = max(0, min(100, round(current / value * 100)))
    elif metric == "bodyweight":
        current = bodyweight
        baseline = target.get("baseline_value")
        if current is not None and value is not None and baseline is not None and baseline != value:
            progress_pct = max(0, min(100, round((baseline - current) / (baseline - value) * 100)))
    elif metric in ("e1rm", "weight", "reps") and target.get("exercise_id"):
        points = progressions.get(target["exercise_id"]) or []
        if points:
            last = points[-1]
            current = {
                "e1rm": last["best_est_1rm"],
                "weight": last["top_weight"],
                "reps": last["total_reps"],
            }[metric]
            if current is not None and value:
                progress_pct = max(0, min(100, round(current / value * 100)))

    progress = {"type": "bar", "pct": progress_pct} if progress_pct is not None else None
    return {**goal, "current": current, "progress_pct": progress_pct, "progress": progress}


def _weekly_muscle_history(
    rows: list[dict[str, Any]], muscle: str, band: str, *, weeks: int
) -> list[dict[str, Any]]:
    """Bucket weekly_muscle_rows (reps/primary_muscles/secondary_muscles/date) by ISO week and
    classify each week's set count for `muscle` against its MEV/MAV (landmarks.status_for).
    Zero-fills a week with no matching rows — a missed week renders as a real 0, never silently
    skipped, and never breaks a "streak" (there isn't one; see the product's explicit rejection of
    streak framing). Oldest week first."""
    week_starts = _last_n_week_starts(weeks)
    by_week: dict[str, list[dict[str, Any]]] = {_iso_week_key(w): [] for w in week_starts}
    for r in rows:
        key = _iso_week_key(r["date"])
        if key in by_week:
            by_week[key].append(r)
    out = []
    for w in week_starts:
        key = _iso_week_key(w)
        load = stats.weekly_muscle_load(by_week[key])
        # Direct sets, like the coaching payload and the detail sheet: MEV/MAV are published in
        # direct hard sets, and the assistance-inclusive tally read a goal as met off synergist
        # work alone.
        sets = next((m["hard_sets"] for m in load["muscles"] if m["muscle"] == muscle), 0.0)
        out.append({"week": key, "sets": sets, "status": landmarks.status_for(muscle, sets, band)})
    return out


def _weekly_volume_history(
    rows: list[dict[str, Any]], *, weeks: int, today: date | None = None
) -> list[dict[str, Any]]:
    """Bucket session_volumes rows ({date, volume_kg}) by ISO week, zero-filled — same shape as
    _weekly_muscle_history, for a maintenance goal with no exercise_id/muscle (total volume)."""
    week_starts = _last_n_week_starts(weeks, today)
    by_week: dict[str, float] = {_iso_week_key(w): 0.0 for w in week_starts}
    for r in rows:
        key = _iso_week_key(r["date"])
        if key in by_week:
            by_week[key] += float(r["volume_kg"] or 0)
    return [
        {"week": _iso_week_key(w), "value": round(by_week[_iso_week_key(w)], 1)}
        for w in week_starts
    ]


# Consistency-flame level bands: lower bounds on the fuel score (see _streak) for levels 2..6;
# below the first bound is level 1. The score is normalized so that 1.0 means "you are holding
# your own rhythm", whatever that rhythm is — a 2x/week and a 6x/week trainee both sit pinned at
# the top while on plan. The vector is unchanged from the 2026-08-09 recut and its reasoning still
# holds: five evenly-spaced bounds at 0.86/5 = 0.172, wide enough that every level is reachable at
# every cadence, with no narrow band sitting on the mode of a stationary user.
_STREAK_BANDS = (0.17, 0.34, 0.51, 0.68, 0.86)

# --- the fuel gauge -----------------------------------------------------------------------
# Every session is a log on the fire; the fire decays every day. Both the per-session gain and the
# decay rate derive from the user's OWN cadence, which is what lets one scale serve a 1x/week and
# a 7x/week trainee. Replaces the ratio-of-windows model on 2026-08-29 (docs/FLAME_REDESIGN_PLAN.md)
# because that model had three defects that a band recut cannot reach (the model itself is
# specified in docs/CONSISTENCY_FLAME.md):
#
#   1. Its baseline was the user's own trailing average, and a stationary process divided by its
#      own mean is 1 by construction — so ANY steady rate read as the top band, including one
#      session per fortnight, forever. Making the windows disjoint does not fix this; removing
#      behaviour from the denominator does.
#   2. The 84-day baseline CONTAINED the 28-day window it judged, so idling shrank numerator and
#      denominator together and the level could RISE while the user did nothing. It did exactly
#      that in production on 2026-08-27.
#   3. The ratio was unbounded above the top band, so a user training above their own plan banked
#      invisible credit and the first days of a layoff cost nothing at all.
#
# The half-life is a HABIT constant, not a physiological one, and the difference matters: a 10-day
# layoff costs a trained lifter almost nothing in strength (detraining reviews put meaningful
# strength loss past ~4 weeks), so a physiologically-scaled flame would barely move — which is the
# complaint that started this. The flame measures whether the habit is being kept, and is
# deliberately far more sensitive than the body is. Do not "correct" it toward detraining rates.
#
# Because the half-life is a fixed number of expected intervals, the decay across one interval is
# the same for everyone (2**(-1/3)), which makes the gain and the cap plain constants:
_FUEL_HALF_LIFE_INTERVALS = 3.0  # the fire halves for every three missed expected sessions
_FUEL_GAIN = 2 ** (1 / 3) - 1  # 0.2599 of a full fire per session, at any cadence
# Clipping the STORE, not just the published score, is what makes grace exactly one expected
# interval for everyone — a 3x/week trainee is not "slipping" on day 2, a 6x/week trainee is not
# slipping on day 1 — and it is what stops out-training your own plan from banking credit.
_FUEL_CAP = 2 ** (1 / 3)  # steady state saws between 1.0 (trough) and this

# Volume deliberately plays NO part in the score (removed 2026-08-29). It used to cap the level
# down when recent tonnage cratered against the user's own median, and the idea is defensible —
# "showed up but did a quarter of the work" is real — but the implementation could not be made
# honest. The baseline is a median over a window of the user's own recent weeks, so it always
# drifts onto whatever the user is doing now: a permanent halving read as capped for two months
# and then released with a TWO-LEVEL JUMP (level 4 -> 6 on day 63, verified). Moving the window to
# be disjoint from the scored one only moved the jump from week 7 to week 9. Worse, the cap was a
# sliding today-anchored comparison, so it could flip in either direction on a day with no
# training: fuzzing 200 random histories with realistic volume spread found 329 days where the
# LEVEL ROSE WHILE THE USER DID NOTHING — the exact defect this whole rework exists to remove,
# reintroduced through a side door. The old unit test missed it only because every session it
# built carried an identical volume.
# It never once executed on a real user: the branch required 84 days of history and no account
# reached that until 2026-08-27. So nothing is lost by removing it, the flame is a REGULARITY
# instrument and stays one, and a real volume decline is something the coach should say out loud
# in the weekly review — where the actual numbers are — rather than something that silently
# subtracts from a number the user cannot decompose.
_STREAK_WINDOW_DAYS = 28  # only the card's 4-week count and the cadence baseline's offset
_RATE_BASELINE_DAYS = 84  # behavioural cadence is read from the 8 weeks BEFORE that window
_RATE_MIN_BASELINE_DAYS = 14  # shortest disjoint span we will estimate a cadence from
# How far back callers must fetch for the flame to be exact. The fuel store never fully forgets a
# session, so a short fetch silently truncates it; at 1x/week (half-life 21 days) 180 days leaves
# a residue of 0.003 of score, against a band width of 0.172.
_STREAK_FETCH_DAYS = 180


def _own_cadence(
    training_days: set[date],
    *,
    anchor: date,
    first_session: date,
    fetched_from: date | None = None,
) -> float | None:
    """The user's own sessions/week, measured over the 8 weeks BEFORE the scoring window.

    Disjoint from the window on purpose (defect 2 above), and `anchor` is the user's LAST TRAINING
    DAY rather than today: during a layoff a today-anchored window slides forward, the estimate
    decays, and a shrinking denominator makes the score climb while the user does nothing — the
    same bug in a new place. Anchoring at the last active day freezes the cadence for the whole
    layoff."""
    history = (anchor - first_session).days + 1
    span = min(_RATE_BASELINE_DAYS, history) - _STREAK_WINDOW_DAYS
    if span < _RATE_MIN_BASELINE_DAYS:
        return None
    hi = anchor - timedelta(days=_STREAK_WINDOW_DAYS)
    lo = hi - timedelta(days=span - 1)
    if fetched_from is not None and lo < fetched_from:
        # The window runs off the front of the rows we were given, so what we would count is a
        # truncation, not a cadence. Measuring it anyway is not merely imprecise — it is the
        # rise-while-idle defect all over again: during a long layoff the anchor stops moving, the
        # window slides off the fetched range, the count collapses, the inferred interval and with
        # it the half-life balloon, and the fire decays SLOWER every day. On a real 2x/week history
        # with no stated target the level climbed 1 -> 3 -> 4 across days 140-150 of doing nothing,
        # then vanished to null on day 160. Refuse to guess instead.
        return None
    trained = sum(1 for d in training_days if lo <= d <= hi)
    return (trained / (span / 7)) if trained else None


def _local_today(user: dict[str, Any] | None, client_date: date | None) -> date:
    """The date the USER is living in, not the one the server is.

    The flame turns "days since you trained" straight into a score, and the server runs in UTC, so
    east of UTC the session someone logs in the evening carries tomorrow's date as far as the
    server is concerned and the `<= today` guard drops it — the flame ignores the workout they
    just finished. The muscle panel on the same screen already solved this with `_client_date`;
    the flame simply never got it.

    Two sources, in order of trust: the caller's own clock (the web app sends `?today=`, already
    clamped to +/-2 days in api._client_date), then the timezone stored on the user, which is all
    the MCP path has because a coaching call arrives with no browser attached. Falling back to the
    server's UTC date is the last resort and is what everyone got before this."""
    if client_date is not None:
        return client_date
    tz_name = (user or {}).get("timezone")
    if tz_name:
        try:
            return datetime.now(ZoneInfo(tz_name)).date()
        except (ZoneInfoNotFoundError, ValueError):
            pass  # a garbage timezone must never 500 a dashboard
    return date.today()


def _streak(
    vols: list[dict[str, Any]],
    *,
    first_session: date | None,
    training_days_per_week: int | None,
    today: date,
    fetched_from: date | None = None,
) -> dict[str, Any]:
    """Consistency level 0-6 as a fuel gauge: each training day adds `_FUEL_GAIN`, the store
    decays continuously with a half-life of three of the user's own expected intervals, and the
    published score is the store clipped at 1.0.

    This remains an evolution of COACHING_PLAN.md §2.2's rejection of streaks, not a reversal of
    it: there is no chain, nothing resets, a single missed day costs less than one band, and one
    session back is worth a full band at every cadence (five sessions take a cold fire to full,
    identically at 2x and 6x per week). What changed on 2026-08-29 is that the scale is now
    responsive and monotone — it CANNOT rise on a day without training — which the ratio model was
    not. The ~14% tolerance from 2026-08-09 ("one missed session in four weeks still holds the top
    band") is deliberately withdrawn; see docs/FLAME_REDESIGN_PLAN.md §6.

    Cadence `r` is `max(stated intake target, own behaviour over the 8 weeks before the window)`.
    The max is load-bearing in both directions: behaviour alone is degenerate (a stationary user
    always scores 1.0 against their own mean), and a stale, under-stated intake target alone would
    let an over-trainer max the scale for free. Neither available -> "insufficient_data".

    Distinct training DAYS, never session rows: a coach that splits one day into a morning and an
    evening row would otherwise double the score. Future-dated rows are excluded — nothing
    constrains a session's date to the past, and "log my sessions for next week" writes real
    rows."""
    if first_session is None:
        return {"level": None, "basis": "insufficient_data"}

    # No minimum history. The ratio model needed a span to divide by, so it withheld the flame for
    # the first 7 days — which meant a brand-new user, the one person most worth encouraging, saw
    # nothing at all on the screen they had just signed up for. A fuel gauge needs no span: the
    # first session is worth _FUEL_GAIN and lights the fire at level 2, the second takes it to 3,
    # and five take a cold fire to full at any cadence. The only remaining null is "we cannot know
    # your rhythm yet" (no stated target and too little history to infer one), which is a real
    # gap in knowledge rather than an arbitrary waiting period.
    training_days = {v["date"] for v in vols if v["date"] <= today}
    stated = float(training_days_per_week) if training_days_per_week else None
    if stated is not None and stated <= 0:
        stated = None

    if not training_days:
        # History exists but nothing landed in the fetched range: the fire is out. A statement
        # about now, and NOT the same as "we have not seen you yet".
        return {
            "level": 0,
            "basis": "stated_target" if stated else "insufficient_data",
            "heat": 0.0,
        }

    anchor = max(training_days)
    behavioural = _own_cadence(
        training_days, anchor=anchor, first_session=first_session, fetched_from=fetched_from
    )
    candidates = [c for c in (stated, behavioural) if c]
    if not candidates:
        # No stated target and no measurable cadence. Two very different people land here, and the
        # difference is how long ago they last trained: someone brand new whose rhythm we genuinely
        # do not know (null — Home falls back to the tile grid), and someone whose baseline window
        # has run off the end of their data because they have been gone for months. The second
        # needs no cadence to answer honestly: at ANY plausible rhythm the fire is out. Returning
        # null there would make the flame VANISH from a user who had a level yesterday.
        if (today - anchor).days >= _RATE_BASELINE_DAYS - _STREAK_WINDOW_DAYS:
            return {"level": 0, "basis": "insufficient_data", "heat": 0.0}
        return {"level": None, "basis": "insufficient_data"}
    rate = max(candidates)
    basis = (
        "behavioral"
        if behavioural is not None and behavioural >= (stated or 0)
        else "stated_target"
    )

    interval = 7.0 / rate
    decay_per_day = 0.5 ** (1.0 / (_FUEL_HALF_LIFE_INTERVALS * interval))
    fuel = 0.0
    previous: date | None = None
    for day in sorted(training_days):  # over sessions, not days: O(sessions), ~1ms at 3 years
        if previous is not None:
            fuel *= decay_per_day ** (day - previous).days
        fuel = min(fuel + _FUEL_GAIN, _FUEL_CAP)
        previous = day
    assert previous is not None
    fuel *= decay_per_day ** (today - previous).days
    score = min(fuel, 1.0)

    level = 1 + sum(1 for bound in _STREAK_BANDS if score >= bound)  # 1..6
    # "heat" is the same score kept continuous instead of banded: a fractional level running 1->7
    # piecewise-linearly through the exact _STREAK_BANDS boundaries, normalized to 0..1. The flame
    # renders from this, growing a little with every session instead of jumping once per band.
    #
    # The top band gets its own segment (0.86 -> 1.0) and the normalizer is 7, not 6. Without that
    # segment every score from 0.86 to 1.0 published heat exactly 1.0 — 14% of the scale rendered
    # at zero pixels — and since one flame level is worth ~3.4px, a once-a-week trainee watched a
    # real, monotone decline render as five consecutive days of identical pixels. That was half of
    # the complaint the 2026-08-29 rework was for, and no change to the score could have fixed it.
    # floor(fractional) == level still holds exactly; the PUBLISHED heat is rounded to 3 decimals,
    # so at a band edge it can sit a hair either side — render from it, never re-derive the level
    # from it (that is what `level` is for).
    fractional = float(level)
    segments = [0.0, *_STREAK_BANDS, 1.0]
    lo, hi = segments[level - 1], segments[level]
    # Clamped below 1.0: at a boundary, float division can return exactly 1.0 and carry
    # `fractional` into the next integer while `level` stays put.
    fractional += min((score - lo) / (hi - lo), 0.999999)
    return {"level": level, "basis": basis, "heat": round(fractional / 7, 3)}


def _maintenance_current(weekly_values: Iterable[float]) -> float | None:
    """The value a week-bucketed maintenance goal is judged on: the better of the current
    (in-progress) week and the last completed one. The history buckets end at the current ISO
    week, so judging its raw last entry against a full-week baseline flags a spurious ~100% drop
    every Monday morning — the week isn't under target, it just hasn't happened yet. The last
    completed week is the latest full measurement; the in-progress week can only improve the
    reading (already back above the floor mid-week → say so now), never count against it."""
    values = list(weekly_values)
    if not values:
        return None
    return max(values[-1], values[-2]) if len(values) >= 2 else values[-1]


def _featured_goal_progress(
    goal: dict[str, Any],
    *,
    progressions: dict[str, list[dict[str, Any]]],
    weekly_muscle_rows: list[dict[str, Any]] | None,
    session_volume_rows: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    """Rich, type-specific progress for the ONE featured goal — never called for anything else,
    which is what keeps /api/profile cheap regardless of how many past goals a user has
    accumulated. Returns None for milestone/frequency (already covered by _goal_progress's cheap
    `progress` envelope) or when the type-required data is missing (never fabricates a reading)."""
    target = goal.get("target") or {}
    goal_type = coach.infer_goal_type(target)

    if goal_type == coach.GoalType.weekly_volume:
        muscle = target.get("muscle")
        if not muscle or weekly_muscle_rows is None:
            return None
        band = target.get("band") or coach.GoalTargetBand.mev
        history = _weekly_muscle_history(weekly_muscle_rows, muscle, band, weeks=6)
        latest_week = history[-1]
        return {
            "type": "weekly_bands",
            "muscle": muscle,
            "band": band,
            "current_status": latest_week["status"],
            "current_sets": latest_week["sets"],
            "landmark": landmarks.landmarks_for(muscle),
            "history": history,
        }

    if goal_type == coach.GoalType.trend:
        exercise_id = target.get("exercise_id")
        metric = target.get("metric")
        if not exercise_id or metric not in ("e1rm", "weight"):
            return None
        points = progressions.get(exercise_id) or []
        if len(points) < 2:
            return None
        key = "best_est_1rm" if metric == "e1rm" else "top_weight"
        series = [{"date": p["date"], "value": p[key]} for p in points[-12:]]
        trend_pct = stats.trend_pct([p["value"] for p in series])
        direction = None
        if trend_pct is not None:
            direction = "up" if trend_pct > 2 else "down" if trend_pct < -2 else "flat"
        return {
            "type": "trend",
            "metric": metric,
            "exercise_id": exercise_id,
            "direction": direction,
            "trend_pct": trend_pct,
            "series": series,
        }

    if goal_type == coach.GoalType.maintenance:
        baseline = target.get("baseline_value")
        if baseline is None:
            return None
        tolerance_pct = target.get("tolerance_pct")
        if tolerance_pct is None:
            tolerance_pct = 20.0
        exercise_id = target.get("exercise_id")
        muscle = target.get("muscle")
        maint_current: float | None
        maint_series: list[dict[str, Any]]
        if exercise_id:
            metric = target.get("metric") or "e1rm"
            points = progressions.get(exercise_id) or []
            if not points:
                return None
            key = "best_est_1rm" if metric == "e1rm" else "top_weight"
            maint_series = [{"date": p["date"], "value": p[key]} for p in points[-8:]]
            maint_current = maint_series[-1]["value"] if maint_series else None
        elif muscle:
            if weekly_muscle_rows is None:
                return None
            history = _weekly_muscle_history(
                weekly_muscle_rows, muscle, coach.GoalTargetBand.mev, weeks=5
            )
            maint_series = [{"date": h["week"], "value": h["sets"]} for h in history]
            maint_current = _maintenance_current(s["value"] for s in maint_series)
        else:
            if session_volume_rows is None:
                return None
            history_vol = _weekly_volume_history(session_volume_rows, weeks=5)
            maint_series = [{"date": h["week"], "value": h["value"]} for h in history_vol]
            maint_current = _maintenance_current(s["value"] for s in maint_series)
        if maint_current is None or not baseline:
            return None
        drop_pct = max(0.0, (baseline - maint_current) / baseline * 100)
        return {
            "type": "tolerance",
            "baseline": baseline,
            "current": round(maint_current, 1),
            "tolerance_pct": tolerance_pct,
            "drop_pct": round(drop_pct, 1),
            "status": "warn" if drop_pct > tolerance_pct else "ok",
            "series": maint_series,
        }

    return None  # milestone/frequency — already covered by the cheap path


async def get_profile(today: date | None = None) -> dict[str, Any]:
    """Derived, goal-aware dashboard config (COACHING_PLAN.md §8.1): what the coach conversation
    has told the profile drives what Home/Progress show, computed fresh server-side every call —
    nothing here is stored, so the tile/module mapping can evolve without a migration. Pre-intake
    (no coach_profile row yet) degrades to the original fixed layout, not an empty/broken one.

    `today` is the caller's own date (api._client_date); without one the user's stored timezone
    decides, and only then the server's UTC clock. See _local_today."""
    uid = get_user_id()
    async with connect() as conn:
        today = _local_today(await repo.get_user(conn, uid), today)
        profile = await repo.get_coach_profile(conn, uid)
        goals = await repo.list_user_goals(conn, uid, status="active")
        # One fetch covers both consumers: the flame (which needs the 8-week cadence baseline
        # sitting BEHIND the 4-week window, plus enough tail that the decayed fuel is exact) and
        # this week's session count, sliced below. 180 days rather than 90: the fuel store keeps a
        # residue of every past session, and at the slowest cadence a 90-day cut-off left ~0.06 of
        # score on the table, which is a third of a band. Still cheap rows, still SQL-bounded.
        streak_from = min(_last_n_week_starts(13)[0], today - timedelta(days=_STREAK_FETCH_DAYS))
        vols = await repo.session_volumes(conn, uid, date_from=streak_from)
        first_session = await repo.first_session_date(conn, uid)
        # Enough history to find a ~30-day-old bodyweight reading for the fat-loss delta tile.
        recent_bm = await repo.list_body_metrics(conn, uid, limit=60)

        # The one goal the app shows prominently — set only by the coach, in conversation
        # (repo.upsert_user_goal enforces "at most one"). None until the coach engages with it.
        featured_row = next((g for g in goals if g.get("featured")), None)
        featured_type = coach.infer_goal_type(featured_row["target"]) if featured_row else None
        featured_target = (featured_row or {}).get("target") or {}

        exercise_ids = {
            g["target"]["exercise_id"]
            for g in goals
            if (g.get("target") or {}).get("exercise_id")
            and (g["target"].get("metric")) in ("e1rm", "weight", "reps")
        }
        # Widen for the featured goal's rich path only (trend/maintenance goals track an exercise
        # too, just without a fixed target value) — never for every goal, that's what keeps this
        # endpoint cheap regardless of goal-history size.
        if featured_type in (
            coach.GoalType.trend,
            coach.GoalType.maintenance,
        ) and featured_target.get("exercise_id"):
            exercise_ids.add(featured_target["exercise_id"])
        progressions = {}
        for ex_id in exercise_ids:
            rows = await repo.sets_for_exercise(conn, uid, ex_id)
            progressions[ex_id] = stats.exercise_progression(rows)

        weekly_muscle_rows_for_featured = None
        session_volume_rows_for_featured = None
        if featured_type == coach.GoalType.weekly_volume or (
            featured_type == coach.GoalType.maintenance and featured_target.get("muscle")
        ):
            weekly_muscle_rows_for_featured = await repo.weekly_muscle_rows(
                conn, uid, date_from=_last_n_week_starts(6)[0]
            )
        elif (
            featured_type == coach.GoalType.maintenance
            and not featured_target.get("exercise_id")
            and not featured_target.get("muscle")
        ):
            session_volume_rows_for_featured = await repo.session_volumes(
                conn, uid, date_from=_last_n_week_starts(5)[0]
            )

    primary_goal: str | None = (profile or {}).get("primary_goal")
    # vols now spans the streak's 90-day window — slice this week back out for the tile count.
    sessions_this_week = len([v for v in vols if v["date"] >= _week_start(today)])
    # bodyweight_kg is a Postgres `numeric` column (decoded as Decimal by psycopg) — float() it
    # before any arithmetic, same convention as volume_kg elsewhere in this file, or mixing it
    # with the plain float/int values parsed out of a goal's jsonb `target` raises TypeError.
    latest_bw = recent_bm[0]["bodyweight_kg"] if recent_bm else None
    bodyweight = float(latest_bw) if latest_bw is not None else None

    goals_out = [
        _goal_progress(
            _present_goal_with_type(g),
            progressions=progressions,
            bodyweight=bodyweight,
            sessions_this_week=sessions_this_week,
        )
        for g in goals
    ]

    featured_goal_out = None
    if featured_row is not None:
        cheap = _goal_progress(
            _present_goal_with_type(featured_row),
            progressions=progressions,
            bodyweight=bodyweight,
            sessions_this_week=sessions_this_week,
        )
        rich = _featured_goal_progress(
            featured_row,
            progressions=progressions,
            weekly_muscle_rows=weekly_muscle_rows_for_featured,
            session_volume_rows=session_volume_rows_for_featured,
        )
        featured_goal_out = {**cheap, "progress": rich or cheap.get("progress")}

    # top_e1rm / bodyweight_delta_30d: computed here, not left for the frontend to re-derive,
    # because "which lift is tracked" is exactly the ambiguity goal_progress already resolved.
    top_e1rm = next(
        (
            g["current"]
            for g in goals_out
            if (g.get("target") or {}).get("metric") in ("e1rm", "weight")
            and g["current"] is not None
        ),
        None,
    )
    bodyweight_delta_30d = None
    if bodyweight is not None:
        cutoff = today - timedelta(days=30)
        older = [
            float(m["bodyweight_kg"])
            for m in recent_bm
            if m["bodyweight_kg"] is not None and m["date"] <= cutoff
        ]
        if older:
            bodyweight_delta_30d = round(bodyweight - older[0], 1)

    return jsonable(
        {
            "intake_status": (profile or {}).get("intake_status") or coach.IntakeStatus.not_started,
            "primary_goal": primary_goal,
            "locations": (profile or {}).get("locations") or [],
            "training_days_per_week": (profile or {}).get("training_days_per_week"),
            "focus_muscles": (profile or {}).get("focus_muscles") or [],
            "tiles": _GOAL_TILES.get(primary_goal, _DEFAULT_TILES)
            if primary_goal
            else _DEFAULT_TILES,
            "modules": _GOAL_MODULES.get(primary_goal, _DEFAULT_MODULES)
            if primary_goal
            else _DEFAULT_MODULES,
            "metrics": {
                "top_e1rm": top_e1rm,
                "bodyweight_delta_30d": bodyweight_delta_30d,
            },
            "goals": goals_out,
            "featured_goal": featured_goal_out,
            "streak": _streak(
                vols,
                first_session=first_session,
                training_days_per_week=(profile or {}).get("training_days_per_week"),
                today=today,
                fetched_from=streak_from,
            ),
        }
    )


async def export_document(
    date_from: date | None = None, date_to: date | None = None
) -> dict[str, Any]:
    """Full per-user data export in workout_tracker.schema.json shape
    (FUNCTIONAL_IMPROVEMENTS_PLAN.md #3), optionally scoped to a date range
    (DASHBOARD_COMPLETION_PLAN.md §3). The range filters only time-bound rows — sessions and
    body_metrics — never catalog/programs/day_templates/coaching: those are structure, not
    history, and a partial-period dump without the goal/profile context it was measured against
    would be less useful, not more private. Reuses the same repo readers and presenters as the
    live read API, so the export can never drift from what the app itself shows."""
    uid = get_user_id()
    async with connect() as conn:
        exercises = await repo.list_exercises(conn, uid)
        programs = await repo.list_programs(conn, uid)
        day_templates = await repo.list_all_day_templates(conn, uid)
        session_summaries = await repo.list_sessions(
            conn, uid, date_from=date_from, date_to=date_to, limit=100_000
        )
        sessions = []
        for s in session_summaries:
            # get_session/resolve_session_id casts its id arg with `::text = %s`, which requires
            # a str — the raw uuid.UUID from this row would fail that cast (text = uuid).
            full = await repo.get_session(conn, uid, str(s["id"]))
            if full is not None:
                sessions.append(full)
        body_metrics = await repo.list_body_metrics(conn, uid, limit=100_000)
        if date_from is not None:
            body_metrics = [m for m in body_metrics if m["date"] >= date_from]
        if date_to is not None:
            body_metrics = [m for m in body_metrics if m["date"] <= date_to]
        profile = await repo.get_coach_profile(conn, uid)
        goals = await repo.list_user_goals(conn, uid, status="all")
        events = await repo.list_coach_events(conn, uid)

    return jsonable(
        {
            "schema_version": "1.0.0",
            "exercises": [present.present_exercise(e) for e in exercises],
            "programs": [present.present_program(p) for p in programs],
            "day_templates": [present.present_day_template(d) for d in day_templates],
            "sessions": [present.present_session(s) for s in sessions],
            "body_metrics": [present.present_body_metric(m) for m in body_metrics],
            "coaching": {
                "profile": present.present_coach_profile(profile) if profile else None,
                "goals": [present.present_goal(g) for g in goals],
                "events": [present.present_coach_event(e) for e in events],
            },
        }
    )


def _week_day_states(
    vols: list[dict[str, Any]], week_start: date, today: date
) -> list[dict[str, Any]]:
    """One entry per day of the current week, Monday-first, for the adherence pill row.
    A trained day is "done" whatever else it is (today included) — the visual celebrates the
    session, the "today" marker only matters while the day is still open."""
    trained = {v["date"] for v in vols}
    out = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        if d in trained:
            state = "done"
        elif d == today:
            state = "today"
        elif d > today:
            state = "future"
        else:
            state = "rest"
        out.append({"date": d, "state": state})
    return out


def _adherence_tone(sessions_this_week: int, target: int | None, today: date) -> str | None:
    """ "tense" when the weekly target is still unmet with ≤2 days (incl. today) left in the
    week — the UI's cue to warm up, never to scold. Same-week only by design: once Monday
    arrives _week_start() flips to the fresh week, so there is no unmet-past state to carry."""
    if target is None or sessions_this_week >= target:
        return None
    days_left = 7 - today.weekday()  # Mon=7 … Sun=1, inclusive of today
    return "tense" if days_left <= 2 else None


async def get_adherence() -> dict[str, Any]:
    """Weekly training consistency: sessions logged this calendar week against the user's own
    training_days_per_week target from the coach profile. Deliberately a weekly-target comparison,
    not a daily streak (COACHING_PLAN.md §8.2, §2.2 "broken-streak abstinence-violation effect") —
    a day off doesn't reset anything, and there is no target to compare against until the user has
    told the coach how many days a week they train. `days` carries the per-day pill states the
    same query already fetched; `tone` is the end-of-week urgency cue (see _adherence_tone)."""
    uid = get_user_id()
    week_start = _week_start()
    today = date.today()
    async with connect() as conn:
        # Only this week's sessions are used below — push the filter to SQL instead of fetching
        # a user's entire history to discard most of it.
        vols = await repo.session_volumes(conn, uid, date_from=week_start)
        profile = await repo.get_coach_profile(conn, uid)
    sessions_this_week = len(vols)  # already filtered to this week by the query above
    target = (profile or {}).get("training_days_per_week")
    return jsonable(
        {
            "sessions_this_week": sessions_this_week,
            "target_per_week": target,
            "week_start": week_start,
            "days": _week_day_states(vols, week_start, today),
            "tone": _adherence_tone(sessions_this_week, target, today),
        }
    )


async def get_connection() -> dict[str, Any]:
    """Whether the assistant has ever actually called a tool for this user — the confirmation
    that pasting the MCP URL into Claude/ChatGPT worked, distinct from the connector handshake
    itself (FUNCTIONAL_IMPROVEMENTS_PLAN.md #2, the blindest spot in activation)."""
    uid = get_user_id()
    async with connect() as conn:
        last = await repo.latest_tool_call(conn, uid)
    return jsonable(
        {
            "connected": last is not None,
            "last_tool": last["tool"] if last else None,
            "last_call_at": last["created_at"] if last else None,
        }
    )


async def rotate_token(lang: str | None = None) -> dict[str, Any]:
    """Issue a fresh token and email it to the account address (FUNCTIONAL_IMPROVEMENTS_PLAN.md
    #4). The new token is never returned over HTTP, only via email — the same delivery path as
    signup — so a link thief who rotates a stolen URL locks himself out, not the account owner:
    the new link lands in the owner's inbox, not the thief's. Users with no email on file (created
    via the CLI script) can't rotate; the caller (api.py) turns that into a 409."""
    uid = get_user_id()
    async with connect() as conn:
        user = await repo.get_user(conn, uid)
        assert user is not None  # uid comes from a resolved auth token, so the row must exist
        email = user.get("email")
        if not email:
            return {"ok": False, "error": "no_email"}
        new_token = await repo.rotate_token(conn, uid)
    lang = lang or email_service.DEFAULT_LANG
    email_id = await email_service.send_magic_link(email, new_token, lang=lang)
    if email_id:
        # Same reason as signup: without this mapping a delivery webhook cannot be traced to a
        # person. A rotation email that silently fails to arrive locks someone out of their own
        # account, so this is the send whose delivery we most want to see.
        async with connect() as conn:
            await repo.record_email_event(
                conn,
                resend_email_id=email_id,
                kind="queued",
                user_id=uid,
                detail={"purpose": "token_rotation", "lang": lang},
            )
    return {"ok": True, "email_sent": email_id is not None}


async def get_volume(bucket: str = "week", period: str | None = None) -> dict[str, Any]:
    """Total training volume bucketed by ISO week or month, with trend %."""
    uid = get_user_id()
    date_from = _period_date_from(period)
    async with connect() as conn:
        rows = await repo.session_volumes(conn, uid, date_from=date_from)
    buckets: dict[str, float] = {}
    for r in rows:
        d = r["date"]
        key = d.strftime("%Y-%m") if bucket == "month" else _iso_week_key(d)
        buckets[key] = buckets.get(key, 0.0) + float(r["volume_kg"] or 0)
    series: list[dict[str, Any]] = [
        {"bucket": k, "volume_kg": round(v, 1)} for k, v in sorted(buckets.items())
    ]
    return jsonable(
        {
            "bucket": bucket,
            "series": series,
            "trend_pct": stats.trend_pct([s["volume_kg"] for s in series]),
        }
    )


async def get_muscle_volume(
    period: str | None = "week", today: date | None = None
) -> dict[str, Any]:
    """Working sets + reps per muscle group over the period, plus each muscle's current load.

    Powers the Home muscle-load panel and the body heatmap. ``period`` accepts the same keywords
    as the volume charts (week/1m/3m/…); "week" means a rolling last-7-days window, today
    inclusive — a calendar Mon–Sun week made the panel reset to empty every Monday morning.

    Two different windows, on purpose. ``sets``/``reps`` cover ROLLING_WINDOW_DAYS, because MEV/MAV
    are weekly landmarks. ``load`` — the decayed fraction the heatmap paints — is computed over the
    longer LOAD_WINDOW_DAYS, since a muscle can still be carrying load from work older than a week;
    such a muscle is reported with zero sets rather than omitted, so the figure never lights up a
    muscle the response doesn't mention.

    ``today`` is the caller's local date. The server runs in UTC, so trusting its own clock would
    age an Americas user's evening workout by a full day the moment UTC rolls over — and this model
    turns that day straight into colour. Callers that don't pass one get the server's date.
    """
    uid = get_user_id()
    period = period or "week"
    today = today or date.today()
    rolling = period.lower() == "week"
    if rolling:
        sets_from = today - timedelta(days=stats.ROLLING_WINDOW_DAYS - 1)
        date_from = today - timedelta(days=stats.LOAD_WINDOW_DAYS - 1)
    else:
        sets_from = _period_date_from(period) or (today - timedelta(days=7))
        date_from = sets_from
    exposure_from = today - timedelta(days=landmarks.NOVELTY_WINDOW_DAYS)
    async with connect() as conn:
        rows = await repo.weekly_muscle_rows(conn, uid, date_from=date_from, date_to=today)
        # Aggregated in SQL over six months — how accustomed each muscle is to each movement, which
        # is the one personalization the evidence supports (repeated-bout effect).
        exposure_rows = await repo.muscle_exposure_counts(conn, uid, date_from=exposure_from)
    exposures = {(r["muscle"], r["movement_pattern"]): int(r["n"]) for r in exposure_rows}

    result = stats.muscle_panel(rows, today=today, sets_from=sets_from, exposures=exposures)
    result["period"] = period
    result["from"] = sets_from
    return jsonable(result)


async def get_program() -> dict[str, Any] | None:
    """The active program with its day templates (planned blocks) nested, for the Home plan view."""
    uid = get_user_id()
    async with connect() as conn:
        program = await repo.get_active_program(conn, uid)
        if program is None:
            return None
        days = await repo.list_day_templates(conn, uid, program["external_id"])
        exercises = await repo.list_exercises(conn, uid)
    # Resolve display names into the plan items: block items carry only exercise_id slugs
    # (goblet_squat, …) and consumers should never have to show a slug to the user.
    names = {e["id"]: e["name"] for e in exercises}
    presented_days = [present.present_day_template(d) for d in days]
    for day in presented_days:
        for block in day.get("blocks") or []:
            for item in block.get("items") or []:
                name = names.get(item.get("exercise_id"))
                if name:
                    item["exercise_name"] = name
    return jsonable(
        {
            **present.present_program(program),
            "days": presented_days,
        }
    )


async def get_all_prs(limit: int = 20) -> list[dict[str, Any]]:
    """Best top-set per exercise across the whole catalog, ranked by estimated 1RM."""
    uid = get_user_id()
    out: list[dict[str, Any]] = []
    async with connect() as conn:
        for ex in await repo.list_exercises(conn, uid):
            prs = stats.detect_prs(await repo.sets_for_exercise(conn, uid, ex["id"]))
            best = prs["best_weight"]
            if best["value"]:
                out.append(
                    {
                        "exercise_id": ex["id"],
                        "exercise_name": ex["name"],
                        "weight": best["value"],
                        "reps": best["reps"],
                        "date": best["date"],
                        "est_1rm": prs["best_est_1rm"]["value"],
                    }
                )
    out.sort(key=lambda p: p["est_1rm"], reverse=True)
    return jsonable(out[:limit])


# --- coaching ------------------------------------------------------------------

# Profile array columns are NOT NULL in the schema; an explicit null in a patch means "clear".
_ARRAY_PROFILE_FIELDS = (
    "preferred_days",
    "locations",
    "equipment",
    "focus_muscles",
    "likes",
    "dislikes",
)


async def update_coach_profile(patch: coach.CoachProfilePatch) -> dict[str, Any]:
    """Apply confirmed facts to the living profile; returns the consequences (§5.1 contract).

    Patch semantics: only fields the caller explicitly set are written (exclude_unset), so an
    explicit null CLEARS a field while omitted fields are untouched. parq_flags merge into the
    stored answers (a partial re-ask never erases earlier ones); injuries append/resolve.
    """
    uid = get_user_id()
    dumped = patch.model_dump(mode="json", exclude_unset=True)
    add_injuries = dumped.pop("add_injuries", None)
    resolve_areas = dumped.pop("resolve_injury_areas", None)
    # Anthropometrics live on the users row, not coach_profiles — route them there.
    anthro = {k: dumped.pop(k) for k in coach.USER_PROFILE_FIELDS if k in dumped}

    async with connect() as conn:
        # Row-locked read: concurrent eager patches serialize instead of losing updates.
        before = await repo.ensure_coach_profile(conn, uid, for_update=True)
        user_before = await repo.get_user(conn, uid) if anthro else None

        fields = {k: v for k, v in dumped.items() if k in repo.COACH_PROFILE_COLS}
        for k in _ARRAY_PROFILE_FIELDS:
            if k in fields and fields[k] is None:
                fields[k] = []
        if fields.get("checkin_cadence_days") is None:
            fields.pop("checkin_cadence_days", None)  # NOT NULL with default — can't clear

        if "parq_flags" in dumped:
            answered = dumped["parq_flags"] or {}
            answered = {k: v for k, v in answered.items() if v is not None}
            fields["parq_flags"] = {**(before.get("parq_flags") or {}), **answered}
            if patch.parq_flags is not None and patch.parq_flags.any_red_flag():
                fields["medical_clearance_advised"] = True

        if add_injuries or resolve_areas:
            # Copy each entry: mutating the originals would corrupt the before-side of the diff.
            injuries = [dict(i) for i in before.get("injuries") or []]
            for inj in add_injuries or []:
                # Skip exact re-reports of a still-active injury: the tool advertises
                # idempotentHint, so a client retry must not duplicate the entry (and the
                # prompt's "Active injuries on file" line must not read "knee, knee").
                if any(
                    i.get("active", True)
                    and i.get("area", "").lower() == inj.get("area", "").lower()
                    and i.get("note") == inj.get("note")
                    for i in injuries
                ):
                    continue
                injuries.append({**inj, "active": True, "reported_at": date.today().isoformat()})
            for area in resolve_areas or []:
                for inj in injuries:
                    if inj.get("area", "").lower() == area.lower():
                        inj["active"] = False
            fields["injuries"] = injuries

        # Fold the derived intake status into the same write — one UPDATE, one consistent row.
        merged = {**before, **fields}
        new_status = coach.compute_intake_status(merged)
        if new_status != before["intake_status"]:
            fields["intake_status"] = new_status
            if new_status == coach.IntakeStatus.core_complete and not merged.get(
                "next_review_date"
            ):
                cadence = merged.get("checkin_cadence_days") or 28
                fields["next_review_date"] = date.today() + timedelta(days=cadence)

        after = await repo.update_coach_profile_fields(conn, uid, fields)
        user_after = await repo.update_user_anthropometrics(conn, uid, anthro) if anthro else None

        # Full-diff audit trail: nothing the user tells the coach is ever lost (§9.4).
        changed = sorted(
            [
                k
                for k in fields
                if k in repo.COACH_PROFILE_COLS
                or k in ("parq_flags", "injuries", "medical_clearance_advised")
            ]
            + list(anthro)
        )
        diff = {k: [jsonable(before.get(k)), jsonable(after.get(k))] for k in fields}
        for k in anthro:
            diff[k] = [jsonable((user_before or {}).get(k)), jsonable((user_after or {}).get(k))]
        await repo.insert_coach_event(conn, uid, "profile_updated", {"diff": diff})
        if fields.get("medical_clearance_advised"):
            await repo.insert_coach_event(conn, uid, "red_flag_raised", {})
        if before["intake_status"] == coach.IntakeStatus.not_started != new_status:
            await repo.insert_coach_event(conn, uid, "intake_started", {})
        if fields.get("intake_status") == coach.IntakeStatus.core_complete:
            await repo.insert_coach_event(conn, uid, "intake_completed", {})

    profile_out = present.present_coach_profile(after)
    if user_after:
        profile_out.update({k: user_after.get(k) for k in coach.USER_PROFILE_FIELDS})
    return jsonable(
        {
            "profile": profile_out,
            "changed": changed,
            "intake_status": after["intake_status"],
            "ui_impact": coach.ui_impact_for(changed),
        }
    )


async def upsert_goal(goal: coach.GoalInput) -> dict[str, Any]:
    uid = get_user_id()
    dumped = goal.model_dump(mode="json", exclude_unset=True)
    # Defend the featured invariant server-side too, beyond the upsert_goal tool docstring
    # telling the coach to clear it explicitly when closing out a goal (mirrors how
    # medical_clearance_advised is defended beyond just the prompt telling the coach to set it):
    # a goal closing out this call must never stay featured, even if that field was missed.
    if dumped.get("status") in (
        coach.GoalStatus.achieved,
        coach.GoalStatus.abandoned,
        coach.GoalStatus.revised,
    ):
        dumped["featured"] = False
    async with connect() as conn:
        # An exercise-tied goal whose exercise_id isn't in the user's catalog can never resolve
        # progress (progressions are keyed by catalog id) — the classic drift is the coach
        # re-inventing an id ("barbell_bench" vs the catalog's "bench_press"), which used to
        # write fine and render title-only forever. Checked only for goals being written as
        # active: closing out / archiving an old goal must never fail on a since-renamed id.
        exercise_id = (goal.target.exercise_id if goal.target else None) or None
        status = dumped.get("status", coach.GoalStatus.active)
        if exercise_id and status == coach.GoalStatus.active:
            catalog = await repo.list_exercises(conn, uid)
            known = [e["id"] for e in catalog]
            if exercise_id not in known:
                sample = ", ".join(sorted(known)[:15]) or "(catalog is empty)"
                raise ValueError(
                    f"exercise_id {exercise_id!r} is not in the user's exercise catalog —"
                    f" goal progress would never resolve. Pick an existing id ({sample}) or"
                    " create the exercise first with upsert_exercise, then retry."
                )
        row = await repo.upsert_user_goal(conn, uid, dumped)
        if dumped.get("status") == coach.GoalStatus.achieved:
            await repo.insert_coach_event(conn, uid, "goal_achieved", {"title": goal.title})
    return jsonable(
        {
            "goal": _present_goal_with_type(row),
            "ui_impact": ["goal_progress_card"],
        }
    )


async def get_goals(status: str = "active") -> list[dict[str, Any]]:
    uid = get_user_id()
    async with connect() as conn:
        rows = await repo.list_user_goals(conn, uid, status=status)
    return jsonable([_present_goal_with_type(r) for r in rows])


async def log_coach_event(type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    uid = get_user_id()
    async with connect() as conn:
        row = await repo.insert_coach_event(conn, uid, type, payload or {})
    return jsonable(present.present_coach_event(row))


async def _training_data(
    conn: repo.Conn, uid: str, profile: dict[str, Any], today: date
) -> dict[str, Any]:
    """Fresh server-computed numbers for prompt layer 5 (§4). The model gets facts, not math.

    `today` is the USER's date, resolved once by the caller (_local_today) and threaded through
    every window below. Half-threading it is worse than not threading it at all: the flame would
    run on the user's Sunday evening while `sessions_completed_this_week` still ran on the
    server's Monday, and both numbers go into the same prompt — the coach would be told the user
    has trained zero times this week while their flame burns full."""
    week_start = _week_start(today)

    # Per-muscle volume uses the SAME rolling window as the Home muscle panel, not the calendar
    # week the adherence count below uses. Otherwise the coach and the app contradict each other
    # every Monday morning: the panel shows yesterday's 12 chest sets while a calendar-week query
    # reports chest as untrained, and the coach then tells the user to train a muscle they just
    # hammered. Adherence stays calendar-based — "sessions this week" really is a calendar
    # question; "have I done enough chest volume" is not.
    muscle_from = today - timedelta(days=stats.ROLLING_WINDOW_DAYS - 1)
    rows = await repo.weekly_muscle_rows(conn, uid, date_from=muscle_from)
    load = stats.weekly_muscle_load(rows)

    # Recent-form window (last 5) and this-week adherence count are different questions:
    # the adherence count must cover the whole week and only sessions that actually happened.
    sessions = await repo.list_sessions(conn, uid, limit=50)
    recent = [
        {
            "date": s["date"],
            "day_label": s["day_label"],
            "status": s["status"],
            "volume_kg": float(s["total_volume_kg"] or 0),
            "session_rpe": s["session_rpe"],
            "energy_level": s["energy_level"],
        }
        for s in sessions[:5]
    ]
    this_week = sum(1 for s in sessions if s["date"] >= week_start and s["status"] == "completed")
    latest_bm = await repo.list_body_metrics(conn, uid, limit=1)

    # Compact active-program summary: enough to pick today's day; full blocks via get_program.
    program = await repo.get_active_program(conn, uid)
    program_summary = None
    if program is not None:
        days = await repo.list_day_templates(conn, uid, program["external_id"])
        program_summary = {
            "name": program["name"],
            "goal": program["goal"],
            "frequency_per_week": program["frequency_per_week"],
            "split_type": program["split_type"],
            "days": [
                {"id": d["external_id"], "name": d["name"], "focus": d["focus"]} for d in days
            ],
        }

    # The same consistency level the app's flame shows the user (services._streak) — the coach
    # must reason from the numbers the user is looking at, never re-derive its own version.
    streak_from = min(_last_n_week_starts(13)[0], today - timedelta(days=_STREAK_FETCH_DAYS))
    vols_90 = await repo.session_volumes(conn, uid, date_from=streak_from)
    first_session = await repo.first_session_date(conn, uid)
    consistency = _streak(
        vols_90,
        first_session=first_session,
        training_days_per_week=profile.get("training_days_per_week"),
        today=today,
        fetched_from=streak_from,
    )

    # The exercises this user already has, id + name only. Every prompt tells the coach to reuse
    # existing ids before inventing one, but the catalog itself was never in the context — so
    # obeying that instruction cost a `list_exercises` round-trip the model could simply skip, and
    # frequently did (the observed result is the same movement stored twice under two slugs).
    # Names only: full metadata stays behind list_exercises / search_exercise_pool.
    catalog = await repo.list_exercises(conn, uid)

    return {
        "week_start": week_start,
        "sessions_completed_this_week": this_week,
        "target_days_per_week": profile.get("training_days_per_week"),
        "consistency_level": consistency,
        # Named for the window it actually covers, not "total": the rows are the flame's 180-day
        # fetch, and a field called `_total` would have the model telling a two-year-old account
        # "you have logged 47 sessions" — the same class of lie that renamed consistency_last_30d.
        # The level alone is ambiguous in a way that matters to the coach: a brand-new user who
        # logged their first session, someone genuinely two weeks off plan, and an athlete on the
        # last day of a prescribed rest week ALL read level 2. Without these two the model cannot
        # tell them apart, and the checkin rules would open with "what got in the way?" to a
        # two-day-old account and prescribe a lighter session to someone completing the deload it
        # advised. Both numbers are free — the dates are already in hand.
        "days_since_last_session": (
            (today - max(v["date"] for v in vols_90 if v["date"] <= today)).days
            if any(v["date"] <= today for v in vols_90)
            else None
        ),
        "training_days_last_180d": len({v["date"] for v in vols_90 if v["date"] <= today}),
        "weekly_sets_by_muscle": landmarks.annotate_weekly_sets(load["muscles"]),
        "recent_sessions": recent,
        "bodyweight_kg": latest_bm[0]["bodyweight_kg"] if latest_bm else None,
        "active_program": program_summary,
        "exercise_catalog": [{"id": e["id"], "name": e["name"]} for e in catalog],
    }


# Production prompt rows override the code fallback; cache them briefly so warm serverless
# invocations don't re-fetch every template body per coaching call (Langfuse-style TTL).
_PROMPT_CACHE_TTL_SEC = 60.0
_prompt_cache: dict[str, Any] = {"at": 0.0, "data": None}


async def _templates(conn: repo.Conn) -> dict[str, str]:
    now = monotonic()
    if _prompt_cache["data"] is None or now - _prompt_cache["at"] > _PROMPT_CACHE_TTL_SEC:
        _prompt_cache["data"] = await repo.production_prompts(conn)
        _prompt_cache["at"] = now
    return {**prompts.TEMPLATES, **_prompt_cache["data"]}


def _age_years(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = date.today()
    before_birthday = (today.month, today.day) < (birth_date.month, birth_date.day)
    return today.year - birth_date.year - before_birthday


async def _featured_goal_progress_for_prompt(
    conn: repo.Conn,
    uid: str,
    featured_row: dict[str, Any] | None,
    *,
    bodyweight: float | None,
    sessions_this_week: int,
) -> dict[str, Any] | None:
    """Whatever progress the featured goal needs for the prompt — the rich type-specific envelope
    (weekly_bands/trend/tolerance) where one applies, else the same cheap bar the app shows for a
    milestone/frequency goal (never just the bare goal facts). Capped for prompt content, not a UI
    payload — series/history stay short. Lets the coach reason from the same numbers the app
    shows instead of re-deriving them — in particular, this is what task.weekly_review's "did
    they hit their goal" check reads. None only when there's no featured goal at all."""
    if featured_row is None:
        return None
    target = featured_row.get("target") or {}
    goal_type = coach.infer_goal_type(target)
    weekly_rows = None
    progressions: dict[str, list[dict[str, Any]]] = {}
    if goal_type == coach.GoalType.weekly_volume or (
        goal_type == coach.GoalType.maintenance and target.get("muscle")
    ):
        weekly_rows = await repo.weekly_muscle_rows(conn, uid, date_from=_last_n_week_starts(6)[0])
    exercise_id = target.get("exercise_id")
    if exercise_id and goal_type in (
        coach.GoalType.trend,
        coach.GoalType.maintenance,
        coach.GoalType.milestone,
    ):
        rows = await repo.sets_for_exercise(conn, uid, exercise_id)
        progressions[exercise_id] = stats.exercise_progression(rows)
    session_rows = None
    if goal_type == coach.GoalType.maintenance and not exercise_id and not target.get("muscle"):
        session_rows = await repo.session_volumes(conn, uid, date_from=_last_n_week_starts(5)[0])

    rich = _featured_goal_progress(
        featured_row,
        progressions=progressions,
        weekly_muscle_rows=weekly_rows,
        session_volume_rows=session_rows,
    )
    if rich:
        if "series" in rich:
            rich = {**rich, "series": rich["series"][-8:]}
        if "history" in rich:
            rich = {**rich, "history": rich["history"][-8:]}
        return rich

    cheap = _goal_progress(
        featured_row,
        progressions=progressions,
        bodyweight=bodyweight,
        sessions_this_week=sessions_this_week,
    )
    progress = cheap.get("progress")
    return progress if isinstance(progress, dict) else None


async def get_coaching_context(task: str, constraints: str | None = None) -> dict[str, Any]:
    """Assembled per-user coaching prompt for the task (COACHING_PLAN.md §4, §5.1)."""
    uid = get_user_id()
    async with connect() as conn:
        profile = await repo.ensure_coach_profile(conn, uid)
        user = await repo.get_user(conn, uid)
        assert user is not None  # uid comes from a resolved auth token, so the row must exist
        # Anthropometrics feed the starting-load anchors; bodyweight prefers the freshest
        # logged measurement over the static users column.
        metrics = await repo.list_body_metrics(conn, uid, limit=10)
        bodyweight = next(
            (m["bodyweight_kg"] for m in metrics if m.get("bodyweight_kg") is not None),
            user.get("bodyweight_kg"),
        )

        # Hard gate (§12.2), fail-closed: anything but an explicitly complete intake runs the
        # intake — a plan generated from an empty profile is the failure mode this feature
        # exists to prevent.
        intake_required = task != "intake" and not coach.is_intake_complete(
            profile["intake_status"]
        )
        effective_task = "intake" if intake_required else task

        goals = await repo.list_user_goals(conn, uid, status="active")
        featured_row = next((g for g in goals if g.get("featured")), None)
        templates = await _templates(conn)
        today = _local_today(user, None)
        training = (
            {} if effective_task == "intake" else await _training_data(conn, uid, profile, today)
        )
        featured_progress = (
            None
            if effective_task == "intake"
            else await _featured_goal_progress_for_prompt(
                conn,
                uid,
                featured_row,
                bodyweight=float(bodyweight) if bodyweight is not None else None,
                sessions_this_week=training.get("sessions_completed_this_week", 0),
            )
        )

    profile_view = present.present_coach_profile(profile)
    anthro = {
        "sex": user.get("sex"),
        "age": _age_years(user.get("birth_date")),
        "height_cm": user.get("height_cm"),
        "bodyweight_kg": bodyweight,
    }
    profile_view.update({k: v for k, v in anthro.items() if v is not None})
    goals_presented = []
    for g in goals:
        presented = _present_goal_with_type(g)
        if featured_progress is not None and g.get("featured"):
            presented["progress"] = featured_progress
        goals_presented.append(presented)
    result = prompts.assemble(
        effective_task,
        templates,
        profile_view,
        goals_presented,
        training,
        constraints=constraints,
    )
    result["intake_required"] = intake_required
    result["intake_status"] = profile["intake_status"]
    return jsonable(result)


# Exercises whose only equipment is here need no starting weight (effort comes from reps/variation).
_NO_LOAD_EQUIPMENT = {"bodyweight", "resistance_band"}
# A calibration cue in item notes counts as a load prescription (multi-language substrings).
_CALIBRATION_CUES = ("calibrat", "find", "ramp", "калибр", "подбер", "подбор", "разгон")


def _review_draft(
    doc: WorkoutDocument, profile: dict[str, Any], catalog: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Pure rule-based checklist over a draft program document. No writes, no LLM judgement:
    every check here is mechanically verifiable, so 'pass the check' replaces 'follow the spec'
    (models comply with the former far more reliably)."""
    violations: list[str] = []
    warnings: list[str] = []

    doc_exercises = {
        (e.id or e.name): {
            "name": e.name,
            "equipment": [q.value for q in e.equipment],
            "primary_muscles": [m.value for m in e.primary_muscles],
        }
        for e in doc.exercises
    }
    known = {**catalog, **doc_exercises}

    if not doc.programs:
        violations.append("document has no `programs` entry")
    if not doc.day_templates:
        violations.append("document has no `day_templates`")

    doc_days = {d.id: d for d in doc.day_templates if d.id}
    for prog in doc.programs:
        if not prog.id:
            continue
        for day_id in prog.day_template_ids:
            day = doc_days.get(day_id)
            if day is None:
                violations.append(
                    f"program '{prog.name}': day_template_ids includes '{day_id}' but no "
                    "day_template with that id is in this document's `day_templates` list"
                )
            elif day.program_id != prog.id:
                violations.append(
                    f"program '{prog.name}': day_template '{day.name}' (id={day_id}) must set "
                    f"program_id='{prog.id}' to match — get_program() resolves a program's days "
                    "via day_template.program_id, not the program's day_template_ids list; "
                    "without it the saved program will silently show zero days"
                )

    target_days = profile.get("training_days_per_week")
    for prog in doc.programs:
        if target_days and prog.frequency_per_week and prog.frequency_per_week > target_days:
            violations.append(
                f"program '{prog.name}': frequency_per_week={prog.frequency_per_week} exceeds "
                f"the {target_days} days/week the user committed to"
            )

    user_equipment = set(profile.get("equipment") or [])
    active_injuries = [
        (i.get("area") or "").lower()
        for i in (profile.get("injuries") or [])
        if i.get("active", True)
    ]
    session_cap = profile.get("session_length_min")

    for day in doc.day_templates:
        if session_cap and day.estimated_duration_min and day.estimated_duration_min > session_cap:
            violations.append(
                f"day '{day.name}': estimated {day.estimated_duration_min} min exceeds the "
                f"user's session_length_min of {session_cap}"
            )
        for block in day.blocks:
            for item in block.items:
                label = f"day '{day.name}' / {item.exercise_id}"
                ex = known.get(item.exercise_id)
                if ex is None:
                    violations.append(
                        f"{label}: exercise_id not in the user's catalog and not in the "
                        "document's `exercises` list — add a catalog entry with equipment "
                        "and primary_muscles"
                    )
                if item.target_sets is None or item.target_reps is None:
                    violations.append(f"{label}: missing target_sets or target_reps")
                equipment = set((ex or {}).get("equipment") or [])
                needs_load = not equipment or bool(equipment - _NO_LOAD_EQUIPMENT)
                has_calibration_note = bool(item.notes) and any(
                    cue in (item.notes or "").lower() for cue in _CALIBRATION_CUES
                )
                if needs_load and item.target_weight_kg is None and not has_calibration_note:
                    violations.append(
                        f"{label}: no target_weight_kg and no calibration note — every loaded "
                        "exercise needs a starting weight, or a first-session calibration "
                        "instruction in `notes`"
                    )
                if (
                    equipment
                    and user_equipment
                    and equipment.isdisjoint(user_equipment | _NO_LOAD_EQUIPMENT)
                ):
                    violations.append(
                        f"{label}: needs {sorted(equipment)} but the user only has "
                        f"{sorted(user_equipment)}"
                    )
                if ex:
                    searchable = " ".join(
                        [ex.get("name") or "", item.exercise_id, *(ex.get("primary_muscles") or [])]
                    ).lower()
                    for area in active_injuries:
                        if area and area in searchable:
                            warnings.append(
                                f"{label}: may load the injured area '{area}' — substitute or "
                                "confirm it is pain-free"
                            )

    return {
        "ok": not violations,
        "violations": violations,
        "warnings": warnings,
        "next_step": (
            "All checks passed — present the draft to the user."
            if not violations
            else "Fix every violation and call review_program_draft again before presenting."
        ),
    }


def _doc_exercise_ids(doc: WorkoutDocument) -> list[str]:
    return [
        item.exercise_id
        for day in doc.day_templates
        for block in day.blocks
        for item in block.items
        if item.exercise_id
    ]


async def _review_catalog(conn: Any, uid: str, doc: WorkoutDocument) -> dict[str, dict[str, Any]]:
    """What counts as a known exercise when reviewing a draft: the user's own catalog, plus any
    pool entry the draft references.

    Without the pool half, following the catalog-first instruction would fail the review — the
    coach picks `bb_bench_press` from the pool, has not upserted it into this user's catalog yet,
    and the equipment/muscle checks would report an unknown exercise.
    """
    catalog = {
        e["id"]: {
            "name": e.get("name"),
            "equipment": e.get("equipment") or [],
            "primary_muscles": e.get("primary_muscles") or [],
        }
        for e in await repo.list_exercises(conn, uid)
    }
    referenced = [eid for eid in _doc_exercise_ids(doc) if eid not in catalog]
    for row in await repo.get_pool_exercises(conn, referenced):
        catalog.setdefault(
            row["slug"],
            {
                "name": present.present_pool_exercise(row)["name"],
                "equipment": row.get("equipment") or [],
                "primary_muscles": row.get("primary_muscles") or [],
            },
        )
    return catalog


async def review_program_draft(doc: WorkoutDocument) -> dict[str, Any]:
    """Server-side quality gate for a DRAFT program (§ plan review). Read-only, saves nothing."""
    uid = get_user_id()
    async with connect() as conn:
        profile = await repo.ensure_coach_profile(conn, uid)
        catalog = await _review_catalog(conn, uid, doc)
    return jsonable(_review_draft(doc, profile, catalog))


async def import_document(doc: WorkoutDocument, *, validate: bool = True) -> dict[str, Any]:
    """Bulk-load a full schema document for the current user. Returns counts.

    Active programs run the same server-side checklist as `review_program_draft`
    (FUNCTIONAL_IMPROVEMENTS_PLAN.md #1) before anything is written: a client that skipped the
    review step (or ignored its violations) can no longer persist a program with missing weights
    or an equipment mismatch. Violations → `{ok: False, violations, next_step}`, nothing saved
    (atomic reject). Only the active program(s) and their own day_templates are checked — an
    archived/completed program bundled into the same document (the "replace" flow's own
    instruction: include the old program as archived) is left alone, and a document with no
    programs at all (history-only import) skips the gate entirely. `validate=False` is an escape
    hatch for `scripts/import_document.py` restoring a pre-existing backup verbatim.
    """
    uid = get_user_id()
    active = [p for p in doc.programs if p.status == "active"]
    if validate and active:
        active_ids = {p.id for p in active if p.id}
        scoped = doc.model_copy(
            update={
                "programs": active,
                "day_templates": [d for d in doc.day_templates if d.program_id in active_ids],
            }
        )
        async with connect() as conn:
            # Read-only lookup (not ensure_coach_profile): a bulk import must never create a
            # coach_profiles row as a side effect for a user who hasn't done intake — that would
            # surprise every other reader of "has this user met the coach yet?".
            profile = await repo.get_coach_profile(conn, uid) or {}
            catalog = await _review_catalog(conn, uid, scoped)
        review = _review_draft(scoped, profile, catalog)
        if not review["ok"]:
            return {
                "ok": False,
                "violations": review["violations"],
                "next_step": "Fix every violation and call import_document again.",
            }

    async with connect() as conn:
        for ex in doc.exercises:
            # Same path as the MCP tool: a bulk import must not be the one way to get an exercise
            # into the catalogue with no muscles, no equipment and no pool link.
            await _upsert_exercise_linked(conn, uid, ex)
        for prog in doc.programs:
            await repo.upsert_program(conn, uid, prog)
        for tpl in doc.day_templates:
            await repo.upsert_day_template(conn, uid, tpl)
        session_ids = []
        for s in doc.sessions:
            # Idempotent re-import: replace any session previously imported with this external_id.
            await repo.delete_session_by_external_id(conn, uid, s.id)
            session_ids.append(await repo.insert_session(conn, uid, s))
        for bm in doc.body_metrics:
            await repo.delete_body_metric_by_external_id(conn, uid, bm.id)
            await repo.insert_body_metric(conn, uid, bm)
        return {
            "exercises": len(doc.exercises),
            "programs": len(doc.programs),
            "day_templates": len(doc.day_templates),
            "sessions": len(session_ids),
            "body_metrics": len(doc.body_metrics),
        }
