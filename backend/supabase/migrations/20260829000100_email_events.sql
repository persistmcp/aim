-- Find out whether the activation email actually arrives.
--
-- Two of the four August signups produced zero frontend events: no pageview, not even an
-- anonymous pre-identify one. They died at or before the email. We could not tell whether the
-- mail was delivered, spam-filed, bounced or simply ignored, because the only thing recorded was
-- `email_sent=true`, which means nothing more than "Resend accepted the request". Meanwhile the
-- one person who DID activate never opened the website at all: they took the connection URL
-- straight out of the email. So the email is the product's primary activation surface and it was
-- the one surface with no telemetry on it.
--
-- Resend emits webhook events (delivered, opened, clicked, bounced, complained,
-- delivery_delayed) keyed by the email id it returns at send time. That id was previously thrown
-- away, so an event could not be traced back to a person. `sent` rows are now written at send
-- time to create the mapping; webhook rows are matched to a user through it.
--
-- Deliberately stores NO email address and NO token. user_id is the join key and is enough;
-- putting a recipient address here would duplicate PII that already lives on users.email for no
-- analytical gain (cf. tool_calls.client_key, which is salted for the same reason).

create table email_events (
  id uuid primary key default gen_random_uuid(),

  -- Null when a webhook arrives for an email we have no `sent` row for: a send from before this
  -- table existed, or a message sent by something other than send_magic_link. Recorded rather
  -- than dropped, because an unattributable bounce is still a deliverability signal.
  user_id uuid references users (id) on delete cascade,

  -- Resend's message id. The join key between our send and their webhooks. Not unique on its own:
  -- one message legitimately produces sent + delivered + opened + clicked rows.
  resend_email_id text not null,

  -- 'sent' is ours, written when Resend accepts the message. The rest mirror Resend's event
  -- names with the "email." prefix stripped. Text rather than an enum so a new Resend event type
  -- lands as data instead of a 500 in the webhook handler.
  kind text not null,

  -- When the event happened per Resend, not when we stored it. A delivery_delayed followed by a
  -- delivered hours later is the shape worth seeing, and storage order does not show it.
  occurred_at timestamptz not null default now(),

  -- Small, bounded context: bounce type and reason, click target. Never the recipient address,
  -- never the token, never the message body.
  detail jsonb,

  created_at timestamptz not null default now()
);

-- "what happened to this message" — the webhook handler's own lookup, and the query behind any
-- per-signup forensic trace.
create index email_events_resend_id on email_events (resend_email_id);

-- "did this person's email arrive, and did they open it" — the per-user funnel question.
create index email_events_user_time on email_events (user_id, occurred_at desc);

-- The same message can be redelivered by svix on retry; the handler is idempotent on this.
create unique index email_events_unique_event
  on email_events (resend_email_id, kind, occurred_at);
