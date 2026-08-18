-- Tell apart the consumers who share ONE token.
--
-- Every real account has its own user_id, so `tool_calls` already separates real users. The
-- public demo account does not: /demo/mcp is listed on external directories and everyone who
-- pastes it into an assistant — prospects, directory crawlers, our own QA — arrives as the same
-- user_id. 193 calls over 11 days told us nothing about how many people that was.
--
-- client_key is an opaque, salted digest written by observability.client_key(): an MCP session id
-- when the client sends one, otherwise a coarse HMAC of IP + user agent under a server-side salt
-- (CLIENT_KEY_SALT). Deliberately NOT reversible and deliberately blunt — everyone behind one NAT
-- collapses into one key. No raw IP or user agent is ever stored.
--
-- Nullable and set for the demo account only: for a real user it would add a device fingerprint
-- to their row for no analytical gain. Existing rows and every non-demo caller are untouched.

alter table tool_calls add column client_key text;

-- "how many distinct callers used the demo today" — the query this column exists for.
create index tool_calls_client_time on tool_calls (client_key, created_at desc)
  where client_key is not null;
