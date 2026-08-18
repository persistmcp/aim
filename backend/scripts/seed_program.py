"""Build (and validate) program_seed.json: the active upper-body program with its two day
templates, plus every exercise re-stated in full with Russian how-to `instructions`.

Why re-state exercises in full: this was written when `repo.upsert_exercise` overwrote every
column, so adding `instructions` alone wiped the muscles/equipment/rep-ranges the muscle-load
feature relies on. That is no longer true — the upsert now writes only the fields present in the
payload (see its docstring) — so a future version of this script could send just the field it means
to change. The full restatement is kept because it also serves as a readable snapshot of the
program, not because a partial write would still be unsafe.

Run: python scripts/seed_program.py  → writes program_seed.json (validated against the models).
Then load into the DB with the MCP `import_document` tool.
"""

from __future__ import annotations

import json
from pathlib import Path

from workout_storage.models import WorkoutDocument

# id -> (name, category, movement_pattern, primary, secondary, equipment, unilateral,
#        rep_min, rep_max, tags)
CATALOG = [
    (
        "ex_lat_pulldown",
        "Тяга верхнего блока",
        "compound",
        "vertical_pull",
        ["lats"],
        ["biceps", "upper_back"],
        ["lat_pulldown", "cable"],
        False,
        8,
        12,
        [],
        ["lat pulldown", "тяга блока сверху"],
    ),
    (
        "ex_chest_press_machine",
        "Жим от груди в тренажёре",
        "compound",
        "horizontal_push",
        ["chest"],
        ["front_delts", "triceps"],
        ["machine"],
        False,
        8,
        12,
        [],
        ["chest press", "жим в тренажёре"],
    ),
    (
        "ex_seated_row",
        "Тяга нижнего блока сидя",
        "compound",
        "horizontal_pull",
        ["upper_back", "lats"],
        ["biceps", "rear_delts"],
        ["seated_row", "cable"],
        False,
        10,
        12,
        [],
        [],
    ),
    (
        "ex_cable_crossover_htl",
        "Сведение в кроссовере сверху-вниз",
        "isolation",
        "horizontal_push",
        ["lower_chest", "chest"],
        [],
        ["cable_crossover", "cable"],
        False,
        12,
        15,
        [],
        [],
    ),
    (
        "ex_face_pull",
        "Лицевая тяга",
        "isolation",
        "horizontal_pull",
        ["rear_delts"],
        ["lower_traps", "rotator_cuff"],
        ["cable"],
        False,
        15,
        20,
        ["posture"],
        [],
    ),
    (
        "ex_lateral_raise",
        "Махи гантелями в стороны",
        "isolation",
        "isolation",
        ["side_delts"],
        [],
        ["dumbbell"],
        False,
        12,
        20,
        [],
        [],
    ),
    (
        "ex_ez_curl",
        "Подъём на бицепс с EZ-грифом",
        "isolation",
        "isolation",
        ["biceps"],
        [],
        ["ez_bar"],
        False,
        8,
        12,
        [],
        [],
    ),
    (
        "ex_triceps_pushdown",
        "Разгибания на трицепс на блоке",
        "isolation",
        "isolation",
        ["triceps"],
        [],
        ["cable"],
        False,
        10,
        15,
        [],
        [],
    ),
    (
        "ex_bicycle_crunch",
        "Воздушный велосипед",
        "core",
        "core",
        ["abs", "obliques"],
        [],
        ["bodyweight"],
        False,
        None,
        None,
        [],
        [],
    ),
    ("ex_plank", "Планка", "core", "core", ["abs"], [], ["bodyweight"], False, None, None, [], []),
    (
        "ex_db_incline_press",
        "Жим гантелей на наклонной",
        "compound",
        "horizontal_push",
        ["upper_chest", "chest"],
        ["front_delts", "triceps"],
        ["dumbbell", "incline_bench"],
        False,
        8,
        12,
        [],
        [],
    ),
    (
        "ex_db_row_one_arm",
        "Тяга гантели одной рукой",
        "compound",
        "horizontal_pull",
        ["upper_back", "lats"],
        ["biceps", "rear_delts"],
        ["dumbbell"],
        True,
        8,
        12,
        [],
        [],
    ),
    (
        "ex_pec_deck",
        "Сведение в бабочке (pec deck)",
        "isolation",
        "horizontal_push",
        ["chest"],
        [],
        ["pec_deck", "machine"],
        False,
        12,
        15,
        [],
        [],
    ),
    (
        "ex_y_raise",
        "Y-подъёмы на наклонной",
        "isolation",
        "isolation",
        ["lower_traps", "rear_delts"],
        [],
        ["dumbbell", "incline_bench"],
        False,
        12,
        15,
        ["posture"],
        [],
    ),
    (
        "ex_db_shoulder_press",
        "Жим гантелей сидя",
        "compound",
        "vertical_push",
        ["front_delts", "side_delts"],
        ["triceps"],
        ["dumbbell", "bench"],
        False,
        10,
        12,
        [],
        [],
    ),
    (
        "ex_hammer_curl",
        "Молотковые сгибания",
        "isolation",
        "isolation",
        ["biceps", "forearms"],
        [],
        ["dumbbell"],
        False,
        10,
        15,
        [],
        [],
    ),
    (
        "ex_overhead_triceps",
        "Французский жим гантелью",
        "isolation",
        "isolation",
        ["triceps"],
        [],
        ["dumbbell"],
        False,
        10,
        15,
        [],
        [],
    ),
    (
        "ex_db_bench_press",
        "Жим гантелей лёжа",
        "compound",
        "horizontal_push",
        ["chest"],
        ["front_delts", "triceps"],
        ["dumbbell", "bench"],
        False,
        8,
        12,
        [],
        [],
    ),
]

INSTRUCTIONS = {
    "ex_lat_pulldown": "• Хват чуть шире плеч, грудь подай вверх, корпус слегка назад.\n"
    "• Тяни локтями вниз к карманам, веди ручку до верха груди.\n"
    "• Лопатки вниз-назад, без рывка корпусом.\n"
    "• Вверху подконтрольно растяни широчайшие.",
    "ex_chest_press_machine": "• Спина и таз прижаты, ручки на уровне середины груди.\n"
    "• Жми вперёд, не до жёсткого замка локтя.\n"
    "• Локти примерно под 45° к корпусу.\n"
    "• Назад медленно, чувствуй растяжение груди.",
    "ex_seated_row": "• Спина прямая, лёгкий наклон, грудь вверх.\n"
    "• Тяни к низу живота, локти ведёшь вдоль корпуса.\n"
    "• В конце сведи лопатки, короткая пауза.\n"
    "• Возврат подконтрольно, без округления спины.",
    "ex_cable_crossover_htl": "• Блоки сверху, лёгкий наклон вперёд, шаг вперёд.\n"
    "• Веди руки по дуге вниз-внутрь к низу груди.\n"
    "• Локти чуть согнуты и зафиксированы.\n"
    "• Внизу сведи и сожми грудь, пауза.",
    "ex_face_pull": "• Канат на уровне лица, хват нейтральный.\n"
    "• Тяни к лицу, разводя кисти в стороны.\n"
    "• Локти держи высоко, акцент на задние дельты.\n"
    "• Пауза в сокращении, медленно назад.",
    "ex_lateral_raise": "• Лёгкий наклон вперёд, локти чуть согнуты.\n"
    "• Поднимай через стороны до уровня плеч.\n"
    "• Веди мизинцем чуть вверх, без заброса весом.\n"
    "• Опускай медленно, без раскачки.",
    "ex_ez_curl": "• Локти прижаты к корпусу, не выводи вперёд.\n"
    "• Поднимай только за счёт предплечья, без раскачки.\n"
    "• Вверху сожми бицепс.\n"
    "• Опускай медленно до полного выпрямления.",
    "ex_triceps_pushdown": "• Локти прижаты к бокам, корпус чуть вперёд.\n"
    "• Разгибай до полного выпрямления, сожми трицепс.\n"
    "• Назад только до угла ~90° в локте.\n"
    "• Без рывков плечами.",
    "ex_bicycle_crunch": "• Поясница прижата к полу.\n"
    "• Локоть к противоположному колену, скручивай корпус.\n"
    "• Вторую ногу выпрямляй, не клади на пол.\n"
    "• Медленно и подконтрольно, ровно дыши.",
    "ex_plank": "• Локти под плечами, тело в прямую линию.\n"
    "• Таз не провисает и не задирается.\n"
    "• Напряги пресс и ягодицы, дыши ровно.\n"
    "• Держи заданное время.",
    "ex_db_incline_press": "• Скамья ~30°, лопатки сведены, стопы в пол.\n"
    "• Гантели на уровне верха груди.\n"
    "• Жми вверх-внутрь, не стукай гантели наверху.\n"
    "• Опускай медленно до растяжения груди.",
    "ex_db_row_one_arm": "• Колено и рука в скамью, спина параллельно полу.\n"
    "• Тяни гантель к поясу, локоть вдоль тела.\n"
    "• Вверху сведи лопатку, пауза.\n"
    "• Опускай подконтрольно, без скручивания корпуса.",
    "ex_pec_deck": "• Спина прижата, предплечья на упорах.\n"
    "• Своди до касания/почти, сожми грудь.\n"
    "• Не помогай плечами вперёд.\n"
    "• Разводи медленно до растяжения.",
    "ex_y_raise": "• Лёжа грудью на наклонной, лёгкие гантели.\n"
    "• Поднимай прямые руки в форме буквы Y (вверх-в стороны).\n"
    "• Большие пальцы вверх, акцент на низ трапеций.\n"
    "• Без рывка, короткая пауза вверху.",
    "ex_db_shoulder_press": "• Спина опёрта, гантели на уровне ушей.\n"
    "• Жми вверх, не до жёсткого замка локтя.\n"
    "• Локти не разводи строго в стороны.\n"
    "• Опускай медленно, контролируй.",
    "ex_hammer_curl": "• Нейтральный хват — ладони друг к другу.\n"
    "• Локти прижаты, поднимай без раскачки.\n"
    "• Вверху короткая пауза.\n"
    "• Опускай медленно, прорабатывая плечелучевую.",
    "ex_overhead_triceps": "• Гантель над головой в двух руках.\n"
    "• Опускай за голову, локти смотрят вперёд.\n"
    "• Локти неподвижны — двигается только предплечье.\n"
    "• Разгибай до выпрямления, сожми трицепс.",
    "ex_db_bench_press": "• Лопатки сведены, стопы в пол.\n"
    "• Гантели на уровне груди, локти ~45°.\n"
    "• Жми вверх-внутрь, без стука.\n"
    "• Опускай медленно до растяжения.",
}


def exercise(row) -> dict:
    (id_, name, cat, mp, prim, sec, equip, uni, rmin, rmax, tags, aliases) = row
    ex = {
        "id": id_,
        "name": name,
        "aliases": aliases,
        "category": cat,
        "movement_pattern": mp,
        "primary_muscles": prim,
        "secondary_muscles": sec,
        "equipment": equip,
        "is_unilateral": uni,
        "tags": tags,
        "instructions": INSTRUCTIONS[id_],
    }
    if rmin is not None or rmax is not None:
        ex["default_rep_range"] = {"min": rmin, "max": rmax}
    return ex


def item(eid, sets, rmin, rmax, weight, notes=None) -> dict:
    it = {"exercise_id": eid, "target_sets": sets}
    if rmin is not None:
        it["target_reps"] = {"min": rmin, "max": rmax}
    if weight is not None:
        it["target_weight_kg"] = weight
    if notes:
        it["notes"] = notes
    return it


def ss(n, *items) -> dict:
    return {"label": f"Суперсет {n}", "type": "superset", "items": list(items)}


day_a = {
    "id": "tpl_day_a",
    "name": "День A",
    "program_id": "prog_upper_pp",
    "focus": "Тяга/Жим — суперсеты",
    "estimated_duration_min": 52,
    "blocks": [
        ss(1, item("ex_lat_pulldown", 4, 10, 12, 55), item("ex_chest_press_machine", 4, 8, 10, 55)),
        ss(2, item("ex_seated_row", 3, 12, 12, 55), item("ex_cable_crossover_htl", 3, 12, 12, 7.5)),
        ss(3, item("ex_face_pull", 3, 15, 15, 12.5), item("ex_lateral_raise", 3, 12, 15, 5)),
        ss(4, item("ex_ez_curl", 3, 12, 15, 22.5), item("ex_triceps_pushdown", 3, 12, 12, 20)),
        {
            "label": "Пресс",
            "type": "straight",
            "items": [
                item("ex_bicycle_crunch", 3, 15, 20, None),
                item("ex_plank", 3, None, None, None, notes="≈30 сек в подходе"),
            ],
        },
    ],
}

day_b = {
    "id": "tpl_day_b",
    "name": "День B",
    "program_id": "prog_upper_pp",
    "focus": "Тяга/Жим — гантели",
    "estimated_duration_min": 55,
    "blocks": [
        ss(
            1,
            item("ex_lat_pulldown", 4, 12, 12, 50, notes="обратный хват"),
            item("ex_db_incline_press", 4, 12, 12, 18, notes="цель — поднять с 16 до 18 кг"),
        ),
        ss(2, item("ex_db_row_one_arm", 3, 10, 10, 20), item("ex_pec_deck", 3, 15, 15, 15)),
        ss(3, item("ex_y_raise", 3, 15, 15, 3.5), item("ex_db_shoulder_press", 3, 10, 12, 14)),
        ss(4, item("ex_hammer_curl", 3, 10, 12, 14), item("ex_overhead_triceps", 3, 12, 15, 16)),
    ],
}

program = {
    "id": "prog_upper_pp",
    "name": "Верх тела — Тяга/Жим (суперсеты)",
    "goal": "Гипертрофия верха, 2 дня/нед",
    "frequency_per_week": 2,
    "split_type": "push_pull",
    "day_template_ids": ["tpl_day_a", "tpl_day_b"],
    "status": "active",
}

doc = {
    "schema_version": "1.0.0",
    "exercises": [exercise(r) for r in CATALOG],
    "programs": [program],
    "day_templates": [day_a, day_b],
}

# Validate against the real models before writing — fail loudly on any shape mismatch.
WorkoutDocument.model_validate(doc)

out = Path(__file__).resolve().parent.parent / "program_seed.json"
out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {out} — {len(doc['exercises'])} exercises, {len(doc['day_templates'])} day templates")
