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

## What's in this version (Phase 1)

- **All of v3:** 4 modules and 9 mini-games, at parity with the v3 prototype rules.
- **Heroes and powers:** pick a pixel-art hero; each brings a power you can use in games.
- **Progress:** hearts, stars, XP and levels, a daily streak and 12 badges.
- **On-device save:** all progress lives on the device. A nickname is optional; there are
  no accounts.
- **New: Prompt Forge FREE WRITE round.** The learner writes their own prompt. NOVA (a
  real AI) answers it, and the learner gets a verdict on 5 levers plus one tip.
  - Pass = 4 of 5 levers. A weak prompt costs a heart.
  - AI energy: 10 calls per device per day; the whole server allows 500 calls per day.
  - If the AI takes more than 8 s, or the API is out of energy or unreachable, the round
    switches to an in-world offline checklist so the game never stalls.
- **Labelled stubs (not bugs):** the yellow "SOON" "Ask NOVA why" button after a wrong
  answer, and the "Coming soon" strip on the win screen. Both are disabled on purpose.
- **Known v3 parity quirk:** in Tune the Sorter (module 2) the sliders' starting values
  already pass both rounds. v3 behaves the same way, so Phase 1 keeps it.

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
| `GLITCH_HOST` | `127.0.0.1` | API bind address; `0.0.0.0` to reach it from other devices on the LAN |
| `GLITCH_PORT` | `8787` | If unset and `PORT` is set (Cloud Run), `PORT` wins |
| `GLITCH_CORS_ORIGINS` | GH Pages + `127.0.0.1`/`localhost` on 8090 and 8092 | Exact origins, comma-separated |
| `GLITCH_DEVICE_DAILY_CAP` / `GLITCH_GLOBAL_DAILY_CAP` | `10` / `500` | Daily AI budgets (UTC day) |
| `GLITCH_LOG_FILE` | empty | Also append JSON log lines to this file |
| `GLITCH_BLOB_BACKEND` | `local` | Where the shared scenario cache lives: `local` (a directory) or `gcs` (a bucket) |
| `GLITCH_CACHE_DIR` | `api/.cache` | Local cache directory (gitignored); relative paths are from the repo root |
| `GLITCH_GCS_BUCKET` | empty | Bucket name, required when `GLITCH_BLOB_BACKEND=gcs` (uses Application Default Credentials) |
| `GLITCH_BLOB_PREFIX` | empty | Optional key prefix inside the cache dir / bucket |
| `EXPO_PUBLIC_GLITCH_API_URL` | `http://127.0.0.1:8787` | Web build-time: the API base URL baked into the export |

**Which AI answers.** The OpenRouter key is configured in the local root `.env`. With
`GLITCH_LLM_PROVIDER=auto` (the default) the API picks its provider at startup:

- **key present** → OpenRouter, model `google/gemini-2.5-flash-lite`, falling back to
  `openai/gpt-4o-mini`. `/healthz` reports `"provider":"openrouter"`.
- **no key** → the deterministic demo provider. Free-write replies carry a "DEMO NOVA"
  tag and `/healthz` reports `"provider":"fake"`. The game still works end to end.

To force the demo provider even when a key is present (offline work, no spend), set
`GLITCH_LLM_PROVIDER=fake` in `.env` or for one run:

```bash
# from the repo root
cd api && GLITCH_LLM_PROVIDER=fake uv run python -m glitch_api
```

`GLITCH_LLM_PROVIDER=openrouter` without a key refuses to start, and so does
`GLITCH_ENV=prod` with the demo provider. Steps marked `[live]` below need the key and
spend real (small) credits. `uv run pytest -m live` fails loudly (it does not skip) when
the key is missing.

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
# with the key:  {"ok":true,"data":{"status":"ok","provider":"openrouter","model":"google/gemini-2.5-flash-lite","env":"dev","version":"0.1.0"}}
# without a key: {"ok":true,"data":{"status":"ok","provider":"fake","model":"glitch/demo-nova","env":"dev","version":"0.1.0"}}

# tests (unit + integration; no key, no network)
cd api && uv run pytest -q

# [live] tests against the real OpenRouter key in the root .env
# (free-write: 5 calls; scenarios: exactly 1 generation per content game = 5 calls)
cd api && uv run pytest -q -m live

# [gcs] real-bucket round-trip (needs GLITCH_GCS_BUCKET + Application Default Credentials;
# fails with PENDING-CREDS otherwise; writes only under a unique glitch-test-* prefix)
cd api && uv run pytest -q -m gcs

# a fresh case file for Fact or Fib (any UUID v4 works as the device id)
curl -s -H "X-Glitch-Device: 3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c" "http://127.0.0.1:8787/v1/scenarios/m1g2/next?seen="

# [live] check the key and that each configured model slug answers
cd api && uv run python -m glitch_api.tools.check_model
# → MODEL OK google/gemini-2.5-flash-lite
#   MODEL OK openai/gpt-4o-mini
# Without a key it prints "GLITCH_OPENROUTER_API_KEY missing — add it to .env" and exits non-zero.

# observability + privacy check of the API log written by the E2E run
# (Playwright starts the API with GLITCH_LOG_FILE=web/test-results/api.log;
#  run the web E2E tests below first)
cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/api.log
# → LOGS OK …   (exits 1 and lists each failure otherwise)
```

Endpoints (`spec/api.md`): `GET /healthz`, `GET /v1/energy`,
`POST /v1/freewrite/evaluate`, `GET /v1/scenarios/{gameId}/next?seen=<ids>` (Phase 2: a
fresh, never-seen case file for a content game — served free from the shared cache, or
generated once with one AI call and cached for everyone), `GET /v1/metrics`. Every response uses the envelope
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

# end-to-end tests (Playwright starts the API and the export server itself and never
# reuses one already running). Ports: GLITCH_E2E_API_PORT (default 8787), GLITCH_WEB_PORT
# (default 8090); GLITCH_WEB_DIST picks the export dir (default dist). The API URL is baked
# into the export, so export against the same API port first (setup fails on a mismatch).
# Side ports + a separate export dir leave a dev server on 8787 / 8090 untouched:
cd web && npx playwright install chromium
cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8788 npx expo export --platform web --output-dir dist-e2e
cd web && GLITCH_WEB_DIST=dist-e2e GLITCH_E2E_API_PORT=8788 GLITCH_WEB_PORT=8091 GLITCH_E2E_EXPECT_PROVIDER=fake npx playwright test

# [live] end-to-end with the real AI (needs the key in the root .env)
cd web && GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/freewrite.spec.ts e2e/journey.spec.ts
```

## Running the whole thing locally

Start the API first, then build the export and serve it. Both commands start from the
repo root, after `cd api && uv sync` and `cd web && npm ci` have been run once.

```bash
# Terminal 1, from the repo root: API on http://127.0.0.1:8787
cd api && uv run python -m glitch_api

# Terminal 2, from the repo root: export pointed at the local API, then serve on 8090
cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web && node scripts/serve-export.mjs
```

Open `http://127.0.0.1:8090/GLITCH/`.

With the key in `.env`, NOVA's free-write replies come from OpenRouter. Without a key
they are tagged "DEMO NOVA". With the API stopped, the game still plays end to end and
the free-write round uses the offline checklist.

**Phones on the same Wi-Fi.** `127.0.0.1` only works on this machine. Find the machine's
LAN IP (e.g. `192.168.1.20`), then bake it into the export **and** allow it in CORS. Both
servers must also listen on all interfaces:

```bash
# Terminal 1, from the repo root (GLITCH_CORS_ORIGINS = exact origins, comma-separated;
# it replaces the default list, so keep the 127.0.0.1 origin if you still use it)
cd api && GLITCH_HOST=0.0.0.0 GLITCH_CORS_ORIGINS=http://192.168.1.20:8090,http://127.0.0.1:8090 uv run python -m glitch_api

# Terminal 2, from the repo root
cd web && EXPO_PUBLIC_GLITCH_API_URL=http://192.168.1.20:8787 npx expo export --platform web && GLITCH_WEB_HOST=0.0.0.0 node scripts/serve-export.mjs
```

Then open `http://192.168.1.20:8090/GLITCH/` on the phone. You can put `GLITCH_HOST` and
`GLITCH_CORS_ORIGINS` in `.env` instead. `EXPO_PUBLIC_GLITCH_API_URL` is read when the
export is built, so rebuild the export whenever it changes.

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
