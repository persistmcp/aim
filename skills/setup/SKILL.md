---
name: setup
description: Connect the AIm workout coach to this account. Use when the AIm tools are missing, when a tool call fails with an authentication or token error, or when the user asks how to set up, connect, sign up for, or reconnect AIm.
---

# Connecting AIm

AIm has no password and no OAuth. One personal link is the whole credential: a token in the URL
identifies the account, and every request is scoped to it. That is what makes setup a single paste
— and it is also why the plugin cannot work until the user supplies their own token.

## What to do

1. **Check whether it is already connected.** Call `get_coaching_context` with the task that
   matches what the user asked for. If it returns, setup is done — carry on with their actual
   request and do not walk them through this.

2. **If the tools are missing or a call fails with an auth error**, the token is unset or wrong.
   Ask the user for their AIm link, and tell them where to get one:

   - They already have an account: their link is in the sign-up email, and looks like
     `https://aim-journal.com/<token>` — the token is the last path segment.
   - They do not have one yet: sign up free at <https://aim-journal.com>. The link arrives by
     email. No card, and it runs inside the AI subscription they already pay for.
   - They just want to look around first: point them at the demo, `https://aim-journal.com/demo`.
     It is shared, resets nightly, and is not a place to log real training.

3. **Have them set the token as an environment variable** named `AIM_TOKEN`, then restart the
   session so the plugin picks it up:

   ```bash
   export AIM_TOKEN=<the last path segment of their link>
   ```

   To make it stick, add that line to their shell profile (`~/.zshrc`, `~/.bashrc`).

4. **Verify** by calling `get_coaching_context` again. If it still fails, the most likely causes,
   in order: the whole URL was pasted instead of just the token, the variable was set in a
   different shell than the one the session runs in, or the session was not restarted.

## Handling the token

Treat it as a password. Never print it back in full, never write it into a file the user shares,
and never include it in a commit, an issue or a screenshot. Anyone holding it can read and write
that person's training data. If the user believes it leaked, tell them to request a fresh link
from <https://aim-journal.com>, which rotates it.

## After it connects

Do not plan training from general knowledge. Call `get_coaching_context` first with the matching
task — `next_workout` to plan a session, `new_program` to build a program, `weekly_review` to
review the week — and follow the prompt it returns. It carries this person's goal, experience,
equipment, injuries and logged weights; without it the plan will be wrong for them. If their
intake is incomplete it returns an intake conversation instead — run that.
