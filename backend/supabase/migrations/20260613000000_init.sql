-- Workout storage — initial schema (hybrid relational + JSONB, multi-user).
-- Every domain table carries user_id so all reads/writes scope by the URL token's user.

-- updated_at helper -----------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- users (token holder; doubles as the athlete profile) ------------------------
create table users (
  id               uuid primary key default gen_random_uuid(),
  token            text unique not null,
  name             text,
  sex              text,
  birth_date       date,
  height_cm        numeric,
  bodyweight_kg    numeric,
  body_fat_pct     numeric,
  experience_level text,
  goals            text[] not null default '{}',
  preferred_units  text not null default 'metric',
  timezone         text,
  custom_fields    jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- exercises (per-user catalog; key = (user_id, id)) ---------------------------
create table exercises (
  user_id           uuid not null references users(id) on delete cascade,
  id                text not null,
  name              text not null,
  aliases           text[] not null default '{}',
  category          text,
  movement_pattern  text,
  primary_muscles   text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment         text[] not null default '{}',
  is_unilateral     boolean not null default false,
  default_rep_min   int,
  default_rep_max   int,
  default_rest_sec  int,
  tags              text[] not null default '{}',
  instructions      text,
  video_url         text,
  image_url         text,
  custom_fields     jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);
create trigger exercises_set_updated_at before update on exercises
  for each row execute function set_updated_at();

-- programs --------------------------------------------------------------------
create table programs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  external_id        text,
  name               text not null,
  description        text,
  goal               text,
  frequency_per_week int,
  split_type         text,
  day_template_ids   text[] not null default '{}',
  start_date         date,
  end_date           date,
  status             text not null default 'active',
  custom_fields      jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index programs_user_external_id on programs (user_id, external_id)
  where external_id is not null;
create trigger programs_set_updated_at before update on programs
  for each row execute function set_updated_at();

-- day_templates (planned days; blocks kept as JSONB) --------------------------
create table day_templates (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  external_id            text,
  name                   text not null,
  program_external_id    text,
  focus                  text,
  estimated_duration_min int,
  blocks                 jsonb not null default '[]',
  custom_fields          jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index day_templates_user_external_id on day_templates (user_id, external_id)
  where external_id is not null;
create trigger day_templates_set_updated_at before update on day_templates
  for each row execute function set_updated_at();

-- sessions (logged facts) -----------------------------------------------------
create table sessions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,
  external_id              text,
  program_external_id      text,
  day_template_external_id text,
  day_label                text,
  date                     date not null,
  start_time               timestamptz,
  end_time                 timestamptz,
  duration_sec             int,
  location                 text,
  bodyweight_kg            numeric,
  session_rpe              numeric,
  energy_level             int,
  status                   text not null default 'completed',
  notes                    text,
  tags                     text[] not null default '{}',
  custom_fields            jsonb not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index sessions_user_date on sessions (user_id, date desc);
create unique index sessions_user_external_id on sessions (user_id, external_id)
  where external_id is not null;
create trigger sessions_set_updated_at before update on sessions
  for each row execute function set_updated_at();

-- session_entries (a logged exercise within a session) ------------------------
create table session_entries (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  exercise_id     text not null,                 -- soft reference into exercises catalog
  position        int,                           -- execution order ("order" is reserved)
  superset_group  text,
  notes           text,
  total_volume_kg numeric,
  custom_fields   jsonb not null default '{}'
);
create index session_entries_session on session_entries (session_id);
create index session_entries_user_exercise on session_entries (user_id, exercise_id);

-- sets (the analytical core) --------------------------------------------------
create table sets (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references session_entries(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  set_number    int not null,
  type          text not null default 'working',
  weight_kg     numeric,
  reps          int,
  rir           numeric,
  rpe           numeric,
  tempo         text,
  rest_sec      int,
  duration_sec  int,
  distance_m    numeric,
  is_per_side   boolean not null default false,
  completed     boolean not null default true,
  notes         text,
  custom_fields jsonb not null default '{}'
);
create index sets_entry on sets (entry_id);

-- session_metrics (1:1 wearable metrics) --------------------------------------
create table session_metrics (
  session_id        uuid primary key references sessions(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  source            text,
  avg_hr            int,
  max_hr            int,
  min_hr            int,
  strain            numeric,
  calories          numeric,
  cardio_load_pct   numeric,
  muscular_load_pct numeric,
  hr_zones          jsonb not null default '[]',
  raw               jsonb not null default '{}'
);

-- cardio_activities (attached to a session or standalone) ---------------------
create table cardio_activities (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid references sessions(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  type               text not null,
  distance_m         numeric,
  duration_sec       int,
  avg_pace_sec_per_km numeric,
  avg_hr             int,
  calories           numeric,
  timing             text,
  notes              text,
  custom_fields      jsonb not null default '{}'
);
create index cardio_activities_session on cardio_activities (session_id);

-- body_metrics ----------------------------------------------------------------
create table body_metrics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  external_id   text,
  date          date not null,
  bodyweight_kg numeric,
  body_fat_pct  numeric,
  measurements  jsonb not null default '{}',
  source        text,
  notes         text,
  custom_fields jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index body_metrics_user_date on body_metrics (user_id, date desc);
create unique index body_metrics_user_external_id on body_metrics (user_id, external_id)
  where external_id is not null;
