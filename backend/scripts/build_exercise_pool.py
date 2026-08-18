"""Validate `data/exercise_pool/*.json` and build the global pool artifacts.

The pool is the catalog-first source the coach picks exercises from: canonical slug, localized
names, three muscle tiers, equipment, rep/rest defaults. `data/exercise_pool/` is the edit surface;
this script is the only thing that may write `exercise_pool_seed.json` and the migration body.

Validation is the point, not the file writing. Every rule here exists because breaking it breaks
something downstream:

- unknown enum value        -> the row would be invisible to the muscle model (stats joins on
                               `category` / `movement_pattern` / the muscle arrays)
- muscle in two tiers       -> one set paid twice, the bug `_load_contributions` already guards
                               against for LLM-authored user rows
- duplicate slug            -> a second row silently wins the primary key
- ambiguous alias           -> `resolve_alias` cannot pick a slug, so matching a logged name would
                               have to guess
- missing locale            -> the app renders an English name inside a Russian program

Run:
    uv run python scripts/build_exercise_pool.py            # validate + write seed JSON
    uv run python scripts/build_exercise_pool.py --sql PATH # also (re)write the migration body
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from workout_storage.models import Equipment, ExerciseCategory, MovementPattern, MuscleGroup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "exercise_pool"
SEED_OUT = ROOT / "exercise_pool_seed.json"
IMAGE_MAP = DATA_DIR / "images.json"
# Our own copies, shipped with the web app. Site-relative on purpose: the app serves them from its
# own origin, and nothing here points at a third-party host that could move or vanish.
IMAGE_DIR = ROOT.parent / "web" / "public" / "exercises"
IMAGE_URL_PREFIX = "/exercises"
# Per source, because the same artist's work carries a different licence version depending on where
# it was published: CC BY-SA 4.0 in the GitHub repo, CC BY-SA 3.0 on Wikimedia Commons. The credit
# has to name the right one, so it travels per image rather than as one global constant.
IMAGE_SOURCES = {
    "everkinetic-repo": ("CC BY-SA 4.0", "Everkinetic (everkinetic.com), CC BY-SA 4.0"),
    "commons": ("CC BY-SA 3.0", "Everkinetic via Wikimedia Commons, CC BY-SA 3.0"),
}
# "ink"   — black line art stored as an alpha mask; the app recolours it per theme.
# "photo" — a colour illustration that must be shown as-is on its own light ground.
DEFAULT_IMAGE_STYLE = "ink"

# Must stay in step with web/shared/languages.mjs (SUPPORTED_LANGUAGES).
LOCALES = ("ru", "en", "pt", "es", "fr")
# Instructions are authored in ru (source language) + en (runtime fallback); the rest fall back.
REQUIRED_INSTRUCTION_LOCALES = ("ru", "en")

SLUG_RE = re.compile(r"^[a-z][a-z0-9_]*$")

# Words that name a movement CLASS or a body part rather than one exercise. A match key like
# "присед" or "пресс" swallows every name in its family: logging a session with exercise_id
# "Присед" resolved to the barbell back squat and stamped `equipment: ["barbell"]` onto work the
# user may have done with no equipment at all. A generic word must resolve to nothing, so the
# exercise stays custom, rather than to a confident wrong answer.
GENERIC_KEYS = {
    "squat",
    "присед",
    "приседания",
    "пресс",
    "жим",
    "тяга",
    "бицепс",
    "трицепс",
    "спина",
    "ноги",
    "грудь",
    "плечи",
    "руки",
    "кардио",
    "растяжка",
    "хаммер",
    "press",
    "row",
    "curl",
    "fly",
    "raise",
    "pull",
    "push",
    "cardio",
    "abs",
    "core",
}

# What `default_rep_min`/`default_rep_max` are counted in. The field used to be reps-shaped for
# everything, so a plank's "30-60" (seconds) and a run's "15-45" (minutes) sat in the same column
# as a bench press's "5-8" — sixty times apart, with nothing to tell them apart. Production
# confirms the mismatch is real: all 64 logged plank sets carry `duration_sec` and no reps at all.
DOSE_UNITS = {"reps", "seconds", "minutes"}

MUSCLES = {m.value for m in MuscleGroup}
EQUIPMENT = {e.value for e in Equipment}
PATTERNS = {p.value for p in MovementPattern}
CATEGORIES = {c.value for c in ExerciseCategory}

FIELDS = {
    "slug",
    "names",
    "aliases",
    "category",
    "movement_pattern",
    "primary_muscles",
    "secondary_muscles",
    "tertiary_muscles",
    "equipment",
    "is_unilateral",
    "long_length",
    "dose_unit",
    "default_rep_min",
    "default_rep_max",
    "default_rest_sec",
    "instructions",
    "tags",
}
REQUIRED = FIELDS - {"tags"}


def load() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in sorted(DATA_DIR.glob("*.json")):
        if path == IMAGE_MAP:  # the illustration map, not a list of exercises
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise SystemExit(f"{path.name}: expected a list of entries")
        for entry in payload:
            entry["_source_file"] = path.name
            entries.append(entry)
    return entries


def validate(entries: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    slugs = Counter(e.get("slug") for e in entries)
    alias_owner: dict[str, str] = {}
    images = image_map()
    unknown_mapped = images.keys() - {e.get("slug") for e in entries}
    if unknown_mapped:
        errors.append(f"images.json maps slugs that do not exist: {sorted(unknown_mapped)}")
    errors.extend(duplicate_image_errors(images))

    for entry in entries:
        slug = entry.get("slug", "<missing>")
        where = f"{entry.get('_source_file')}:{slug}"

        missing = REQUIRED - entry.keys()
        if missing:
            errors.append(f"{where}: missing fields {sorted(missing)}")
            continue
        unknown = entry.keys() - FIELDS - {"_source_file"}
        if unknown:
            errors.append(f"{where}: unknown fields {sorted(unknown)}")

        if not SLUG_RE.match(slug):
            errors.append(f"{where}: slug must be snake_case ascii")
        if slugs[slug] > 1:
            errors.append(f"{where}: duplicate slug ({slugs[slug]} rows)")

        names = entry["names"]
        for loc in LOCALES:
            if not names.get(loc, "").strip():
                errors.append(f"{where}: names.{loc} is missing")
        for loc in REQUIRED_INSTRUCTION_LOCALES:
            if not entry["instructions"].get(loc, "").strip():
                errors.append(f"{where}: instructions.{loc} is missing")
        extra_locales = (names.keys() | entry["instructions"].keys()) - set(LOCALES)
        if extra_locales:
            errors.append(f"{where}: unsupported locales {sorted(extra_locales)}")

        if entry["dose_unit"] not in DOSE_UNITS:
            errors.append(f"{where}: dose_unit {entry['dose_unit']!r} not in {sorted(DOSE_UNITS)}")
        if entry["category"] not in CATEGORIES:
            errors.append(f"{where}: category {entry['category']!r} not in ExerciseCategory")
        if entry["movement_pattern"] not in PATTERNS:
            errors.append(f"{where}: movement_pattern {entry['movement_pattern']!r} unknown")
        for field in ("primary_muscles", "secondary_muscles", "tertiary_muscles"):
            bad = [m for m in entry[field] if m not in MUSCLES]
            if bad:
                errors.append(f"{where}: {field} has unknown muscles {bad}")
        bad_equipment = [q for q in entry["equipment"] if q not in EQUIPMENT]
        if bad_equipment:
            errors.append(f"{where}: unknown equipment {bad_equipment}")

        if not entry["primary_muscles"]:
            errors.append(f"{where}: primary_muscles is empty — the load model would ignore it")
        if not entry["equipment"]:
            errors.append(f"{where}: equipment is empty — equipment filtering would skip it")

        # One set must never be paid twice for the same muscle.
        tiers = {
            "primary": set(entry["primary_muscles"]),
            "secondary": set(entry["secondary_muscles"]),
            "tertiary": set(entry["tertiary_muscles"]),
        }
        for a, b in (("primary", "secondary"), ("primary", "tertiary"), ("secondary", "tertiary")):
            overlap = tiers[a] & tiers[b]
            if overlap:
                errors.append(f"{where}: {sorted(overlap)} listed in both {a} and {b}")

        rep_min, rep_max = entry["default_rep_min"], entry["default_rep_max"]
        if rep_min is not None and rep_max is not None and rep_min > rep_max:
            errors.append(f"{where}: default_rep_min {rep_min} > default_rep_max {rep_max}")

        if slug in images and not image_files(slug):
            errors.append(f"{where}: mapped in images.json but no files in {IMAGE_DIR}")

        for alias in alias_keys(entry):
            if alias in GENERIC_KEYS:
                errors.append(f"{where}: {alias!r} is too generic to identify one exercise")
            owner = alias_owner.get(alias)
            if owner and owner != slug:
                errors.append(f"{where}: alias {alias!r} already resolves to {owner!r}")
            alias_owner[alias] = slug

    return errors


def alias_keys(entry: dict[str, Any]) -> list[str]:
    """Everything a logged exercise name may be matched against, normalized.

    Localized names count as aliases: a Russian log saying "Планка" must find `plank` without the
    caller knowing the slug.
    """
    raw = list(entry["aliases"]) + [entry["slug"], *entry["names"].values()]
    return sorted({normalize(value) for value in raw if value})


def normalize(value: str) -> str:
    """Lowercase, unify ё/e and dash/underscore, drop parenthesised notes, collapse whitespace.

    Parentheses are stripped because that is how people actually name exercises in the catalog:
    production carries "Отжимания на брусьях (с противовесом при необходимости)" and "Сведение в
    бабочке (pec deck)" — the same two movements everyone else logs, with a note attached.
    """
    lowered = value.strip().lower().replace("ё", "е")
    without_notes = re.sub(r"\([^)]*\)", " ", lowered)
    return re.sub(r"[\s\-_]+", " ", without_notes).strip()


def image_map() -> dict[str, Any]:
    """slug -> either a source-movement id (the GitHub repo) or a dict naming another source."""
    if not IMAGE_MAP.exists():
        return {}
    return dict(json.loads(IMAGE_MAP.read_text(encoding="utf-8"))["map"])


def image_source(spec: Any) -> str:
    return spec.get("source", "everkinetic-repo") if isinstance(spec, dict) else "everkinetic-repo"


# Two entries whose art is legitimately the same drawing with the frames swapped, because the
# movements are mirror images of each other and the direction of travel is the only difference.
ALLOWED_SHARED_IMAGES = frozenset({frozenset({"hip_abduction_machine", "hip_adduction_machine"})})


def duplicate_image_errors(images: dict[str, str]) -> list[str]:
    """Two exercises must not ship the same picture, and a movement's two frames must differ.

    Both failures shipped once: `t_bar_row` and `smith_incline_press` were byte-identical files
    showing a third exercise entirely, and `hack_squat`'s two frames were one file, so the widget
    showed no range of motion at all. Nothing in the pipeline noticed, because the importer only
    checks that a file was written.
    """
    if not IMAGE_DIR.exists():
        return []
    digests: dict[str, list[str]] = {}
    errors: list[str] = []
    for slug in sorted(images):
        frames = sorted(IMAGE_DIR.glob(f"{slug}-*.webp"))
        seen: dict[str, str] = {}
        for path in frames:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen:
                errors.append(f"{slug}: frames {seen[digest]} and {path.name} are the same image")
            seen[digest] = path.name
            digests.setdefault(digest, []).append(slug)
    for digest, slugs in digests.items():
        owners = set(slugs)
        if len(owners) > 1 and frozenset(owners) not in ALLOWED_SHARED_IMAGES:
            errors.append(f"{sorted(owners)} ship the same image ({digest[:12]})")
    return errors


def image_files(slug: str) -> list[str]:
    """The frames actually present on disk for this slug, in order.

    Derived from the filesystem rather than recorded in the map, so a half-finished
    `import_pool_images.py` run can never publish a URL that 404s.
    """
    return [f"{IMAGE_URL_PREFIX}/{path.name}" for path in sorted(IMAGE_DIR.glob(f"{slug}-*.webp"))]


def build(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    images = image_map()
    rows = []
    for entry in entries:
        row = {k: v for k, v in entry.items() if k != "_source_file"}
        row.setdefault("tags", [])
        row["match_keys"] = alias_keys(entry)
        files = image_files(row["slug"]) if row["slug"] in images else []
        row["image_urls"] = files
        row["image_url"] = files[0] if files else None
        # Licence and credit travel WITH the URL, never in a separate table a caller could forget
        # to join: CC BY-SA requires attribution wherever the image is displayed.
        spec = images.get(row["slug"])
        if isinstance(spec, dict) and spec.get("source") == "wger":
            # CC BY-SA credits a person, so a community image carries its own author.
            licence = spec.get("license", "CC BY-SA 4.0")
            credit = f"{spec.get('author', 'wger contributors')} / wger.de, {licence}"
            style = spec.get("style", DEFAULT_IMAGE_STYLE)
        else:
            licence, credit = IMAGE_SOURCES[image_source(spec)]
            style = DEFAULT_IMAGE_STYLE
        row["image_license"] = licence if files else None
        row["image_attribution"] = credit if files else None
        row["image_style"] = style if files else None
        rows.append(row)
    rows.sort(key=lambda r: r["slug"])
    return rows


def sql_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        inner = ", ".join(sql_literal(v) for v in value)
        return f"array[{inner}]::text[]" if value else "'{}'::text[]"
    if isinstance(value, dict):
        return "$json$" + json.dumps(value, ensure_ascii=False) + "$json$::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


COLUMNS = [
    "slug",
    "names",
    "instructions",
    "aliases",
    "match_keys",
    "category",
    "movement_pattern",
    "primary_muscles",
    "secondary_muscles",
    "tertiary_muscles",
    "equipment",
    "is_unilateral",
    "long_length",
    "dose_unit",
    "default_rep_min",
    "default_rep_max",
    "default_rest_sec",
    "tags",
    "image_url",
    "image_urls",
    "image_license",
    "image_attribution",
    "image_style",
]


def to_sql(rows: list[dict[str, Any]]) -> str:
    values = ",\n".join(
        "  (" + ", ".join(sql_literal(row[c]) for c in COLUMNS) + ")" for row in rows
    )
    updates = ",\n".join(f"  {c} = excluded.{c}" for c in COLUMNS if c != "slug")
    return (
        f"insert into exercise_pool ({', '.join(COLUMNS)}) values\n{values}\n"
        f"on conflict (slug) do update set\n{updates},\n  updated_at = now();\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the global exercise pool")
    parser.add_argument("--sql", type=Path, help="also write the insert statement to this path")
    args = parser.parse_args()

    entries = load()
    errors = validate(entries)
    if errors:
        for e in errors:
            print(f"ERROR {e}", file=sys.stderr)
        raise SystemExit(f"{len(errors)} validation error(s)")

    rows = build(entries)
    SEED_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"validated {len(rows)} exercises -> {SEED_OUT.relative_to(ROOT)}")

    if args.sql:
        args.sql.write_text(to_sql(rows), encoding="utf-8")
        print(f"wrote insert statement -> {args.sql}")

    with_images = sum(1 for r in rows if r["image_url"])
    print(f"illustrated: {with_images}/{len(rows)}")

    muscles = Counter(m for r in rows for m in r["primary_muscles"])
    uncovered = sorted(MUSCLES - muscles.keys() - {"full_body", "other"})
    if uncovered:
        print(f"note: no exercise has these as a PRIMARY muscle: {uncovered}")


if __name__ == "__main__":
    main()
