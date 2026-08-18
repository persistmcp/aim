-- Coaching layer (docs/COACHING_PLAN.md): per-user goal profile, goals-as-rows,
-- versioned prompt registry, lifecycle event log. App-level scoping like everywhere else.

-- coach_profiles (1:1 with users; the living coaching state) ------------------
create table coach_profiles (
  user_id                    uuid primary key references users(id) on delete cascade,
  -- goal core
  primary_goal               text,        -- hypertrophy|strength|fat_loss|endurance|general_health|event
  goal_detail                text,
  motivation                 text,        -- the user's "why" — fuels MI-style encouragement
  -- capacity & logistics
  experience_level           text,        -- beginner|returning|intermediate|advanced
  training_days_per_week     int,
  session_length_min         int,
  preferred_days             text[] not null default '{}',
  preferred_time             text,
  schedule_cue               text,        -- implementation intention ("сразу после работы")
  -- environment (gym and home are both first-class)
  locations                  text[] not null default '{}',   -- gym|home|outdoor
  equipment                  text[] not null default '{}',   -- Equipment enum values
  -- health & safety
  injuries                   jsonb not null default '[]',    -- [{area, note, active, reported_at}]
  parq_flags                 jsonb,                          -- PAR-Q style red-flag answers
  medical_clearance_advised  boolean not null default false,
  -- preferences
  focus_muscles              text[] not null default '{}',   -- MuscleGroup values ("хочу руки")
  likes                      text[] not null default '{}',
  dislikes                   text[] not null default '{}',
  coaching_tone              text,        -- supportive|demanding|neutral
  language                   text,        -- coach reply language; falls back to client language
  -- lifecycle
  confidence_score           int,         -- 0–10 ruler, re-asked at check-ins
  checkin_cadence_days       int not null default 28,
  next_review_date           date,
  intake_status              text not null default 'not_started',
                                          -- not_started|in_progress|core_complete|enriched
  pending_questions          text[] not null default '{}',   -- drip queue of nice-to-have questions
  profile_summary            text,        -- compact coach-maintained summary (fixed token budget)
  custom_fields              jsonb not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create trigger coach_profiles_set_updated_at before update on coach_profiles
  for each row execute function set_updated_at();

-- user_goals (goals as rows; never deleted — status transitions keep history) --
create table user_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,                 -- outcome|process|performance
  title         text not null,
  target        jsonb,                         -- {metric, value, unit, deadline} where quantifiable
  status        text not null default 'active',-- active|achieved|abandoned|revised
  source        text not null default 'user',  -- user|coach_proposed
  ratified      boolean not null default true, -- coach proposals need explicit user agreement
  review_date   date,
  notes         text,
  custom_fields jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index user_goals_user_status on user_goals (user_id, status);
create trigger user_goals_set_updated_at before update on user_goals
  for each row execute function set_updated_at();

-- prompt_templates (global versioned prompt registry; no user_id) --------------
-- Canonical English bodies; per-user customization enters as data (tone/language/profile),
-- never as forked templates. Hardcoded fallbacks live in workout_storage/prompts.py.
create table prompt_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,               -- 'task.intake' | 'methodology.hypertrophy' | 'safety.base' | …
  version    int not null,
  label      text not null default 'draft',   -- production|staging|draft
  body       text not null,
  changelog  text,
  created_at timestamptz not null default now(),
  unique (key, version)
);
create unique index prompt_templates_prod_one on prompt_templates (key) where label = 'production';

-- coach_events (lifecycle audit log; powers history + re-elicitation triggers) --
create table coach_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,   -- intake_started|intake_completed|checkin|goal_review|goal_achieved
                              -- |deload_advised|red_flag_raised|profile_updated
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index coach_events_user_time on coach_events (user_id, created_at desc);

-- Backfill from the dormant users columns, then drop them (single write path). --
-- A profile row is created for anyone with EITHER field so migrated goals are never orphaned
-- from an intake_status.
insert into coach_profiles (user_id, experience_level, intake_status)
  select id, experience_level, 'in_progress' from users
  where experience_level is not null or coalesce(array_length(goals, 1), 0) > 0;

insert into user_goals (user_id, kind, title, source)
  select u.id, 'outcome', g, 'user' from users u, unnest(u.goals) as g;

alter table users drop column goals;
alter table users drop column experience_level;
