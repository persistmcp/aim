"""The global exercise pool and the catalog-first path through it.

Each test here pins one thing that was broken (or absent) before the pool existed: an auto-created
exercise carrying no muscles and therefore missing from the muscle panel, a partial upsert wiping
the metadata the panel joins on, and the coach having no way to ask "what is there for side delts
with dumbbells" without dumping the whole catalog.
"""

from datetime import date

import pytest
from fastmcp import Client

from workout_storage import services

from .conftest import call_tool as _call
from .conftest import mcp_server

pytestmark = pytest.mark.e2e


async def test_pool_is_seeded_and_shared(as_user):
    async with Client(mcp_server()) as client:
        res = await _call(client, "search_exercise_pool", query="жим штанги лёжа")
    slugs = [e["slug"] for e in res["exercises"]]
    assert "bb_bench_press" in slugs
    entry = next(e for e in res["exercises"] if e["slug"] == "bb_bench_press")
    assert entry["primary_muscles"] == ["chest"]
    assert entry["in_user_catalog"] is False


async def test_pool_search_filters_by_muscle_and_ranks_primary_first(as_user):
    async with Client(mcp_server()) as client:
        res = await _call(client, "search_exercise_pool", muscle="side_delts", limit=50)
    entries = res["exercises"]
    assert entries, "side delts must have exercises"
    # A movement that only lists the muscle as an assistant must never outrank a direct one.
    first_assist = next(
        (i for i, e in enumerate(entries) if "side_delts" not in e["primary_muscles"]),
        len(entries),
    )
    last_primary = max(
        (i for i, e in enumerate(entries) if "side_delts" in e["primary_muscles"]), default=-1
    )
    assert last_primary < first_assist


async def test_pool_equipment_filter_is_availability_not_preference(as_user):
    """`equipment=[...]` means "this is all the user has" — a barbell lift must not come back."""
    async with Client(mcp_server()) as client:
        res = await _call(
            client, "search_exercise_pool", muscle="chest", equipment=["bodyweight"], limit=50
        )
    for entry in res["exercises"]:
        assert set(entry["equipment"]) <= {"bodyweight"}, entry["slug"]
    assert "push_up" in [e["slug"] for e in res["exercises"]]


async def test_pool_names_follow_the_requested_locale(as_user):
    async with Client(mcp_server()) as client:
        ru = await _call(client, "search_exercise_pool", query="plank", locale="ru")
        pt = await _call(client, "search_exercise_pool", query="plank", locale="pt")
    assert ru["exercises"][0]["name"] == "Планка"
    assert pt["exercises"][0]["name"] == "Prancha"


async def test_logging_against_a_pool_slug_creates_a_complete_catalog_row(as_user):
    """The regression this exists for: an auto-created exercise used to have no muscles at all,
    and `weekly_muscle_rows` INNER JOINs the catalog — so the sets vanished from the muscle map."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-01",
                "entries": [
                    {
                        "exercise_id": "lat_pulldown",
                        "sets": [{"set_number": 1, "weight_kg": 50, "reps": 10}],
                    }
                ],
            },
        )
        catalog = await _call(client, "list_exercises")

    row = next(e for e in catalog if e["id"] == "lat_pulldown")
    assert row["pool_slug"] == "lat_pulldown"
    assert row["primary_muscles"] == ["lats"]
    assert row["category"] == "compound"
    # English, not Russian: the stored name follows the user's own language
    # (coach_profiles.language) and falls back to English like the web app does.
    assert row["name"] == "Lat Pulldown"
    # Technique text is served from the pool rather than copied into the row, which has no locale.
    assert row["instructions"]
    assert row["instructions_source"] == "pool"


async def test_unknown_exercise_still_auto_creates_a_bare_row(as_user):
    """Pool matching must not become a gate: a genuinely custom movement still gets logged."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-02",
                "entries": [
                    {
                        "exercise_id": "my_knee_rehab_circuit",
                        "sets": [{"set_number": 1, "reps": 15}],
                    }
                ],
            },
        )
        catalog = await _call(client, "list_exercises")

    row = next(e for e in catalog if e["id"] == "my_knee_rehab_circuit")
    assert row["pool_slug"] is None
    assert row["primary_muscles"] == []


async def test_upsert_links_a_russian_name_to_the_pool(as_user):
    async with Client(mcp_server()) as client:
        created = await _call(
            client, "upsert_exercise", exercise={"id": "жим ногами", "name": "Жим ногами"}
        )
    assert created["pool_slug"] == "leg_press"


async def test_partial_upsert_keeps_metadata_it_did_not_mention(as_user):
    """The old full-column overwrite reset muscles/category to defaults whenever the coach came
    back to add `instructions` — silently emptying the muscle panel for that exercise."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "upsert_exercise",
            exercise={
                "id": "custom_press",
                "name": "Custom Press",
                "category": "compound",
                "primary_muscles": ["chest"],
                "equipment": ["dumbbell"],
            },
        )
        updated = await _call(
            client,
            "upsert_exercise",
            exercise={"id": "custom_press", "name": "Custom Press", "instructions": "cue"},
        )
    assert updated["primary_muscles"] == ["chest"]
    assert updated["category"] == "compound"
    assert updated["equipment"] == ["dumbbell"]
    assert updated["instructions"] == "cue"


async def test_explicitly_sent_empty_list_still_clears(as_user):
    """ "Left alone" must mean omitted, not falsy — clearing has to stay possible."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "upsert_exercise",
            exercise={"id": "clearable", "name": "Clearable", "primary_muscles": ["chest"]},
        )
        updated = await _call(
            client,
            "upsert_exercise",
            exercise={"id": "clearable", "name": "Clearable", "primary_muscles": []},
        )
    assert updated["primary_muscles"] == []


async def test_list_exercises_filters_by_muscle(as_user):
    async with Client(mcp_server()) as client:
        for slug in ("lat_pulldown", "bb_bench_press"):
            await _call(client, "upsert_exercise", exercise={"id": slug, "name": slug})
        lats = await _call(client, "list_exercises", muscle="lats")
    assert [e["id"] for e in lats] == ["lat_pulldown"]


async def test_tertiary_muscles_reach_the_muscle_panel(as_user):
    """A pool exercise names stabilisers; the panel must credit them at a quarter set, not zero
    (invisible) and not half (indistinguishable from a real synergist)."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-03",
                "entries": [
                    {
                        "exercise_id": "bb_bench_press",
                        "sets": [{"set_number": n, "weight_kg": 60, "reps": 8} for n in (1, 2)],
                    }
                ],
            },
        )
    panel = await services.get_muscle_volume(today=date(2026, 8, 3))

    by_muscle = {m["muscle"]: m["sets"] for m in panel["muscles"]}
    assert by_muscle["chest"] == 2.0  # primary
    assert by_muscle["triceps"] == 1.0  # secondary, half credit
    assert by_muscle["upper_back"] == 0.5  # tertiary, quarter credit


async def test_illustrated_entries_expose_their_licence(as_user):
    """CC BY-SA is only satisfied if the credit reaches the surface that shows the picture, so the
    licence and attribution must travel in the same payload as the URL — never as a lookup a
    caller can forget."""
    async with Client(mcp_server()) as client:
        res = await _call(client, "search_exercise_pool", query="bench press")
    entry = next(e for e in res["exercises"] if e["slug"] == "bb_bench_press")
    assert entry["image_url"] == "/exercises/bb_bench_press-1.webp"
    assert entry["image_urls"] == [
        "/exercises/bb_bench_press-1.webp",
        "/exercises/bb_bench_press-2.webp",
    ]
    assert entry["image_license"] == "CC BY-SA 4.0"
    assert "Everkinetic" in entry["image_attribution"]


async def test_every_published_image_path_exists_on_disk(as_user):
    """A URL in the DB that 404s in the app is the failure mode this whole import exists to avoid,
    since we host the files ourselves rather than hotlinking someone else's repository."""
    import json
    from pathlib import Path as _Path

    root = _Path(__file__).resolve().parents[2]
    public = root.parent / "web" / "public"
    rows = json.loads((root / "exercise_pool_seed.json").read_text(encoding="utf-8"))
    published = [url for r in rows for url in r["image_urls"]]
    assert published, "the seed should carry illustrations"
    missing = [u for u in published if not (public / u.lstrip("/")).exists()]
    assert missing == []


async def test_pool_linked_partial_update_keeps_customisation(as_user):
    """The regression that made the merge-upsert a lie: pool defaults were re-applied on every
    write, so a customised barbell-only bench got `bench` added back the next time the coach
    touched an unrelated field."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "upsert_exercise",
            exercise={
                "id": "bb_bench_press",
                "name": "Жим штанги лёжа",
                "equipment": ["barbell"],
                "primary_muscles": ["chest", "triceps"],
            },
        )
        updated = await _call(
            client,
            "upsert_exercise",
            exercise={"id": "bb_bench_press", "name": "Жим штанги лёжа", "instructions": "cue"},
        )
    assert updated["equipment"] == ["barbell"]
    assert updated["primary_muscles"] == ["chest", "triceps"]
    assert updated["pool_slug"] == "bb_bench_press"


async def test_rename_does_not_repoint_the_pool_link(as_user):
    """Re-deriving the link on every write let a rename retroactively reassign the muscles of
    every set already logged under that id."""
    async with Client(mcp_server()) as client:
        first = await _call(
            client, "upsert_exercise", exercise={"id": "leg_day_1", "name": "Жим ногами"}
        )
        renamed = await _call(
            client, "upsert_exercise", exercise={"id": "leg_day_1", "name": "Приседания со штангой"}
        )
    assert first["pool_slug"] == "leg_press"
    assert renamed["pool_slug"] == "leg_press"


async def test_empty_equipment_means_no_equipment(as_user):
    """`equipment=[]` is how a caller says "this user has nothing" — it used to be falsy and drop
    the filter entirely, answering a bodyweight beginner with barbell work."""
    async with Client(mcp_server()) as client:
        nothing = await _call(client, "search_exercise_pool", equipment=[], limit=100)
        unfiltered = await _call(client, "search_exercise_pool", limit=100)
    assert nothing["count"] < unfiltered["count"]
    for entry in nothing["exercises"]:
        assert set(entry["equipment"]) <= {"bodyweight"}, entry["slug"]


async def test_generic_names_do_not_resolve_to_a_specific_exercise(as_user):
    """ "Присед" is a movement class, not an exercise. Resolving it to the barbell back squat
    stamped `equipment: ["barbell"]` onto work that may have used none."""
    async with Client(mcp_server()) as client:
        for generic in ("Присед", "Приседания", "Пресс"):
            created = await _call(
                client, "upsert_exercise", exercise={"id": generic, "name": generic}
            )
            assert created["pool_slug"] is None, generic
            assert created["equipment"] == [], generic


async def test_a_bare_auto_created_row_can_still_be_linked_later(as_user):
    """The regression the creation-only fix introduced: a row auto-created by logging an ad-hoc
    name, then re-linked by passing the pool slug, kept the link but no muscles — and
    `weekly_muscle_rows` inner-joins on exactly that metadata, so its sets stayed invisible."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-05",
                "entries": [
                    {"exercise_id": "my_flat_bench", "sets": [{"set_number": 1, "reps": 8}]}
                ],
            },
        )
        relinked = await _call(
            client,
            "upsert_exercise",
            exercise={
                "id": "my_flat_bench",
                "name": "Жим гантелей лёжа",
                "pool_slug": "db_bench_press",
            },
        )
    assert relinked["pool_slug"] == "db_bench_press"
    assert relinked["primary_muscles"] == ["chest"]
    assert relinked["category"] == "compound"


async def test_relinking_never_overwrites_what_is_already_stored(as_user):
    """The other half of the same rule: filling an empty field must not become permission to
    replace a value the user already has."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "upsert_exercise",
            exercise={
                "id": "my_press",
                "name": "Мой жим",
                "equipment": ["barbell"],
                "primary_muscles": ["chest"],
            },
        )
        relinked = await _call(
            client,
            "upsert_exercise",
            exercise={"id": "my_press", "name": "Мой жим", "pool_slug": "bb_bench_press"},
        )
    assert relinked["equipment"] == ["barbell"]
    assert relinked["primary_muscles"] == ["chest"]
    # The pool still fills what was genuinely empty.
    assert relinked["secondary_muscles"] == ["triceps", "front_delts"]


async def test_dose_unit_reaches_the_users_own_catalogue(as_user):
    """A coach logging "3 sets of plank" on day two reads the catalogue, not a fresh pool search;
    without the unit, `default_rep_min: 30` reads as thirty repetitions."""
    async with Client(mcp_server()) as client:
        await _call(client, "upsert_exercise", exercise={"id": "plank", "name": "Планка"})
        rows = await _call(client, "list_exercises", query="plank")
    assert rows[0]["dose_unit"] == "seconds"


async def test_unknown_equipment_is_an_error_not_an_empty_result(as_user):
    """`resistance_bands` (plural) matched nothing and looked exactly like "your kit fits no
    exercise", which is a different and false statement."""
    async with Client(mcp_server()) as client:
        with pytest.raises(Exception) as err:
            await _call(client, "search_exercise_pool", equipment=["resistance_bands"])
    assert "unknown equipment" in str(err.value)


async def test_import_document_links_exercises_to_the_pool(as_user):
    """A bulk import used to call the repo directly, so a program build was the one way to get an
    exercise into the catalogue with no muscles and no link."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "import_document",
            document={
                "schema_version": "1.0",
                "exercises": [{"id": "lat_pulldown", "name": "Тяга верхнего блока"}],
            },
        )
        rows = await _call(client, "list_exercises", query="lat_pulldown")
    assert rows[0]["pool_slug"] == "lat_pulldown"
    assert rows[0]["primary_muscles"] == ["lats"]


async def test_ids_differing_only_by_case_are_one_exercise(as_user):
    """The primary key is case-sensitive text, so "Bench_Press" and "bench_press" forked into two
    histories for one movement — and now that a fork inherits full pool metadata it no longer even
    looks like an empty stub."""
    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-06",
                "entries": [{"exercise_id": "My_Bench", "sets": [{"set_number": 1, "reps": 5}]}],
            },
        )
        await _call(client, "upsert_exercise", exercise={"id": "my_bench", "name": "Мой жим"})
        rows = await _call(client, "list_exercises")
    ids = [r["id"] for r in rows]
    assert ids.count("My_Bench") == 1
    assert "my_bench" not in ids


async def test_mobility_buys_no_recovery_protection(as_user):
    """Excluding a category from the dose has to exclude it from the repeated-bout count too, or
    a daily warm-up marks a muscle accustomed and SHORTENS its window on the day it is loaded."""
    from workout_storage import repo
    from workout_storage.db import connect

    async with Client(mcp_server()) as client:
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-07",
                "entries": [
                    {
                        "exercise_id": "cat_cow",
                        "sets": [{"set_number": n, "reps": 10} for n in (1, 2)],
                    }
                ],
            },
        )
    async with connect() as conn:
        rows = await repo.muscle_exposure_counts(conn, as_user, date_from=date(2026, 1, 1))
    assert [r for r in rows if r["muscle"] == "lower_back"] == []


async def test_auto_created_name_follows_the_users_language(as_user):
    """An English-speaking user logging a pool slug was getting a Russian display name forever,
    because the auto-create statement hardcoded one locale."""
    async with Client(mcp_server()) as client:
        await _call(client, "update_coach_profile", patch={"language": "ru"})
        await _call(
            client,
            "log_session",
            session={
                "date": "2026-08-08",
                "entries": [{"exercise_id": "leg_press", "sets": [{"set_number": 1, "reps": 10}]}],
            },
        )
        rows = await _call(client, "list_exercises", query="leg_press")
    assert rows[0]["name"] == "Жим ногами"
