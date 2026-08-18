# Global exercise pool — source data

One JSON file per muscle group. Each file is a list of pool entries; `scripts/build_exercise_pool.py`
merges them, validates every field against the enums in `workout_storage.models`
(`MuscleGroup` / `Equipment` / `MovementPattern` / `ExerciseCategory`) and emits both
`exercise_pool_seed.json` and the SQL migration body.

**This directory is the edit surface.** `exercise_pool_seed.json` at the backend root is a generated
artifact — never edit it by hand.

## Entry shape

```jsonc
{
  "slug": "bb_bench_press",          // canonical id, snake_case, stable forever
  "names": {"ru": "…", "en": "…", "pt": "…", "es": "…", "fr": "…"},
  "aliases": ["жим лёжа", "bench press"],   // free-text, lowercased at match time
  "category": "compound",
  "movement_pattern": "horizontal_push",
  "primary_muscles": ["chest"],       // full credit (1.0) in the load model
  "secondary_muscles": ["triceps"],   // half credit (0.5)
  "tertiary_muscles": ["upper_back"], // quarter credit (0.25) — stabilisers, minor assistance
  "equipment": ["barbell", "bench"],
  "is_unilateral": false,
  "default_rep_min": 5,
  "default_rep_max": 8,
  "default_rest_sec": 180,
  "instructions": {"ru": "…", "en": "…"},  // 2-3 short cues, ru is the source language
  "tags": ["gym"]
}
```

## Rules for muscle assignment

The three tiers feed `stats._load_contributions` directly, so they are a *dose* statement, not an
anatomy lesson:

- **primary** — the muscle the exercise is *for*. If you would not program this movement to train
  it, it is not primary. Keep it to 1–2 entries; three primaries means the movement is probably a
  compound that deserves a demotion somewhere.
- **secondary** — a real, loaded synergist through a meaningful range (triceps on a bench press,
  biceps on a row).
- **tertiary** — stabilises or assists but is not meaningfully dosed (upper back on a bench press,
  forearms on any barbell pull, abs on a standing press). This tier exists so the heat map stops
  reading "untrained" for tissue that is in fact working, without inflating weekly set counts —
  MEV/MAV are still judged on primary sets only.

Never list the same muscle in two tiers: the model de-duplicates to the highest tier, but the
intent should be visible in the data.

## Language rules

Russian is the source language (`docs/LANDING_COPY.md`), English is the fallback. `names` must
carry all five supported locales; `instructions` carry ru + en and fall back to en. Names use the
term a lifter would actually say in that language, not a literal translation of the Russian.
