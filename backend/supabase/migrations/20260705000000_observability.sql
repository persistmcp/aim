-- Observability: one row per MCP tool call, written best-effort by the FastMCP logging
-- middleware (observability.py). Durable telemetry — Vercel Hobby keeps runtime logs for only
-- one hour, so this table is the queryable history of what each user's assistant actually did.
-- Deliberately NOT in the backup TABLES list (telemetry, not user data).

create table tool_calls (
  id          bigint generated always as identity primary key,
  user_id     uuid references users(id) on delete cascade,  -- null if context was missing
  tool        text not null,
  args        jsonb,                                        -- truncated to a bounded size app-side
  ok          boolean not null,
  error       text,
  duration_ms integer,
  created_at  timestamptz not null default now()
);

create index tool_calls_user_time on tool_calls (user_id, created_at desc);
create index tool_calls_time on tool_calls (created_at desc);
