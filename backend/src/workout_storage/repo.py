"""SQL data access (psycopg3 async). All functions scope by user_id.

Every read/write is scoped to a single user (resolved from the URL token upstream). SQL lives here
so tools/services stay thin and testable.
"""

from __future__ import annotations

import re
import secrets
from collections import defaultdict
from datetime import date, datetime
from typing import Any

import psycopg
from psycopg.types.json import Jsonb
from pydantic import ValidationError as PydanticValidationError

from .models import BodyMetric, DayTemplate, Exercise, Program, Session, SetEntry, SetType

Conn = psycopg.AsyncConnection[dict[str, Any]]


def _one(row: dict[str, Any] | None) -> dict[str, Any]:
    """Unwrap a `fetchone()` result that's guaranteed non-None by the query shape.

    (an `INSERT ... RETURNING *`, or an aggregate with no `GROUP BY`, always yields one row).
    """
    assert row is not None
    return row


def generate_token() -> str:
    """URL-safe, unguessable per-user token used as the leading URL path segment.

    Strips any leading '-'/'_' so the token is clean in URLs and on the CLI.
    """
    return secrets.token_urlsafe(24).lstrip("-_") or secrets.token_hex(16)


# --- users -------------------------------------------------------------------


def normalize_email(email: str | None) -> str | None:
    """Lowercase + trim so lookups and the unique index treat addresses case-insensitively."""
    if email is None:
        return None
    cleaned = email.strip().lower()
    return cleaned or None


async def create_user(
    conn: Conn,
    *,
    name: str | None = None,
    token: str | None = None,
    timezone: str | None = None,
    email: str | None = None,
    **profile: Any,
) -> dict[str, Any]:
    token = token or generate_token()
    cols = {"token": token, "name": name, "timezone": timezone, "email": normalize_email(email)}
    # Coaching state (goals, experience) lives in coach_profiles/user_goals, not here.
    allowed = {"sex", "birth_date", "height_cm", "bodyweight_kg", "body_fat_pct", "preferred_units"}
    unknown = set(profile) - allowed
    if unknown:
        # Fail loudly: silently dropping e.g. goals= (pre-migration signature) loses user data.
        raise ValueError(f"create_user got unsupported profile fields: {sorted(unknown)}")
    cols.update(profile)
    keys = [k for k, v in cols.items() if v is not None]
    async with conn.cursor() as cur:
        await cur.execute(
            f"insert into users ({', '.join(keys)}) values ({', '.join(['%s'] * len(keys))}) "
            "returning *",
            [cols[k] for k in keys],
        )
        return _one(await cur.fetchone())


async def get_user_by_token(conn: Conn, token: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute("select * from users where token = %s", [token])
        return await cur.fetchone()


async def get_user(conn: Conn, user_id: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute("select * from users where id = %s", [user_id])
        return await cur.fetchone()


async def get_user_by_email(conn: Conn, email: str) -> dict[str, Any] | None:
    normalized = normalize_email(email)
    if normalized is None:
        return None
    async with conn.cursor() as cur:
        await cur.execute("select * from users where lower(email) = %s", [normalized])
        return await cur.fetchone()


async def rotate_token(conn: Conn, user_id: str) -> str:
    """Issue a fresh token for the user, invalidating the old one immediately (whatever URL was
    built from it — MCP connector or web UI — stops resolving right away)."""
    new_token = generate_token()
    async with conn.cursor() as cur:
        await cur.execute("update users set token = %s where id = %s", [new_token, user_id])
    return new_token


async def get_user_by_supabase_id(conn: Conn, supabase_user_id: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute("select * from users where supabase_user_id = %s", [supabase_user_id])
        return await cur.fetchone()


async def link_supabase_user(conn: Conn, user_id: str, supabase_user_id: str) -> bool:
    """Attach a Supabase Auth identity to an account, once.

    Returns False if this account is already linked to a *different* Supabase identity, rather than
    silently repointing it: that would hand one person's training log to whoever last signed in
    with a matching address. The caller turns a False into a refusal to authorize.

    The email match that leads here is only safe because Supabase verified the address first (see
    oauth.py) — this function assumes that check has already happened.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            "update users set supabase_user_id = %s "
            "where id = %s and (supabase_user_id is null or supabase_user_id = %s)",
            [supabase_user_id, user_id, supabase_user_id],
        )
        return cur.rowcount > 0


async def mark_email_verified(conn: Conn, user_id: str) -> None:
    """Stamp email_verified_at on first authenticated visit (the magic link proves ownership)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "update users set email_verified_at = now() "
            "where id = %s and email is not null and email_verified_at is null",
            [user_id],
        )


# --- signup throttle ---------------------------------------------------------


async def count_recent_signups(conn: Conn, ip: str, since: datetime) -> int:
    async with conn.cursor() as cur:
        await cur.execute(
            "select count(*) as n from signup_events where ip = %s and created_at >= %s",
            [ip, since],
        )
        return int(_one(await cur.fetchone())["n"])


async def record_signup_event(conn: Conn, ip: str) -> None:
    async with conn.cursor() as cur:
        await cur.execute("insert into signup_events (ip) values (%s)", [ip])


async def prune_signup_events(conn: Conn, before: datetime) -> None:
    """Drop throttle rows older than the rate-limit window so the table stays bounded."""
    async with conn.cursor() as cur:
        await cur.execute("delete from signup_events where created_at < %s", [before])


# --- email delivery telemetry ------------------------------------------------


async def record_email_event(
    conn: Conn,
    *,
    resend_email_id: str,
    kind: str,
    user_id: str | None = None,
    occurred_at: datetime | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Record one step in a message's life: our own 'sent', or a Resend webhook event.

    Idempotent on (resend_email_id, kind, occurred_at) because svix retries the whole webhook on
    any non-2xx, so the same event legitimately arrives more than once.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """insert into email_events (user_id, resend_email_id, kind, occurred_at, detail)
               values (%s, %s, %s, coalesce(%s, now()), %s)
               on conflict (resend_email_id, kind, occurred_at) do nothing""",
            [user_id, resend_email_id, kind, occurred_at, Jsonb(detail) if detail else None],
        )


async def user_id_for_email_id(conn: Conn, resend_email_id: str) -> str | None:
    """Whose message was this? Resolved through the 'sent' row written when we sent it.

    Returns None for a message we have no send record for — a send that predates this table, or
    one from something other than send_magic_link. The caller stores the event anyway: an
    unattributable bounce is still a deliverability signal.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            "select user_id from email_events where resend_email_id = %s and user_id is not null"
            " limit 1",
            [resend_email_id],
        )
        row = await cur.fetchone()
    return str(row["user_id"]) if row and row["user_id"] else None


# --- exercises ---------------------------------------------------------------

_EXERCISE_COLS = (
    "id",
    "name",
    "aliases",
    "category",
    "movement_pattern",
    "primary_muscles",
    "secondary_muscles",
    "tertiary_muscles",
    "pool_slug",
    "equipment",
    "is_unilateral",
    "long_length",
    "default_rep_min",
    "default_rep_max",
    "default_rest_sec",
    "tags",
    "instructions",
    "video_url",
    "image_url",
    "custom_fields",
)


def _exercise_values(user_id: str, ex: Exercise) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "id": ex.id or ex.name,
        "name": ex.name,
        "aliases": ex.aliases,
        "category": ex.category.value if ex.category else None,
        "movement_pattern": ex.movement_pattern.value if ex.movement_pattern else None,
        "primary_muscles": [m.value for m in ex.primary_muscles],
        "secondary_muscles": [m.value for m in ex.secondary_muscles],
        "tertiary_muscles": [m.value for m in ex.tertiary_muscles],
        "pool_slug": ex.pool_slug,
        "equipment": [e.value for e in ex.equipment],
        "is_unilateral": ex.is_unilateral,
        "long_length": ex.long_length,
        "default_rep_min": ex.default_rep_range.min if ex.default_rep_range else None,
        "default_rep_max": ex.default_rep_range.max if ex.default_rep_range else None,
        "default_rest_sec": ex.default_rest_sec,
        "tags": ex.tags,
        "instructions": ex.instructions,
        "video_url": ex.video_url,
        "image_url": ex.image_url,
        "custom_fields": Jsonb(ex.custom_fields),
    }


# Model field -> the columns it writes. Anything not named here is a 1:1 field/column pair.
_EXERCISE_FIELD_COLS = {"default_rep_range": ("default_rep_min", "default_rep_max")}


async def upsert_exercise(conn: Conn, user_id: str, ex: Exercise) -> dict[str, Any]:
    """Insert, or update only the fields the caller actually sent.

    A full-column overwrite is what this used to do, and it is a data-loss hazard the coach walks
    into routinely: an LLM re-upserting an existing exercise to add `instructions` would reset
    `primary_muscles` / `category` to their defaults, which is exactly the metadata the muscle
    panel joins on (`scripts/seed_program.py` restates every field for this reason). Pydantic's
    `model_fields_set` tells us what was on the wire, so an omitted field is now left alone while
    an explicitly-sent empty list still clears the column.
    """
    vals = _exercise_values(user_id, ex)
    cols = ["user_id", *_EXERCISE_COLS]
    touched: set[str] = set()
    for field in ex.model_fields_set:
        touched.update(_EXERCISE_FIELD_COLS.get(field, (field,)))
    updates = ", ".join(f"{c} = excluded.{c}" for c in _EXERCISE_COLS if c != "id" and c in touched)
    set_clause = f"{updates}, updated_at = now()" if updates else "updated_at = now()"
    async with conn.cursor() as cur:
        await cur.execute(
            f"insert into exercises ({', '.join(cols)}) "
            f"values ({', '.join(['%s'] * len(cols))}) "
            f"on conflict (user_id, id) do update set {set_clause} "
            "returning *",
            [vals[c] for c in cols],
        )
        return _one(await cur.fetchone())


async def ensure_exercises_exist(conn: Conn, user_id: str, exercise_ids: list[str]) -> None:
    """Create catalog rows for referenced exercise_ids not yet present, from the pool when it knows
    the movement.

    The old behaviour -- `insert (user_id, id, name)` and nothing else -- left the row with no
    muscles and no category, and `weekly_muscle_rows` INNER JOINs the catalog, so every set logged
    against an auto-created exercise was silently missing from the muscle panel. Matching the id
    against `exercise_pool.match_keys` fills those rows with curated metadata instead, and stamps
    `pool_slug` so the movement is recognised as the same one next time under any name.
    """
    if not exercise_ids:
        return
    ids = list(dict.fromkeys(exercise_ids))
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            insert into exercises (
              user_id, id, name, category, movement_pattern,
              primary_muscles, secondary_muscles, tertiary_muscles, equipment,
              is_unilateral, long_length, default_rep_min, default_rep_max, default_rest_sec,
              pool_slug
            )
            select %(user_id)s, %(id)s,
                   -- The stored display name follows the user's own language, not a hardcoded
                   -- one: an English-speaking user logging `bb_bench_press` was getting a row
                   -- called "Жим штанги лёжа" forever. English is the fallback, matching the web
                   -- app's runtime fallbackLng.
                   coalesce(
                     p.names ->> coalesce(
                       (select language from coach_profiles where user_id = %(user_id)s), 'en'
                     ),
                     p.names ->> 'en',
                     %(id)s
                   ),
                   p.category, p.movement_pattern,
                   coalesce(p.primary_muscles, '{}'), coalesce(p.secondary_muscles, '{}'),
                   coalesce(p.tertiary_muscles, '{}'), coalesce(p.equipment, '{}'),
                   coalesce(p.is_unilateral, false), p.long_length,
                   p.default_rep_min, p.default_rep_max, p.default_rest_sec, p.slug
            from (select 1) _
            left join exercise_pool p on %(key)s = any (p.match_keys)
            on conflict (user_id, id) do nothing
            """,
            [{"user_id": user_id, "id": eid, "key": normalize_match_key(eid)} for eid in ids],
        )


def normalize_match_key(value: str) -> str:
    """Mirror of ``scripts/build_exercise_pool.normalize`` — the two must agree exactly or a name
    that matched at build time will miss at runtime. Parenthesised notes are dropped: a catalog
    name is routinely "Отжимания на брусьях (с противовесом при необходимости)"."""
    lowered = value.strip().lower().replace("ё", "е")
    without_notes = re.sub(r"\([^)]*\)", " ", lowered)
    return re.sub(r"[\s\-_]+", " ", without_notes).strip()


async def get_exercise(conn: Conn, user_id: str, exercise_id: str) -> dict[str, Any] | None:
    """One catalog row by its id, or None. Used to tell "creating" from "updating", which decides
    whether pool defaults may be applied at all."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from exercises where user_id = %s and id = %s", [user_id, exercise_id]
        )
        return await cur.fetchone()


async def find_exercise_id_case_insensitive(
    conn: Conn, user_id: str, exercise_id: str
) -> str | None:
    """The id of an existing row that differs from ``exercise_id`` only by case, if any.

    The primary key is case-sensitive text, so "Bench_Press" and "bench_press" are two catalogue
    rows with two separate histories for one movement. Callers use this to canonicalise onto the
    spelling already stored rather than forking."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select id from exercises where user_id = %s and lower(id) = lower(%s) limit 1",
            [user_id, exercise_id],
        )
        row = await cur.fetchone()
        return row["id"] if row else None


async def list_exercises(
    conn: Conn,
    user_id: str,
    *,
    muscle: str | None = None,
    equipment: str | None = None,
    movement_pattern: str | None = None,
    query: str | None = None,
) -> list[dict[str, Any]]:
    """The user's own catalog, optionally filtered.

    Filters exist so "check the catalog first" costs a targeted question rather than an unbounded
    dump of every exercise the account ever logged.
    """
    where = ["user_id = %(user_id)s"]
    params: dict[str, Any] = {"user_id": user_id}
    if muscle:
        where.append(
            "(%(muscle)s = any (primary_muscles) or %(muscle)s = any (secondary_muscles)"
            " or %(muscle)s = any (tertiary_muscles))"
        )
        params["muscle"] = muscle
    if equipment:
        where.append("%(equipment)s = any (equipment)")
        params["equipment"] = equipment
    if movement_pattern:
        where.append("movement_pattern = %(pattern)s")
        params["pattern"] = movement_pattern
    if query:
        where.append("(name ilike %(q)s or id ilike %(q)s)")
        params["q"] = f"%{query}%"
    async with conn.cursor() as cur:
        await cur.execute(
            f"select * from exercises where {' and '.join(where)} order by name", params
        )
        return await cur.fetchall()


# --- global exercise pool ----------------------------------------------------


async def search_exercise_pool(
    conn: Conn,
    *,
    muscle: str | None = None,
    equipment: list[str] | None = None,
    movement_pattern: str | None = None,
    category: str | None = None,
    query: str | None = None,
    limit: int = 40,
) -> list[dict[str, Any]]:
    """Curated movements matching the filters, best-fit first.

    Ordering is deliberate: an exercise where the muscle is a PRIMARY mover outranks one where it
    only assists, because "give me something for side delts" should not surface a bench press on
    the strength of a tertiary listing.
    """
    where: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if muscle:
        where.append(
            "(%(muscle)s = any (primary_muscles) or %(muscle)s = any (secondary_muscles)"
            " or %(muscle)s = any (tertiary_muscles))"
        )
        params["muscle"] = muscle
    if equipment is not None:
        # Availability, not preference: every listed item must be something the user has.
        #
        # `is not None`, not a truth test: an empty list is how a caller says "this user has no
        # equipment at all", and treating that as falsy silently dropped the filter and answered a
        # bodyweight-only beginner with barbell work. An empty list is normalised to bodyweight so
        # it means "nothing but your body" rather than "not even that", which would match nothing.
        available = list(equipment) or ["bodyweight"]
        where.append("equipment <@ %(equipment)s::text[]")
        params["equipment"] = available
    if movement_pattern:
        where.append("movement_pattern = %(pattern)s")
        params["pattern"] = movement_pattern
    if category:
        where.append("category = %(category)s")
        params["category"] = category
    if query:
        where.append("(%(q_exact)s = any (match_keys) or names::text ilike %(q_like)s)")
        params["q_exact"] = normalize_match_key(query)
        params["q_like"] = f"%{query}%"
    clause = f"where {' and '.join(where)}" if where else ""
    rank = ""
    if query:
        # An exact name hit outranks a substring one, or asking for "plank" answers with the
        # Copenhagen plank purely because it sorts earlier.
        rank += "case when %(q_exact)s = any (match_keys) then 0 else 1 end, "
    if muscle:
        rank += (
            "case when %(muscle)s = any (primary_muscles) then 0"
            " when %(muscle)s = any (secondary_muscles) then 1 else 2 end, "
        )
    async with conn.cursor() as cur:
        await cur.execute(
            f"select * from exercise_pool {clause} order by {rank}slug limit %(limit)s", params
        )
        return await cur.fetchall()


async def get_pool_exercises(conn: Conn, slugs: list[str]) -> list[dict[str, Any]]:
    if not slugs:
        return []
    async with conn.cursor() as cur:
        await cur.execute("select * from exercise_pool where slug = any (%s)", [slugs])
        return await cur.fetchall()


async def resolve_pool_slug(conn: Conn, value: str) -> str | None:
    """The pool slug a free-text exercise name or id refers to, if the pool knows it."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select slug from exercise_pool where %s = any (match_keys) limit 1",
            [normalize_match_key(value)],
        )
        row = await cur.fetchone()
        return row["slug"] if row else None


async def get_active_program(conn: Conn, user_id: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from programs where user_id = %s and status = 'active' "
            "order by created_at desc limit 1",
            [user_id],
        )
        return await cur.fetchone()


async def upsert_program(conn: Conn, user_id: str, prog: Program) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into programs (user_id, external_id, name, description, goal, "
            "frequency_per_week, split_type, day_template_ids, start_date, end_date, status, "
            "custom_fields) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "on conflict (user_id, external_id) where external_id is not null do update set "
            "name = excluded.name, description = excluded.description, goal = excluded.goal, "
            "frequency_per_week = excluded.frequency_per_week, split_type = excluded.split_type, "
            "day_template_ids = excluded.day_template_ids, start_date = excluded.start_date, "
            "end_date = excluded.end_date, status = excluded.status, "
            "custom_fields = excluded.custom_fields, updated_at = now() returning *",
            [
                user_id,
                prog.id,
                prog.name,
                prog.description,
                prog.goal,
                prog.frequency_per_week,
                prog.split_type.value if prog.split_type else None,
                prog.day_template_ids,
                prog.start_date,
                prog.end_date,
                prog.status.value,
                Jsonb(prog.custom_fields),
            ],
        )
        return _one(await cur.fetchone())


async def upsert_day_template(conn: Conn, user_id: str, tpl: DayTemplate) -> dict[str, Any]:
    blocks = [b.model_dump(mode="json") for b in tpl.blocks]
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into day_templates (user_id, external_id, name, program_external_id, focus, "
            "estimated_duration_min, blocks, custom_fields) "
            "values (%s, %s, %s, %s, %s, %s, %s, %s) "
            "on conflict (user_id, external_id) where external_id is not null do update set "
            "name = excluded.name, program_external_id = excluded.program_external_id, "
            "focus = excluded.focus, estimated_duration_min = excluded.estimated_duration_min, "
            "blocks = excluded.blocks, custom_fields = excluded.custom_fields, updated_at = now() "
            "returning *",
            [
                user_id,
                tpl.id,
                tpl.name,
                tpl.program_id,
                tpl.focus,
                tpl.estimated_duration_min,
                Jsonb(blocks),
                Jsonb(tpl.custom_fields),
            ],
        )
        return _one(await cur.fetchone())


async def list_day_templates(
    conn: Conn, user_id: str, program_external_id: str
) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from day_templates where user_id = %s and program_external_id = %s "
            "order by external_id",
            [user_id, program_external_id],
        )
        return await cur.fetchall()


async def list_programs(conn: Conn, user_id: str) -> list[dict[str, Any]]:
    """Every program the user has had, active or archived — for the full-history export."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from programs where user_id = %s order by created_at", [user_id]
        )
        return await cur.fetchall()


async def list_all_day_templates(conn: Conn, user_id: str) -> list[dict[str, Any]]:
    """Every day template regardless of program — for the full-history export."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from day_templates where user_id = %s order by external_id", [user_id]
        )
        return await cur.fetchall()


# --- sessions ----------------------------------------------------------------


def _working_volume(sets: list[SetEntry]) -> float:
    # All non-warmup sets count as working volume (working, backoff, dropset, amrap, failure).
    return float(sum((s.weight_kg or 0) * (s.reps or 0) for s in sets if s.type != SetType.warmup))


async def insert_session(conn: Conn, user_id: str, session: Session) -> str:
    """Insert a session and its nested entries/sets/metrics/cardio. Returns the new session id."""
    await ensure_exercises_exist(conn, user_id, [e.exercise_id for e in session.entries])
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into sessions (user_id, external_id, program_external_id, "
            "day_template_external_id, day_label, date, start_time, end_time, duration_sec, "
            "location, bodyweight_kg, session_rpe, energy_level, status, notes, tags, "
            "custom_fields) values "
            "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            [
                user_id,
                session.id,
                session.program_id,
                session.day_template_id,
                session.day_label,
                session.date,
                session.start_time,
                session.end_time,
                session.duration_sec,
                session.location,
                session.bodyweight_kg,
                session.session_rpe,
                session.energy_level,
                session.status.value,
                session.notes,
                session.tags,
                Jsonb(session.custom_fields),
            ],
        )
        session_id = _one(await cur.fetchone())["id"]

        for entry in session.entries:
            volume = entry.total_volume_kg
            if volume is None:
                volume = _working_volume(entry.sets)
            await cur.execute(
                "insert into session_entries (session_id, user_id, exercise_id, position, "
                "superset_group, notes, total_volume_kg, custom_fields) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s) returning id",
                [
                    session_id,
                    user_id,
                    entry.exercise_id,
                    entry.order,
                    entry.superset_group,
                    entry.notes,
                    volume,
                    Jsonb(entry.custom_fields),
                ],
            )
            entry_id = _one(await cur.fetchone())["id"]
            for s in entry.sets:
                await cur.execute(
                    "insert into sets (entry_id, user_id, set_number, type, weight_kg, reps, rir, "
                    "rpe, tempo, rest_sec, duration_sec, distance_m, is_per_side, completed, "
                    "notes, custom_fields) "
                    "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    [
                        entry_id,
                        user_id,
                        s.set_number,
                        s.type.value,
                        s.weight_kg,
                        s.reps,
                        s.rir,
                        s.rpe,
                        s.tempo,
                        s.rest_sec,
                        s.duration_sec,
                        s.distance_m,
                        s.is_per_side,
                        s.completed,
                        s.notes,
                        Jsonb(s.custom_fields),
                    ],
                )

        if session.metrics is not None:
            m = session.metrics
            await cur.execute(
                "insert into session_metrics (session_id, user_id, source, avg_hr, max_hr, min_hr, "
                "strain, calories, cardio_load_pct, muscular_load_pct, hr_zones, raw) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    session_id,
                    user_id,
                    m.source.value if m.source else None,
                    m.avg_hr,
                    m.max_hr,
                    m.min_hr,
                    m.strain,
                    m.calories,
                    m.cardio_load_pct,
                    m.muscular_load_pct,
                    Jsonb([z.model_dump() for z in m.hr_zones]),
                    Jsonb(m.raw),
                ],
            )

        for c in session.cardio:
            await cur.execute(
                "insert into cardio_activities (session_id, user_id, type, distance_m, "
                "duration_sec, avg_pace_sec_per_km, avg_hr, calories, timing, notes, "
                "custom_fields) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    session_id,
                    user_id,
                    c.type.value,
                    c.distance_m,
                    c.duration_sec,
                    c.avg_pace_sec_per_km,
                    c.avg_hr,
                    c.calories,
                    c.timing.value if c.timing else None,
                    c.notes,
                    Jsonb(c.custom_fields),
                ],
            )
    return str(session_id)


_SESSION_PATCH_COLS = {
    "date",
    "day_label",
    "duration_sec",
    "location",
    "bodyweight_kg",
    "session_rpe",
    "energy_level",
    "status",
    "notes",
    "tags",
    "start_time",
    "end_time",
}


def _validate_patch_keys(patch: dict[str, Any], allowed: set[str], what: str) -> None:
    """Reject a patch containing unknown keys instead of silently dropping them.

    The assistant patches by key name; a typo (weight vs weight_kg) silently dropped would
    return a success-shaped response while fixing nothing — the model then tells the user the
    log is corrected when it isn't. Rejecting atomically (no partial apply) turns the typo into
    a self-correctable tool error."""
    unknown = set(patch) - allowed
    if unknown:
        raise ValueError(
            f"unknown {what} patch keys: {sorted(unknown)}; allowed keys: {sorted(allowed)}"
        )


def _validate_patch_values(patch: dict[str, Any], what: str) -> None:
    """Run patch values through the pydantic models so a fix obeys the same bounds as a log
    (a set logged with weight_kg=-24 is rejected; patching it to -24 must be rejected too)."""
    try:
        if what == "set":
            SetEntry.model_validate({"set_number": 1, **patch})
        else:
            Session.model_validate({"date": "2000-01-01", **patch})
    except PydanticValidationError as e:
        first = e.errors()[0]
        field = ".".join(str(p) for p in first["loc"])
        raise ValueError(f"invalid {what} patch value for '{field}': {first['msg']}") from None


async def update_session(
    conn: Conn, user_id: str, session_id: str, patch: dict[str, Any]
) -> dict[str, Any] | None:
    _validate_patch_keys(patch, _SESSION_PATCH_COLS, "session")
    _validate_patch_values(patch, "session")
    resolved_id = await resolve_session_id(conn, user_id, session_id)
    if resolved_id is None:
        return None
    fields = {k: v for k, v in patch.items() if k in _SESSION_PATCH_COLS}
    if not fields:
        return await get_session(conn, user_id, resolved_id)
    sets_sql = ", ".join(f"{k} = %s" for k in fields)
    async with conn.cursor() as cur:
        await cur.execute(
            f"update sessions set {sets_sql} where id = %s and user_id = %s returning id",
            [*fields.values(), resolved_id, user_id],
        )
        if await cur.fetchone() is None:
            return None
    return await get_session(conn, user_id, resolved_id)


_SET_PATCH_COLS = {
    "weight_kg",
    "reps",
    "rir",
    "rpe",
    "tempo",
    "rest_sec",
    "duration_sec",
    "distance_m",
    "is_per_side",
    "completed",
    "notes",
    "type",
}


async def _recompute_entry_volume(cur: psycopg.AsyncCursor[dict[str, Any]], entry_id: str) -> None:
    await cur.execute(
        "update session_entries set total_volume_kg = ("
        "  select coalesce(sum(weight_kg * reps), 0) from sets "
        "  where entry_id = %s and type <> 'warmup'"
        ") where id = %s",
        [entry_id, entry_id],
    )


async def resolve_session_id(conn: Conn, user_id: str, session_id: str) -> str | None:
    """Resolve a session reference to its primary uuid; accepts the uuid or the document
    external_id (the model naturally quotes ids like 'sess_0003' from imported documents).
    Comparing id::text keeps a non-uuid string a clean miss instead of a Postgres cast error
    leaking into the tool response."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select id from sessions where user_id = %s and (id::text = %s or external_id = %s) "
            "limit 1",
            [user_id, session_id, session_id],
        )
        row = await cur.fetchone()
        return str(row["id"]) if row else None


async def update_set(
    conn: Conn,
    user_id: str,
    session_id: str,
    exercise_id: str,
    set_number: int,
    patch: dict[str, Any],
    *,
    occurrence: int = 1,
) -> dict[str, Any] | None:
    """Fix a key metric of exactly one set, located by (session, exercise, set_number).

    `occurrence` (1-based) disambiguates when the exercise appears more than once in the session
    (e.g. done twice / in two blocks); entries are ordered by their position. Updates a single row
    and refreshes that entry's cached volume.
    """
    _validate_patch_keys(patch, _SET_PATCH_COLS, "set")
    _validate_patch_values(patch, "set")
    fields = {k: v for k, v in patch.items() if k in _SET_PATCH_COLS}
    if not fields:
        return None
    resolved_id = await resolve_session_id(conn, user_id, session_id)
    if resolved_id is None:
        return None
    async with conn.cursor() as cur:
        await cur.execute(
            "select s.id as set_id, s.entry_id from sets s "
            "join session_entries e on s.entry_id = e.id "
            "where e.session_id = %s and e.exercise_id = %s and s.set_number = %s "
            "and s.user_id = %s "
            "order by e.position nulls last, e.id "
            "limit 1 offset %s",
            [resolved_id, exercise_id, set_number, user_id, max(occurrence - 1, 0)],
        )
        target = await cur.fetchone()
        if target is None:
            return None
        sets_sql = ", ".join(f"{k} = %s" for k in fields)
        await cur.execute(
            f"update sets set {sets_sql} where id = %s returning *",
            [*fields.values(), target["set_id"]],
        )
        updated = await cur.fetchone()
        await _recompute_entry_volume(cur, target["entry_id"])
        return updated


async def get_session(conn: Conn, user_id: str, session_id: str) -> dict[str, Any] | None:
    resolved_id = await resolve_session_id(conn, user_id, session_id)
    if resolved_id is None:
        return None
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from sessions where id = %s and user_id = %s", [resolved_id, user_id]
        )
        session = await cur.fetchone()
        if session is None:
            return None
        await cur.execute(
            "select e.*, ex.name as exercise_name from session_entries e "
            "left join exercises ex on ex.user_id = e.user_id and ex.id = e.exercise_id "
            "where e.session_id = %s order by e.position nulls last, e.id",
            [resolved_id],
        )
        entries = await cur.fetchall()
        # One query for all sets in the session (avoids N+1), grouped by entry.
        await cur.execute(
            "select s.* from sets s join session_entries e on s.entry_id = e.id "
            "where e.session_id = %s order by s.set_number",
            [resolved_id],
        )
        sets_by_entry: dict[str, Any] = defaultdict(list)
        for s in await cur.fetchall():
            sets_by_entry[s["entry_id"]].append(s)
        for e in entries:
            e["sets"] = sets_by_entry.get(e["id"], [])
        session["entries"] = entries
        # Session total = Σ(weight × reps) over non-warmup sets (consistent with list_sessions).
        session["total_volume_kg"] = sum(
            float(s["weight_kg"]) * float(s["reps"])
            for e in entries
            for s in e["sets"]
            if (s["type"] or "working") != "warmup" and s["weight_kg"] and s["reps"]
        )
        await cur.execute("select * from session_metrics where session_id = %s", [resolved_id])
        session["metrics"] = await cur.fetchone()
        await cur.execute(
            "select * from cardio_activities where session_id = %s order by id", [resolved_id]
        )
        session["cardio"] = await cur.fetchall()
    return session


async def list_sessions(
    conn: Conn,
    user_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    clauses = ["user_id = %s"]
    params: list[Any] = [user_id]
    if date_from is not None:
        clauses.append("date >= %s")
        params.append(date_from)
    if date_to is not None:
        clauses.append("date <= %s")
        params.append(date_to)
    params.append(limit)
    async with conn.cursor() as cur:
        await cur.execute(
            "select s.*, "
            "(select coalesce(sum(st.weight_kg * st.reps), 0) "
            " from session_entries e join sets st on st.entry_id = e.id "
            " where e.session_id = s.id and st.type <> 'warmup') as total_volume_kg "
            f"from sessions s where {' and '.join(clauses)} "
            "order by date desc, created_at desc limit %s",
            params,
        )
        return await cur.fetchall()


async def delete_session(conn: Conn, user_id: str, session_id: str) -> bool:
    resolved_id = await resolve_session_id(conn, user_id, session_id)
    if resolved_id is None:
        return False
    async with conn.cursor() as cur:
        await cur.execute(
            "delete from sessions where id = %s and user_id = %s returning id",
            [resolved_id, user_id],
        )
        return await cur.fetchone() is not None


async def delete_session_by_external_id(conn: Conn, user_id: str, external_id: str | None) -> None:
    """Remove any session previously imported with this external_id (for idempotent re-import)."""
    if external_id is None:
        return
    async with conn.cursor() as cur:
        await cur.execute(
            "delete from sessions where user_id = %s and external_id = %s",
            [user_id, external_id],
        )


async def delete_body_metric_by_external_id(
    conn: Conn, user_id: str, external_id: str | None
) -> None:
    if external_id is None:
        return
    async with conn.cursor() as cur:
        await cur.execute(
            "delete from body_metrics where user_id = %s and external_id = %s",
            [user_id, external_id],
        )


# --- body metrics ------------------------------------------------------------


async def insert_body_metric(conn: Conn, user_id: str, bm: BodyMetric) -> dict[str, Any]:
    # Manual/chat-logged entries (no external_id) upsert by date: re-logging today's weight
    # corrects the existing row instead of leaving two ambiguous rows for the same day. Imported
    # entries (external_id set, matched/cleaned up by external_id elsewhere) are exempt — a real
    # source document may legitimately carry more than one measurement per date.
    if bm.id is None:
        async with conn.cursor() as cur:
            await cur.execute(
                "update body_metrics set bodyweight_kg=%s, body_fat_pct=%s, measurements=%s, "
                "source=%s, notes=%s, custom_fields=%s "
                "where user_id=%s and date=%s and external_id is null "
                "returning *",
                [
                    bm.bodyweight_kg,
                    bm.body_fat_pct,
                    Jsonb(bm.measurements),
                    bm.source,
                    bm.notes,
                    Jsonb(bm.custom_fields),
                    user_id,
                    bm.date,
                ],
            )
            updated = await cur.fetchone()
            if updated is not None:
                return updated

    async with conn.cursor() as cur:
        await cur.execute(
            "insert into body_metrics (user_id, external_id, date, bodyweight_kg, body_fat_pct, "
            "measurements, source, notes, custom_fields) values (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "returning *",
            [
                user_id,
                bm.id,
                bm.date,
                bm.bodyweight_kg,
                bm.body_fat_pct,
                Jsonb(bm.measurements),
                bm.source,
                bm.notes,
                Jsonb(bm.custom_fields),
            ],
        )
        return _one(await cur.fetchone())


async def list_body_metrics(conn: Conn, user_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from body_metrics where user_id = %s order by date desc limit %s",
            [user_id, limit],
        )
        return await cur.fetchall()


# --- stats source queries ----------------------------------------------------


async def sets_for_exercise(conn: Conn, user_id: str, exercise_id: str) -> list[dict[str, Any]]:
    """Flat rows of every set for an exercise with its session date — input for progression."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select se.date, s.set_number, s.type, s.weight_kg, s.reps, s.rir, s.rpe "
            "from sets s "
            "join session_entries e on s.entry_id = e.id "
            "join sessions se on e.session_id = se.id "
            "where s.user_id = %s and e.exercise_id = %s "
            "order by se.date, s.set_number",
            [user_id, exercise_id],
        )
        return await cur.fetchall()


async def weekly_muscle_rows(
    conn: Conn, user_id: str, *, date_from: date, date_to: date | None = None
) -> list[dict[str, Any]]:
    """One row per working set since ``date_from``, carrying the exercise's muscle lists + reps
    + the session's date.

    Input for ``stats.weekly_muscle_load`` — drives the per-muscle weekly tally and the body
    heatmap. Also the input for a weekly_volume/maintenance goal's multi-week history
    (services._featured_goal_progress), which buckets these rows by ISO week using the ``date``
    column — callers that only need the current window's totals (weekly_muscle_load) simply
    ignore it. ``rir``/``rpe`` carry set effort and ``category``/``movement_pattern`` the exercise
    type, both feeding stats.current_muscle_load's recovery modifiers. Warmup sets are excluded so
    the count reflects real stimulus.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            "select s.reps, s.rir, s.rpe, ex.category, ex.movement_pattern, ex.long_length, "
            "ex.primary_muscles, ex.secondary_muscles, ex.tertiary_muscles, se.date "
            "from sets s "
            "join session_entries e on s.entry_id = e.id "
            "join sessions se on e.session_id = se.id "
            "join exercises ex on ex.user_id = se.user_id and ex.id = e.exercise_id "
            # Upper bound as well as lower, when the caller supplies one: a session dated in the
            # future (an assistant writing down "next Saturday", or a wrong device clock) had its
            # age floored to zero and painted the muscle as if the work were already done today.
            # `date_to is None` must mean "no ceiling", not "se.date <= NULL", which matches
            # nothing — callers that only bucket by week (goal history) pass no ceiling.
            "where s.user_id = %s and se.date >= %s "
            + ("and se.date <= %s " if date_to is not None else "")
            + "and coalesce(s.type, 'working') <> 'warmup'",
            [user_id, date_from] + ([date_to] if date_to is not None else []),
        )
        return await cur.fetchall()


async def muscle_exposure_counts(
    conn: Conn, user_id: str, *, date_from: date
) -> list[dict[str, Any]]:
    """Training DAYS per (muscle, movement_pattern) since ``date_from``, aggregated in SQL.

    Feeds the repeated-bout term in stats.current_muscle_load: how accustomed each muscle is to
    each movement. Counts distinct days, not sets — the protection literature is dosed in bouts
    ("after one prior bout, markers were not significantly elevated"), and counting sets would let
    a single first-ever session of four sets credit itself with three prior exposures.
    Aggregated server-side because the window is six months; pulling one row per set the way
    weekly_muscle_rows does would be thousands of rows for a consistent trainee.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            "select m.muscle, coalesce(ex.movement_pattern, 'other') as movement_pattern, "
            "count(distinct se.date) as n "
            "from sets s "
            "join session_entries e on s.entry_id = e.id "
            "join sessions se on e.session_id = se.id "
            "join exercises ex on ex.user_id = se.user_id and ex.id = e.exercise_id "
            # Primary + secondary only, deliberately: the repeated-bout term decides whether a
            # muscle is ACCUSTOMED to a pattern, and a tertiary listing (abs on a standing press)
            # is not a bout. Counting it would let incidental stabiliser work mark a muscle as
            # trained-through and shorten its recovery window on the day it is actually loaded.
            "cross join lateral unnest("
            "  coalesce(ex.primary_muscles, '{}') || coalesce(ex.secondary_muscles, '{}')"
            ") as m(muscle) "
            "where s.user_id = %s and se.date >= %s "
            "  and coalesce(s.type, 'working') <> 'warmup' "
            # Same exclusion as the dose (stats._NON_DOSING_CATEGORIES). Without it, work that
            # deposits nothing still bought recovery protection: fourteen supermans marked the
            # erectors as accustomed to hinging and cut a novice's first-deadlift countdown by a
            # third — in the one direction the model treats as unsafe.
            "  and coalesce(ex.category, '') not in ('mobility', 'cardio') "
            "group by 1, 2",
            [user_id, date_from],
        )
        return await cur.fetchall()


async def first_session_date(conn: Conn, user_id: str) -> date | None:
    """MIN(date) across the user's sessions — used only to know whether there's enough logged
    training history for the streak's behavioral 90-day baseline (services._streak). Session
    dates, not account age: an old account that only started logging last week has no baseline."""
    async with conn.cursor() as cur:
        await cur.execute("select min(date) as d from sessions where user_id = %s", [user_id])
        row = await cur.fetchone()
    return row["d"] if row else None


async def session_volumes(
    conn: Conn, user_id: str, *, date_from: date | None = None
) -> list[dict[str, Any]]:
    """Per-session date + total working volume — input for volume-over-time charts."""
    clauses = ["s.user_id = %s"]
    params: list[Any] = [user_id]
    if date_from is not None:
        clauses.append("s.date >= %s")
        params.append(date_from)
    async with conn.cursor() as cur:
        await cur.execute(
            "select s.id, s.date, "
            "coalesce((select sum(st.weight_kg * st.reps) "
            "          from session_entries e join sets st on st.entry_id = e.id "
            "          where e.session_id = s.id and st.type <> 'warmup'), 0) as volume_kg "
            f"from sessions s where {' and '.join(clauses)} order by s.date",
            params,
        )
        return await cur.fetchall()


# --- coaching ------------------------------------------------------------------

# Columns writable through a CoachProfilePatch. Injuries are handled separately
# (append/resolve, never whole-array overwrite from the model).
COACH_PROFILE_COLS = {
    "primary_goal",
    "goal_detail",
    "motivation",
    "experience_level",
    "training_days_per_week",
    "session_length_min",
    "preferred_days",
    "preferred_time",
    "schedule_cue",
    "locations",
    "equipment",
    "focus_muscles",
    "likes",
    "dislikes",
    "coaching_tone",
    "language",
    "confidence_score",
    "checkin_cadence_days",
    "profile_summary",
}
_JSONB_PROFILE_COLS = {"injuries", "parq_flags"}
_META_PROFILE_COLS = {"medical_clearance_advised", "intake_status", "next_review_date"}


async def get_coach_profile(
    conn: Conn, user_id: str, *, for_update: bool = False
) -> dict[str, Any] | None:
    """The profile row. `for_update` locks it so concurrent read-modify-write patches
    (e.g. two eager injury updates in one conversation) serialize instead of clobbering."""
    suffix = " for update" if for_update else ""
    async with conn.cursor() as cur:
        await cur.execute(f"select * from coach_profiles where user_id = %s{suffix}", [user_id])
        return await cur.fetchone()


async def ensure_coach_profile(
    conn: Conn, user_id: str, *, for_update: bool = False
) -> dict[str, Any]:
    """The profile row, creating an empty one on first touch (read-only on the common path)."""
    row = await get_coach_profile(conn, user_id, for_update=for_update)
    if row is not None:
        return row
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into coach_profiles (user_id) values (%s) on conflict (user_id) do nothing",
            [user_id],
        )
    return _one(await get_coach_profile(conn, user_id, for_update=for_update))


_USER_ANTHRO_COLS = {"sex", "birth_date", "height_cm", "bodyweight_kg"}


async def update_user_anthropometrics(
    conn: Conn, user_id: str, fields: dict[str, Any]
) -> dict[str, Any] | None:
    """Set anthropometric columns on the users row (coach.USER_PROFILE_FIELDS routing)."""
    fields = {k: v for k, v in fields.items() if k in _USER_ANTHRO_COLS}
    if not fields:
        return await get_user(conn, user_id)
    sets_sql = ", ".join(f"{k} = %s" for k in fields)
    async with conn.cursor() as cur:
        await cur.execute(
            f"update users set {sets_sql} where id = %s returning *",
            [*fields.values(), user_id],
        )
        return await cur.fetchone()


async def update_coach_profile_fields(
    conn: Conn, user_id: str, fields: dict[str, Any]
) -> dict[str, Any]:
    """Set already-validated profile columns; jsonb values are wrapped here."""
    allowed = COACH_PROFILE_COLS | _JSONB_PROFILE_COLS | _META_PROFILE_COLS
    fields = {k: v for k, v in fields.items() if k in allowed}
    if not fields:
        return await ensure_coach_profile(conn, user_id)
    values = [Jsonb(v) if k in _JSONB_PROFILE_COLS else v for k, v in fields.items()]
    sets_sql = ", ".join(f"{k} = %s" for k in fields)
    async with conn.cursor() as cur:
        await cur.execute(
            f"update coach_profiles set {sets_sql} where user_id = %s returning *",
            [*values, user_id],
        )
        return _one(await cur.fetchone())


_GOAL_COLS = {
    "kind",
    "title",
    "target",
    "status",
    "source",
    "ratified",
    "review_date",
    "notes",
    "custom_fields",
    "featured",
    "supersedes_goal_id",
}
_GOAL_JSONB = {"target", "custom_fields"}


async def upsert_user_goal(conn: Conn, user_id: str, goal: dict[str, Any]) -> dict[str, Any]:
    """Insert a goal, or patch one by id — only the keys present in `goal` are written, so an
    update never resets omitted columns (ratified/status/…) to model defaults. `goal` is a
    GoalInput dump with exclude_unset. Raises ValueError if the id matches no row for this user
    (a stale/foreign id must not silently become a duplicate goal)."""
    cols = {k: v for k, v in goal.items() if k in _GOAL_COLS}
    values = [Jsonb(v) if k in _GOAL_JSONB and v is not None else v for k, v in cols.items()]
    async with conn.cursor() as cur:
        if cols.get("featured"):
            # Only one active goal is ever featured per user — clear any prior one in the same
            # transaction before writing this one, for both the insert and the update path
            # (`goal.get("id")` is None on insert, and `id is distinct from null` is true for
            # every existing row, so this still clears correctly). The partial unique index
            # (migration 20260718000000) is the backstop against a bug leaving two, not the
            # primary mechanism.
            await cur.execute(
                "update user_goals set featured = false "
                "where user_id = %s and featured and id is distinct from %s",
                [user_id, goal.get("id")],
            )
        if goal.get("id"):
            sets_sql = ", ".join(f"{k} = %s" for k in cols)
            await cur.execute(
                f"update user_goals set {sets_sql} where id = %s and user_id = %s returning *",
                [*values, goal["id"], user_id],
            )
            row = await cur.fetchone()
            if row is None:
                raise ValueError(f"goal {goal['id']} not found")
            return row
        keys = ["user_id", *cols]
        await cur.execute(
            f"insert into user_goals ({', '.join(keys)}) "
            f"values ({', '.join(['%s'] * len(keys))}) returning *",
            [user_id, *values],
        )
        return _one(await cur.fetchone())


async def list_user_goals(
    conn: Conn, user_id: str, status: str | None = "active"
) -> list[dict[str, Any]]:
    clauses, params = ["user_id = %s"], [user_id]
    if status and status != "all":
        clauses.append("status = %s")
        params.append(status)
    async with conn.cursor() as cur:
        await cur.execute(
            f"select * from user_goals where {' and '.join(clauses)} order by created_at",
            params,
        )
        return await cur.fetchall()


async def list_coach_events(conn: Conn, user_id: str) -> list[dict[str, Any]]:
    """Full lifecycle audit log, oldest first — for the full-history export."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from coach_events where user_id = %s order by created_at", [user_id]
        )
        return await cur.fetchall()


async def latest_coach_event(conn: Conn, user_id: str, type_: str) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(
            "select * from coach_events where user_id = %s and type = %s "
            "order by created_at desc limit 1",
            [user_id, type_],
        )
        return await cur.fetchone()


async def insert_coach_event(
    conn: Conn, user_id: str, type_: str, payload: dict[str, Any]
) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into coach_events (user_id, type, payload) values (%s, %s, %s) returning *",
            [user_id, type_, Jsonb(payload)],
        )
        return _one(await cur.fetchone())


async def production_prompts(conn: Conn) -> dict[str, str]:
    """All production-labeled prompt bodies at once (merged over code fallbacks by services)."""
    async with conn.cursor() as cur:
        await cur.execute("select key, body from prompt_templates where label = 'production'")
        return {r["key"]: r["body"] for r in await cur.fetchall()}


async def upsert_prompt_template(
    conn: Conn,
    *,
    key: str,
    version: int,
    body: str,
    label: str = "production",
    changelog: str | None = None,
) -> dict[str, Any]:
    """Seed-script writer. Demotes any other production version of the key first so the
    partial unique index (one production row per key) never conflicts."""
    async with conn.cursor() as cur:
        if label == "production":
            await cur.execute(
                "update prompt_templates set label = 'draft' "
                "where key = %s and label = 'production' and version <> %s",
                [key, version],
            )
        await cur.execute(
            "insert into prompt_templates (key, version, label, body, changelog) "
            "values (%s, %s, %s, %s, %s) "
            "on conflict (key, version) do update set "
            "label = excluded.label, body = excluded.body, "
            "changelog = excluded.changelog returning *",
            [key, version, label, body, changelog],
        )
        return _one(await cur.fetchone())


async def coach_state(conn: Conn, user_id: str) -> dict[str, Any]:
    """One-statement coaching probe for get_me: intake status, review date, and the titles of
    active user-ratified goals (unratified coach proposals are not the user's goals yet)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select cp.intake_status, cp.next_review_date, "
            "(select coalesce(array_agg(g.title order by g.created_at), '{}') from user_goals g "
            " where g.user_id = %s and g.status = 'active' and g.ratified) as goal_titles "
            "from coach_profiles cp where cp.user_id = %s",
            [user_id, user_id],
        )
        row = await cur.fetchone()
    if row is None:
        # No profile row yet — still surface ratified goals (e.g. migrated ones).
        async with conn.cursor() as cur:
            await cur.execute(
                "select coalesce(array_agg(title order by created_at), '{}') as goal_titles "
                "from user_goals where user_id = %s and status = 'active' and ratified",
                [user_id],
            )
            g = _one(await cur.fetchone())
        return {
            "intake_status": "not_started",
            "next_review_date": None,
            "goal_titles": g["goal_titles"],
        }
    return row


# --- observability ------------------------------------------------------------------------------


async def insert_tool_call(
    conn: Conn,
    *,
    user_id: str | None,
    tool: str,
    args: dict[str, Any] | None,
    ok: bool,
    error: str | None,
    duration_ms: int,
    client_key: str | None = None,
) -> None:
    """client_key separates callers who share one token (the public demo account); it is an
    opaque salted digest, never a raw IP or user agent, and null for everyone else."""
    async with conn.cursor() as cur:
        await cur.execute(
            "insert into tool_calls (user_id, tool, args, ok, error, duration_ms, client_key)"
            " values (%s, %s, %s, %s, %s, %s, %s)",
            [
                user_id,
                tool,
                Jsonb(args) if args is not None else None,
                ok,
                error,
                duration_ms,
                client_key,
            ],
        )


async def latest_tool_call(conn: Conn, user_id: str) -> dict[str, Any] | None:
    """Most recent tool call for the user, any outcome — used to confirm the connector is
    actually wired up (uses the tool_calls_user_time index)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select tool, created_at from tool_calls where user_id = %s"
            " order by created_at desc limit 1",
            [user_id],
        )
        return await cur.fetchone()


async def prune_tool_calls(conn: Conn, keep_days: int) -> int:
    """Keep the telemetry table bounded; called by the daily backup cron."""
    async with conn.cursor() as cur:
        await cur.execute(
            "delete from tool_calls where created_at < now() - make_interval(days => %s)",
            [keep_days],
        )
        return cur.rowcount


async def count_recent_tool_calls(conn: Conn, user_id: str, since: datetime) -> int:
    """Used by the demo-account write guard (demo_guard.py) to rate-limit a public token."""
    async with conn.cursor() as cur:
        await cur.execute(
            "select count(*) as n from tool_calls where user_id = %s and created_at >= %s",
            [user_id, since],
        )
        return int(_one(await cur.fetchone())["n"])


async def count_sessions(conn: Conn, user_id: str) -> int:
    """Used by the demo-account write guard to cap total rows a public token can accumulate."""
    async with conn.cursor() as cur:
        await cur.execute("select count(*) as n from sessions where user_id = %s", [user_id])
        return int(_one(await cur.fetchone())["n"])


async def reset_demo_data(conn: Conn, user_id: str) -> dict[str, int]:
    """Nightly wipe for the public demo account (reset_demo.py). Sessions cascade to
    session_entries/sets/session_metrics/cardio_activities; exercises/programs/day_templates and
    the coach profile itself are left alone — only the tables the write guard rate-limits."""
    counts: dict[str, int] = {}
    async with conn.cursor() as cur:
        for table in ("sessions", "body_metrics", "user_goals", "coach_events"):
            await cur.execute(f"delete from {table} where user_id = %s", [user_id])  # noqa: S608
            counts[table] = cur.rowcount
    return counts
