-- Goal taxonomy: featured goal + supersedes chain (goal type itself lives in the existing
-- `target` jsonb column, no DDL needed there — see coach.GoalType / coach.infer_goal_type).
--
-- `featured`: the ONE goal the app shows prominently (the one the user worked out with the coach
-- in chat right now). Never set by the app itself — only the coach, via upsert_goal, ever flips
-- this. `supersedes_goal_id`: links a new goal to the one it replaced (e.g. a milestone that got
-- achieved and became a maintenance goal), so goal history reads as a chain, not a flat pile.
-- Goals are still never deleted — this is purely additive.

alter table user_goals
  add column featured boolean not null default false,
  add column supersedes_goal_id uuid references user_goals(id);

-- At most one featured *active* goal per user. The backstop, not the primary mechanism —
-- repo.upsert_user_goal clears any prior featured goal in the same transaction before writing a
-- new one; this index only guards against a bug leaving two.
create unique index user_goals_one_featured on user_goals (user_id)
  where featured and status = 'active';
