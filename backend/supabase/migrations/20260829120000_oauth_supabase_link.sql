-- Link an AIm account to the Supabase Auth identity that OAuth tokens carry.
--
-- OAuth access tokens issued by the project's OAuth 2.1 server identify the user by `sub`, which
-- is an `auth.users` id. Every row we own is keyed on `users.id`, so the two need joining. This is
-- the whole schema cost of OAuth: Supabase owns the clients, codes, access and refresh tokens, so
-- there is nothing here to store them in.
--
-- Deliberately nullable and unset for everyone: existing users keep working over their path token
-- and are linked lazily, the first time they authorize a connector (see oauth.py). A bulk backfill
-- would touch every live row to no purpose, and there is no `auth.users` row to point at until a
-- user actually signs in.
--
-- No foreign key to `auth.users`: it lives in a schema this app never migrates, and a hard
-- reference would couple our migrations to gotrue's. The column is written only after Supabase has
-- verified the identity, so the value is trustworthy without the constraint.
alter table users add column if not exists supabase_user_id uuid;

create unique index if not exists users_supabase_user_id_uniq
  on users (supabase_user_id) where supabase_user_id is not null;
