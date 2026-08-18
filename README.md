# AIm

A workout tracker your AI assistant writes to. AIm is an **MCP server** plus a **mobile web app
(PWA)**: you describe a session in Claude or ChatGPT in your own words, the assistant logs it
through MCP, and the app shows the program, the history, records, estimated 1RM and per muscle
load. The coaching prompts live on the server, so the assistant plans from your logged weights
instead of generic advice.

Live at [aim-journal.com](https://aim-journal.com). Free, and it runs inside the AI subscription
you already pay for rather than being a second one. Guides:
[connect a workout tracker over MCP](https://aim-journal.com/guides/en/connect-workout-tracker-mcp/),
[AI personal trainer](https://aim-journal.com/guides/en/ai-personal-trainer/),
[1RM calculator](https://aim-journal.com/guides/en/one-rep-max-calculator/).

## How it works

One unique URL safe **token** per user serves everything on the same host:

```
https://<app>/{token}            mobile web app / installable PWA
https://<app>/{token}/mcp        add as a custom connector in Claude or ChatGPT
https://<app>/{token}/api/*      read only JSON the UI consumes
```

A token resolver middleware maps the token to a user and scopes every query by `user_id`. There is
no password and no OAuth dance: the link is the credential, which is what makes it a one paste
setup in an assistant that supports custom connectors.

## What the MCP server exposes

20 tools over stateless streamable HTTP (FastMCP):

- **Logging**: `log_session`, `update_session`, `update_set`, `delete_session`, `import_document`
  (paste an export from another tracker or a photo of a notebook page).
- **Reading**: `get_sessions`, `get_session`, `get_stats` (volume, progression, estimated 1RM via
  Epley), `get_program`, `get_goals`, `get_body_metrics`.
- **Catalogue**: `search_exercise_pool` (a curated global pool with illustrations),
  `list_exercises`, `upsert_exercise`.
- **Coaching**: `get_coaching_context` is the important one. It returns this user's goal,
  experience, equipment, injuries and recent loads together with the prompt for the task at hand
  (next workout, new program, weekly review), so the assistant plans from data rather than from
  nothing. `review_program_draft`, `update_coach_profile`, `upsert_goal`, `log_coach_event`,
  `log_body_metric` keep that context current.

## Repo layout

```
api/index.py      Vercel entrypoint (must stay at repo root, see below). Imports backend/src.
requirements.txt  Vercel's Python build reads this (must also stay at repo root).
backend/          Python package, tests, scripts, DB migrations.
web/              Vite + React SPA (own package.json, own dev server) and the static guide pages.
```

`api/index.py` and `requirements.txt` cannot move: Vercel's zero config Python builder only
auto detects functions under a root level `api/`, and only installs a root level
`requirements.txt` alongside them. Everything else in `backend/` (pyproject.toml, uv.lock, tests,
scripts, supabase/) is hidden from the Vercel build by `.vercelignore`, so Vercel treats the repo
as a static SPA plus one Python function.

## Stack

- **Backend** (`backend/`): Python 3.12, FastMCP (stateless HTTP), psycopg3, Supabase Postgres
  (transaction pooler). MCP and the read API live in `backend/src/workout_storage/`, served by
  `api/index.py`.
- **Frontend** (`web/`): Vite, React, Tailwind v4, shadcn/ui, recharts, React Query,
  vite-plugin-pwa. Data layer in `web/src/app/lib/` (token to api to adapter to hooks). The guide
  pages under `web/guides/` are generated to static HTML at build time and ship no bundle.
- **Hosting**: one Vercel project. `vercel.json` routes mcp, api and cron to the function and
  everything else to the SPA.

## Frontend dev

```bash
cd web
npm install
echo 'VITE_API_ORIGIN=https://workout-storage.vercel.app' > .env.local  # dev against prod API
npm run dev              # http://localhost:5173/{token}
npm run test             # vitest: pure function + component tests
npx playwright install chromium   # one time, before the first test:e2e run
npm run test:e2e         # Playwright, against /demo (no backend needed)
```

## Backend dev

```bash
cd backend
uv sync --extra dev           # install deps
cp ../.env.example ../.env     # fill DATABASE_URL etc. (kept at repo root, shared by all tooling)
uv run pytest                  # unit + integration + e2e
uv run ruff check . && uv run mypy .
```

Create a user (prints the token to open in the browser and to paste into an assistant):

```bash
cd backend
uv run python scripts/create_user.py --name "Alex"
```

## Running your own

Everything needed is here, but this is the source of a hosted service rather than a turnkey self
host kit: you supply a Supabase project (migrations in `backend/supabase/migrations/`), a Vercel
project, and the environment variables listed in `.env.example`. Analytics, email and backup
integrations are optional and stay dormant without their keys.

## Attribution

Exercise illustrations are third party works under CC BY-SA, each credited in
[`web/ATTRIBUTIONS.md`](web/ATTRIBUTIONS.md). They keep their own license regardless of the license
on this repository.

## License

MIT, see [LICENSE](LICENSE). The exercise illustrations are the one exception, see Attribution above.
