-- Self-service signup: tie accounts to an email and rate-limit the public endpoint.

-- Email is optional (CLI-created users may have none) but unique when present, case-insensitively.
alter table users add column if not exists email text;
alter table users add column if not exists email_verified_at timestamptz;

create unique index if not exists users_email_lower_uniq
  on users (lower(email)) where email is not null;

-- Throttle log for the public /api/public/signup endpoint. One row per accepted attempt, keyed by
-- client IP; the handler counts recent rows to enforce a per-IP hourly cap. DB-backed (not
-- in-memory) so the limit holds across serverless instances.
create table if not exists signup_events (
  id         bigserial primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);

create index if not exists signup_events_ip_time on signup_events (ip, created_at);
