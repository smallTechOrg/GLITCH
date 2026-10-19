# GLITCH

GLITCH is a gamified AI-literacy game for 13–18 year olds. Learners pick a pixel-art
hero, watch a short story cutscene and play mini-games that teach them to *spot what AI
gets wrong and make the call*. It is a rebuild of the single-file prototype
(`spec/GLITCH v3.html`) as:

- **`web/`** — one Expo / React Native Web codebase, exported as a static site to GitHub
  Pages at `https://smalltechorg.github.io/GLITCH/` (and to iOS/Android later). The
  whole game, every rule and all learner progress live on the device. It works with no
  server at all.
- **`api/`** — a small Python FastAPI service (Cloud Run). It only guards the OpenRouter
  key, scores the learner's free-written prompt with one AI call, filters the AI output,
  and enforces daily AI budgets. It never stores or logs learner text.

The full spec is in `spec/`: start with `spec/roadmap.md`, then `spec/architecture.md`.

## Prerequisites

| Tool | Version | Used for |
|---|---|---|
| [uv](https://docs.astral.sh/uv/) | ≥ 0.5 | Python 3.12 + backend dependencies (uv downloads 3.12 if needed; pinned by `api/.python-version`) |
| Node.js | 22 (pinned by `.nvmrc`, `web/package.json` `engines`) | Web app, Jest, Playwright |
| Docker / gcloud | optional | Building and deploying the API image |

## Ports

| Port | What | URL |
|---|---|---|
| 8787 | API (`uv run python -m glitch_api`) | `http://127.0.0.1:8787/healthz` |
| 8090 | Static export server (`node scripts/serve-export.mjs`), the canonical test URL | `http://127.0.0.1:8090/GLITCH/` |
| 8092 | Expo dev server (development only) | `http://127.0.0.1:8092` |

## Configuration (`.env`)

All settings live in one **repo-root** `.env` (gitignored). Start from the template:

```bash
# from the repo root
cp .env.example .env
```

`.env.example` documents every variable. The API reads the repo-root `.env` no matter
which directory it is started from. The important ones:

| Var | Default | Notes |
|---|---|---|
| `GLITCH_OPENROUTER_API_KEY` | empty | Secret. Without it the API runs the **demo provider** ("DEMO NOVA") |
| `GLITCH_LLM_PROVIDER` | `auto` | `auto` = `openrouter` when the key is set, else `fake` |
| `GLITCH_OPENROUTER_MODEL` | `google/gemini-2.5-flash-lite` | Primary model slug |
| `GLITCH_OPENROUTER_FALLBACK_MODELS` | `openai/gpt-4o-mini` | Comma-separated |
| `GLITCH_PORT` | `8787` | If unset and `PORT` is set (Cloud Run), `PORT` wins |
| `GLITCH_CORS_ORIGINS` | GH Pages + `127.0.0.1`/`localhost` on 8090 and 8092 | Exact origins, comma-separated |
| `GLITCH_DEVICE_DAILY_CAP` / `GLITCH_GLOBAL_DAILY_CAP` | `10` / `500` | Daily AI budgets (UTC day) |
| `GLITCH_LOG_FILE` | empty | Also append JSON log lines to this file |
| `EXPO_PUBLIC_GLITCH_API_URL` | `http://127.0.0.1:8787` | Web build-time: the API base URL baked into the export |

> **PENDING-KEY.** Until `GLITCH_OPENROUTER_API_KEY` is in the root `.env`, every step
> marked `[live]` below is **PENDING-KEY**, not passed. Everything else works without a
> key: the API serves the deterministic demo provider and the game falls back to the
> offline checklist. `uv run pytest -m live` fails loudly (it does not skip) when the key
> is missing.

Never commit `.env` or paste a key into code, tests, issues or chat.

## API (`api/`)

All commands run from the `api/` directory, through `uv run`.

```bash
# install (creates api/.venv from uv.lock)
cd api && uv sync

# run the API on http://127.0.0.1:8787
cd api && uv run python -m glitch_api

# check it (from any directory, while the API is running)
curl -sf http://127.0.0.1:8787/healthz
# → {"ok":true,"data":{"status":"ok","provider":"fake","model":"glitch/demo-nova","env":"dev","version":"0.1.0"}}

# tests (unit + integration; no key, no network)
cd api && uv run pytest -q

# [live] tests against the real OpenRouter key in the root .env
cd api && uv run pytest -q -m live

# [live] check the key and that each configured model slug answers
cd api && uv run python -m glitch_api.tools.check_model
# → MODEL OK google/gemini-2.5-flash-lite
#   MODEL OK openai/gpt-4o-mini
# Without a key it prints "GLITCH_OPENROUTER_API_KEY missing — add it to .env" and exits non-zero.
```

Endpoints (`spec/api.md`): `GET /healthz`, `GET /v1/energy`,
`POST /v1/freewrite/evaluate`, `GET /v1/metrics`. Every response uses the envelope
`{"ok": true, "data": …}` / `{"ok": false, "error": {"code", "message", "retryable"}}`.
Each request writes one JSON log line to stdout with `route`, `method`, `status`,
`latency_ms`, `request_id`, `device_hash` and `outcome`. Bodies, prompts and raw device
ids are never logged.

## Web (`web/`)

All commands run from the `web/` directory, through `npm`/`npx`, on Node 22.

```bash
# install (exact versions from package-lock.json)
cd web && npm ci

# production static export (+ sanity check of dist/)
cd web && npx expo export --platform web && node scripts/check-export.mjs

# export that talks to the local API
cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web && node scripts/check-export.mjs

# serve the export on http://127.0.0.1:8090/GLITCH/
cd web && node scripts/serve-export.mjs

# dev server with hot reload on http://127.0.0.1:8092 (development only)
cd web && npx expo start --web --port 8092

# types + unit/component tests
cd web && npx tsc --noEmit && npx jest --ci

# end-to-end tests (Playwright starts the API and the export server itself;
# run the export command first, and stop any server already on 8787 / 8090)
cd web && npx playwright install chromium
cd web && GLITCH_E2E_EXPECT_PROVIDER=fake npx playwright test

# [live] end-to-end with the real AI (needs the key in the root .env)
cd web && GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/freewrite.spec.ts e2e/journey.spec.ts
```

## Running the whole thing locally

1. Terminal 1: `cd api && uv run python -m glitch_api`
2. Terminal 2: `cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web && node scripts/serve-export.mjs`
3. Open `http://127.0.0.1:8090/GLITCH/`.

Without a key the free-write round answers as "DEMO NOVA". With the API stopped, the game
still plays end to end and the free-write round uses the offline checklist.

## Deploy

**API → Cloud Run** (`api/Dockerfile`: `python:3.12-slim` + uv, listens on Cloud Run's
`PORT`, one instance max):

```bash
# once: store the key in Secret Manager
printf %s "$KEY" | gcloud secrets create glitch-openrouter-key --data-file=-

# deploy from the api/ directory
cd api && gcloud run deploy glitch-api --source . --region us-central1 --allow-unauthenticated --max-instances 1 --set-env-vars GLITCH_ENV=prod,GLITCH_LLM_PROVIDER=openrouter,GLITCH_CORS_ORIGINS=https://smalltechorg.github.io --set-secrets GLITCH_OPENROUTER_API_KEY=glitch-openrouter-key:latest

# verify
curl -sf https://<service-url>/healthz
```

Also set a credit limit on the OpenRouter key. It is the hard spend backstop, because
Phase 1 keeps the daily counters in memory and a cold start resets them.

**Web → GitHub Pages** (`.github/workflows/pages.yml`):
set the repository variable `GLITCH_API_URL` to the Cloud Run URL, set Pages source to
"GitHub Actions", and push to `main`. The workflow builds the export and deploys
`https://smalltechorg.github.io/GLITCH/`. Manual equivalent:

```bash
cd web && EXPO_PUBLIC_GLITCH_API_URL=https://<service-url> npx expo export --platform web
```

then publish `web/dist`, including `dist/.nojekyll`.

## Repository layout

```
README.md  .env.example  .gitignore  .nvmrc  .github/workflows/pages.yml
spec/      product + technical spec, v3 prototype source (GLITCH v3.html, GLITCH v0.1.docx)
api/       FastAPI service — src/glitch_api/ (one package), tests/{unit,integration,live}
web/       Expo app — app/ (routes), src/ (game), tests/ (Jest), e2e/ (Playwright)
```
