"""The pool's source data is validated in CI, not only when someone remembers to run the script.

`data/exercise_pool/*.json` is hand-edited, and every rule the build script enforces exists because
breaking it breaks something silently downstream — an unknown muscle value drops the exercise out
of the heatmap, a duplicated alias makes name matching ambiguous. Committing bad data must fail
here rather than at `supabase db push` time.
"""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _build_module():
    spec = importlib.util.spec_from_file_location(
        "build_exercise_pool", ROOT / "scripts" / "build_exercise_pool.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_pool_source_data_is_valid():
    build = _build_module()
    entries = build.load()
    assert build.validate(entries) == []
    assert len(entries) >= 90, "the pool is meant to cover a standard gym, not a sample"


def test_generated_seed_matches_the_source_files():
    """`exercise_pool_seed.json` and the migration are generated artifacts — a source edit that
    was never rebuilt would ship a migration that disagrees with the data under review."""
    import json

    build = _build_module()
    rebuilt = build.build(build.load())
    committed = json.loads((ROOT / "exercise_pool_seed.json").read_text(encoding="utf-8"))
    assert rebuilt == committed, "run: uv run python scripts/build_exercise_pool.py"


def test_migration_insert_matches_the_source_files():
    """The migration is the SECOND generated artifact, written only when `--sql` is passed, and an
    applied migration can never be edited. So catalogue edits ship as a NEW migration carrying the
    full upsert, and this checks the newest one — otherwise a source edit rebuilt without the flag
    would leave production on stale muscle data while the seed-JSON test above stayed green."""
    build = _build_module()
    expected = build.to_sql(build.build(build.load()))
    pool_migrations = sorted((ROOT / "supabase" / "migrations").glob("*_exercise_pool*.sql"))
    assert pool_migrations, "no exercise_pool migration found"
    newest = pool_migrations[-1].read_text(encoding="utf-8")
    assert expected in newest, (
        f"{pool_migrations[-1].name} does not match data/exercise_pool/*.json — regenerate it, or "
        "add a new migration with `uv run python scripts/build_exercise_pool.py --sql <path>` if "
        "the current one is already applied in production"
    )


def test_generic_words_never_resolve_to_one_exercise():
    """ "Присед" names a movement class. Resolving it to the barbell back squat stamped
    `equipment: ["barbell"]` onto work a user may have done with none."""
    build = _build_module()
    keys = {k for row in build.build(build.load()) for k in row["match_keys"]}
    assert not (keys & build.GENERIC_KEYS), sorted(keys & build.GENERIC_KEYS)


def test_dose_unit_is_stated_wherever_the_range_is_not_reps():
    """A plank's 30-60 (seconds) and a run's 15-45 (minutes) share a column with a bench press's
    5-8. Production logs every plank set with a duration and no reps at all."""
    build = _build_module()
    rows = {r["slug"]: r for r in build.build(build.load())}
    assert rows["plank"]["dose_unit"] == "seconds"
    assert rows["treadmill_run"]["dose_unit"] == "minutes"
    assert rows["bb_bench_press"]["dose_unit"] == "reps"
    for row in rows.values():
        if "timed" in row["tags"]:
            assert row["dose_unit"] != "reps", row["slug"]


def test_every_pool_entry_is_reachable_by_its_localized_names():
    """Matching a logged Russian name to a slug is the whole point of `match_keys`."""
    build = _build_module()
    rows = build.build(build.load())
    by_slug = {r["slug"]: r for r in rows}
    plank = by_slug["plank"]
    assert build.normalize("Планка") in plank["match_keys"]
    assert build.normalize("Prancha") in plank["match_keys"]
    # ё-insensitivity is load-bearing: half the logged names in production spell it "лежа".
    assert build.normalize("Жим гантелей лёжа") == "жим гантелей лежа"
    assert build.normalize("жим гантелей лежа") in by_slug["db_bench_press"]["match_keys"]
    # Separator style must not matter either: "bench-press" and "bench_press" are one movement.
    assert build.normalize("Bb-Bench_Press") == "bb bench press"


def test_muscle_tiers_never_overlap():
    build = _build_module()
    for row in build.build(build.load()):
        tiers = [set(row[f]) for f in ("primary_muscles", "secondary_muscles", "tertiary_muscles")]
        assert not (tiers[0] & tiers[1]) and not (tiers[0] & tiers[2]) and not (tiers[1] & tiers[2])
