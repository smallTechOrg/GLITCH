# GLITCH — Architecture

## System overview

```
 ┌──────────────────────── device (phone / laptop browser; later native) ───────────────────────┐
 │  web/ — universal app (React Native + React Native Web via Expo, static export)              │
 │   screens ─ game frame ─ 9 games ─ free-write round                                          │
 │   engine (pure rules: XP, levels, streak, badges, progression, game session)                 │
 │   pixel engine (framebuffer → PNG data URI, memoised) + art library                          │
 │   on-device store (all learner state; versioned; migrations)                                 │
 │   api client (base URL = EXPO_PUBLIC_GLITCH_API_URL, 8 s abort, X-Glitch-Device header)      │
 └──────────────┬───────────────────────────────────────────────────────────────────────────────┘
                │ HTTPS JSON (only: device id, goal, prompt text — prompt is never stored/logged)
 ┌──────────────▼──────────────── api/ — FastAPI on Cloud Run (max-instances 1) ───────────────┐
 │  routes: /healthz  /v1/energy  /v1/freewrite/evaluate  /v1/metrics (P2 scenarios, P3 explain)│
 │  agent/freewrite.py  pipeline: budget → build → call → parse/validate → moderate → finalize  │
 │  llm/ provider protocol ─ OpenRouterProvider (httpx) │ FakeProvider (deterministic demo)    │
 │  caps/ EnergyService over CounterStore (Phase 1 memory; Phase 2 GCS-backed)                 │
 │  moderation/ deterministic output filter        logging (structlog JSON) + metrics counters │
 │  Phase 2+: store/ BlobStore (GCS │ local FS) — scenario + explanation cache                  │
 └──────────────┬───────────────────────────────────────────────────────────────────────────────┘
                │ HTTPS  POST https://openrouter.ai/api/v1/chat/completions (one call per artifact)
                ▼
            OpenRouter → GLITCH_OPENROUTER_MODEL (+ fallback models routed by OpenRouter)
```

### Components

| Component | Responsibility | Never does |
|---|---|---|
| Web app (`web/`) | Entire game, all rules, all learner state, offline check, fallbacks | Hold any secret; require the server to be reachable to progress |
| API (`api/`) | Hold the OpenRouter key, call the LLM, validate + moderate output, enforce caps, log/metrics, (Phase 2+) own the cache | Store or log learner text or learner progress |
| OpenRouter | Route to the configured cheap model; server-side fallback via `models` list | — |
| GitHub Pages | Serve `web/dist` at `https://smalltechorg.github.io/GLITCH/` | — |
| Cloud Run | Run `api/Dockerfile`, one instance max (beta), scale to zero | — |

### Data flow — free-write round (Phase 1's AI path)

1. Round mounts → client `GET /v1/energy` (header `X-Glitch-Device: <uuid>`) → energy
   meter shows `remaining/limit`. On failure the meter shows the "?" offline state.
2. Learner presses SEND → client `POST /v1/freewrite/evaluate {goalId, goal, prompt}`
   with an 8 000 ms abort; NOVA thinking animation runs.
3. Server pipeline (`spec/agent.md`): device + global budget check → messages from
   prompt files → ONE OpenRouter call (7 s timeout, `max_tokens` 700, JSON schema) →
   parse + validate → moderate → compute `leversHit`/`passed` server-side → charge device
   → respond with envelope + fresh energy. Logs one `request` and one `llm_call` line.
4. Client: `ok` → show reply, lever chips, tip; pass (≥4) → `api.win`, else `api.miss`.
   Any error / abort / cap → offline check (`spec/capabilities/freewrite-forge.md`) +
   in-world banner. Either way a history entry is saved on the device.

## Stack

User-stated (BINDING): Expo / React Native Web, static export to GitHub Pages, same
codebase for native later; Python FastAPI on Cloud Run; OpenRouter; GCS JSON cache with a
local-FS backend; uv + Python; Node 22; Jest (jest-expo) + React Native Testing Library;
Playwright against the exported build.

| Layer | Choice | Rationale |
|---|---|---|
| App framework | **Expo SDK (latest stable that `npx create-expo-app@latest` installs on scaffold day, ≥ 54), TypeScript strict** — every Expo-managed package added with `npx expo install` so versions match the SDK | Binding. One codebase for web now, native later. |
| Routing | **Expo Router** with `web.output: "static"` and `experiments.baseUrl: "/GLITCH"` | Static HTML per route → GH Pages deep links work without a SPA 404 hack; baseUrl handles the repo sub-path. |
| State | **zustand** + `persist` middleware over **@react-native-async-storage/async-storage** (localStorage on web) | Tiny, store usable outside React (pure engine tests), same API on native. |
| Pixel engine | In-house TS framebuffer (RGBA `Uint8ClampedArray`) with the v3 primitives, encoded to PNG by **fast-png**, rendered by RN `Image` (web: `imageRendering: "pixelated"`; native: integer pre-upscale) | One platform-independent path; pixels are unit-testable; no canvas/Skia/WASM dependency on web. |
| Font | **@expo-google-fonts/press-start-2p** via `expo-font` | Bundled with the export — no runtime Google Fonts request. |
| Animation | RN `Animated` with an in-house stepped easing (`steps(n)`) | v3's animations are all `steps()`; no extra dependency. |
| Drag & drop | In-house on RN `PanResponder` + `measureInWindow` zone hit-testing, plus tap-to-select and keyboard | Works identically on RN Web (mouse/touch) and native; tap/keyboard paths are deterministic for tests. |
| Markdown | **react-native-markdown-display** for NOVA's reply only | Harness rule: LLM text is never shown as raw syntax. |
| Device id / random | **expo-crypto** `randomUUID()` | Anonymous v4 UUID, stored on device. |
| Web unit tests | **jest-expo** preset + **@testing-library/react-native** | Binding. |
| E2E | **@playwright/test**, Chromium headless, against `web/dist` served by `web/scripts/serve-export.mjs` (node:http, no deps) under `/GLITCH/` | Binding; the server mirrors GH Pages path semantics exactly. |
| Backend | **Python 3.12**, **FastAPI**, **uvicorn**, **pydantic v2**, **pydantic-settings**, **httpx**, **structlog** | Binding framework; httpx gives timeouts + a `MockTransport` seam; structlog → Cloud Run JSON logs. |
| Backend tests | **pytest**, **pytest-asyncio** (auto mode), httpx `ASGITransport` | In-process app tests on the real code path. |
| LLM | **OpenRouter** chat completions over HTTP, `response_format: json_schema` (strict), `provider.require_parameters: true`, `models: [primary, ...fallbacks]` | Binding provider; OpenRouter-side fallback keeps it ONE HTTP call. |
| Blob cache (Phase 2+) | **google-cloud-storage**; `LocalBlobStore` for dev/tests, same protocol | Binding. |
| Counters | Phase 1: in-memory `MemoryCounterStore`, Cloud Run `--max-instances 1`. Phase 2: `BlobCounterStore` (GCS, generation-match writes) | Simplest thing correct at beta scale (tens of students, one instance). Known gap: a cold start resets counters — the backstop is a per-key credit limit on the OpenRouter key; Phase 2 fixes it. |
| Moderation | Deterministic output filter (word-list file + patterns), fail-closed | Zero tokens, zero extra calls, testable; output-only per brief. |
| Deploy | `api/Dockerfile` → `gcloud run deploy --source api` (prod: `GLITCH_BLOB_BACKEND=gcs` + bucket); `.github/workflows/pages.yml` → GH Pages | Deploy story real from Phase 1; user runs it. |

> **Assumed:** default model `GLITCH_OPENROUTER_MODEL=google/gemini-2.5-flash-lite` (cheap ~$0.10/M in, $0.40/M out, supports structured JSON output), fallback `GLITCH_OPENROUTER_FALLBACK_MODELS=openai/gpt-4o-mini`. Both slugs MUST be verified live at the scaffold gate with `check_model`; if either fails, replace it with the cheapest current JSON-schema-capable slug from `GET https://openrouter.ai/api/v1/models` and update this line and `.env.example`.
> **Assumed:** `:free` OpenRouter models are not the default because of strict request caps (≈50/day on low-credit accounts, 20/min) and inconsistent JSON-schema support, which would break a classroom of tens. Any `:free` slug can be set via env with no code change; set `GLITCH_OPENROUTER_RESPONSE_FORMAT=json_object` for models without schema support (the parser salvages JSON either way).
> **Assumed:** in-memory caps for Phase 1 on a single Cloud Run instance; GCS-backed counters in Phase 2. The user should set a credit limit on the OpenRouter key as the hard backstop.
> **Assumed:** output moderation is a deterministic local filter (no moderation-model call) in Phase 1.
> **Assumed:** cost per free-write call ≈ $0.0003; the 500/day global ceiling caps spend at ≈ $0.15/day.
> **Assumed:** Cloud Run region `us-central1`, service name `glitch-api`.

## Configuration

Backend settings (`api/src/glitch_api/config.py`, prefix `GLITCH_`, read from the
**repo-root** `.env` — resolved as `Path(__file__).resolve().parents[3] / ".env"` — plus
real env vars; `extra="ignore"`; enum values stripped of inline `#` comments and
whitespace; the key is a `SecretStr`, never printed):

| Var | Default | Notes |
|---|---|---|
| `GLITCH_ENV` | `dev` | `dev` \| `prod`. In `prod`, resolved provider `fake` is a startup error. |
| `GLITCH_HOST` | `127.0.0.1` | Dockerfile sets `0.0.0.0`. |
| `GLITCH_PORT` | `8787` | If unset and `PORT` is set (Cloud Run), `PORT` wins. |
| `GLITCH_LLM_PROVIDER` | `auto` | `auto` → `openrouter` when the key is set, else `fake`. `openrouter` without a key = startup error. |
| `GLITCH_OPENROUTER_API_KEY` | — | Secret. Root `.env` locally; Secret Manager on Cloud Run. |
| `GLITCH_OPENROUTER_MODEL` | `google/gemini-2.5-flash-lite` | Assumed, verified at the gate. |
| `GLITCH_OPENROUTER_FALLBACK_MODELS` | `openai/gpt-4o-mini` | Comma-separated; empty = none. |
| `GLITCH_OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `GLITCH_OPENROUTER_RESPONSE_FORMAT` | `json_schema` | `json_schema` \| `json_object`. |
| `GLITCH_APP_URL` | `https://smalltechorg.github.io/GLITCH/` | Sent as `HTTP-Referer`; `X-Title: GLITCH`. |
| `GLITCH_LLM_TIMEOUT_S` | `7.0` | Total provider budget; under the client's 8 s. |
| `GLITCH_LLM_MAX_OUTPUT_TOKENS` | `700` | Bounded output. |
| `GLITCH_DEVICE_DAILY_CAP` | `10` | Live-AI actions per device per UTC day. |
| `GLITCH_GLOBAL_DAILY_CAP` | `500` | Provider calls per UTC day, server-wide. |
| `GLITCH_CORS_ORIGINS` | `https://smalltechorg.github.io,http://127.0.0.1:8090,http://localhost:8090,http://127.0.0.1:8092,http://localhost:8092` | Comma-separated exact origins. |
| `GLITCH_LOG_LEVEL` | `INFO` | |
| `GLITCH_LOG_FILE` | empty | If set, JSON lines also appended here (E2E sets `web/test-results/api.log`, or `web/test-results/<port>/api.log` when `GLITCH_E2E_API_PORT` ≠ 8787). |
| `GLITCH_FAKE_LATENCY_MS` | `0` | Fake provider delay (tests only). |
| `GLITCH_BLOB_BACKEND` *(Phase 2)* | `local` | `local` \| `gcs` (`store/local.py` / `store/gcs.py`, one `BlobStore` protocol in `store/base.py`). `GLITCH_ENV=prod` requires `gcs` (startup error otherwise). |
| `GLITCH_CACHE_DIR` *(Phase 2)* | `api/.cache` | Local blob root (gitignored); a relative path resolves from the repo root. |
| `GLITCH_GCS_BUCKET` *(Phase 2)* | — | Required when backend = `gcs`, hence in prod (startup error otherwise); auth = Application Default Credentials. |
| `GLITCH_BLOB_PREFIX` *(Phase 2)* | empty | Optional key prefix inside the bucket / cache dir (e.g. `staging`; tests use a unique prefix). |

Web (build-time, `EXPO_PUBLIC_*` are inlined by the export):

| Var | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_GLITCH_API_URL` | `http://127.0.0.1:8787` | Production export sets the Cloud Run URL. |
| `GLITCH_WEB_PORT` | `8090` | `serve-export.mjs` port. |
| `GLITCH_E2E_EXPECT_PROVIDER` | `fake` | E2E asserts `/healthz` reports this provider before running. |

Test tooling (Playwright E2E, read by `web/e2e/helpers/config.ts` / `playwright.config.ts`;
commented out in `.env.example`):

| Var | Default | Notes |
|---|---|---|
| `GLITCH_E2E_API_PORT` | `8787` | Port the E2E run starts its own API on. Any other port puts the run's artefacts (`api.log`, `blob-cache`, Playwright output) in `web/test-results/<port>/` (8787: `web/test-results/`) and the HTML report in `playwright-report/<port>/`. The export must be built with the matching `EXPO_PUBLIC_GLITCH_API_URL` (globalSetup fails on a mismatch). |
| `GLITCH_WEB_DIST` | `dist` | Export dir served by `serve-export.mjs` (and so by the E2E), relative to `web/` or absolute — e.g. `dist-e2e`, built with `--output-dir dist-e2e`, so the E2E export never overwrites a served `dist`. |
| `GLITCH_E2E_REUSE_SERVERS` | unset | `1` = reuse servers already listening on the E2E ports; otherwise never reused (a taken port fails the run). |

## Layout

```
GLITCH/                                  # repo root — config, spec, docs only
├── README.md                            # all commands, working dir stated per block
├── .env.example                         # every var in ## Configuration
├── .gitignore                           # .env, api/.venv, api/.cache, web/node_modules, web/dist, web/test-results, web/playwright-report
├── .nvmrc                               # 22
├── .github/workflows/pages.yml          # npm ci → expo export (EXPO_PUBLIC_GLITCH_API_URL=${{ vars.GLITCH_API_URL }}) → deploy-pages
├── spec/                                # this spec + v3 source material (GLITCH v3.html, GLITCH v0.1.docx — never moved)
├── api/
│   ├── .python-version                  # 3.12
│   ├── pyproject.toml                   # requires-python ==3.12.*; hatchling; [tool.pytest] markers live,gcs; addopts -m "not live and not gcs"
│   ├── uv.lock
│   ├── Dockerfile                       # python:3.12-slim + uv; CMD ["uv","run","--frozen","--no-dev","python","-m","glitch_api"]; GLITCH_HOST=0.0.0.0
│   ├── .dockerignore
│   ├── src/glitch_api/                  # the ONE backend package
│   │   ├── __init__.py
│   │   ├── __main__.py                  # uvicorn.run(create_app(), host, port) — the run command
│   │   ├── main.py                      # create_app(settings=None): CORS, request-log middleware, error handlers, routers
│   │   ├── config.py                    # Settings, get_settings(), reset_settings(); resolved_provider property
│   │   ├── logging.py                   # structlog JSON config (+ optional file sink); RequestLogMiddleware
│   │   ├── envelope.py                  # ok(data, energy=None), ApiError(code,http_status,message,retryable), handlers
│   │   ├── metrics.py                   # Metrics singleton (counters) + snapshot() + reset()
│   │   ├── device.py                    # parse X-Glitch-Device (UUID v4) ; device_hash() = sha256[:12]
│   │   ├── routes/{health,metrics,energy,freewrite}.py   (+ scenarios.py P2, explain.py P3)
│   │   ├── explain/{content,items,schemas,pipeline,fake}.py   # Phase 3 P3-D1
│   │   ├── content/v3/<gameId>.json      # Phase 3 P3-D1 — bundled v3 items (spec/data.md)
│   │   ├── llm/
│   │   │   ├── base.py                  # LLMProvider Protocol, ChatMessage, LLMRequest, LLMResult, LLMError hierarchy
│   │   │   ├── openrouter.py            # OpenRouterProvider(httpx.AsyncClient)
│   │   │   ├── fake.py                  # FakeProvider — "<node:freewrite_eval>"-tagged deterministic output
│   │   │   └── factory.py               # get_provider(settings) / reset_provider()
│   │   ├── agent/freewrite.py           # FreewriteState, steps, run_freewrite() — mirrors spec/agent.md
│   │   ├── prompts/{freewrite_system.md,freewrite_user.md,loader.py}
│   │   ├── schemas/freewrite.py         # EvaluateRequest, EvaluateData, LLMFreewriteOutput, JSON schema dict
│   │   ├── heuristics/levers.py         # lever cue rules (used by FakeProvider)
│   │   ├── moderation/{filter.py,blocklist.txt}
│   │   ├── caps/{store.py,budget.py}    # CounterStore Protocol + MemoryCounterStore ; EnergyService(clock)
│   │   └── tools/{check_model.py,check_logs.py}
│   └── tests/
│       ├── conftest.py                  # settings reset, app client fixture, frozen clock, live-key guard
│       ├── unit/                        # pure: schemas, moderation, caps, heuristics, prompt loader, parser
│       ├── integration/                 # ASGI app end-to-end with FakeProvider / MockTransport OpenRouter
│       └── live/                        # @pytest.mark.live — real OpenRouter via root .env
└── web/
    ├── package.json                     # engines.node ">=22 <23"; scripts: test, typecheck, export, serve, e2e
    ├── package-lock.json
    ├── app.config.ts                    # name GLITCH, slug glitch, web.output static, experiments.baseUrl "/GLITCH", typedRoutes
    ├── tsconfig.json  babel.config.js  jest.config.js  playwright.config.ts
    ├── public/.nojekyll                 # GH Pages must serve /_expo/
    ├── assets/                          # app icon, favicon (pixel art PNGs)
    ├── scripts/serve-export.mjs         # node:http: /GLITCH/* → dist (x → x.html | x/index.html), / → 302 /GLITCH/, 404 → +not-found.html
    ├── scripts/check-export.mjs         # export sanity (see roadmap scaffold gate 3)
    ├── app/                             # Expo Router routes — thin wrappers, scaffold-owned
    │   ├── _layout.tsx                  # fonts, store hydration gate, ToastHost, TopBar, wipe transition
    │   ├── index.tsx                    # → HomeScreen (redirects to /welcome if not onboarded)
    │   ├── welcome.tsx  settings.tsx  +not-found.tsx
    │   └── module/[mod]/{hero,story,complete}.tsx, module/[mod]/game/[game].tsx   # generateStaticParams for all ids
    ├── src/
    │   ├── contracts/                   # FROZEN in Phase 1 (see ## Contracts)
    │   │   ├── ids.ts  game.ts  state.ts  api.ts  art.ts
    │   ├── theme/{tokens.ts,fonts.ts}
    │   ├── pixel/{framebuffer.ts,primitives.ts,palette.ts,font3.ts,grid.ts,png.ts,PixelImage.tsx}
    │   ├── art/{icons.ts,Icon.tsx,Sprite.tsx,Scene.tsx}          # scaffold
    │   ├── art/{characters.ts,scenes.ts,ambient.ts}              # A2 (scaffold ships stubs for the first two)
    │   ├── content/{modules.ts,heroes.ts}                        # scaffold
    │   ├── content/{story.ts,badges.ts}                          # A1
    │   ├── engine/{progression,xp,streak,badges,session,rewards}.ts   # A1 — pure functions
    │   ├── state/{store.ts,migrate.ts,deviceId.ts}               # scaffold
    │   ├── state/actions.ts                                      # A1
    │   ├── dnd/{sortEngine.ts,SortBoard.tsx,pickEngine.ts,PickList.tsx,useDrag.ts}
    │   ├── ui/{PixelButton,Card,Chip,Bar,Tag,Terminal,Slider,ToggleTile,MetricBar,SpeechBubble,StatTile,StubBadge,EnergyMeter,ToastHost}.tsx, ui/toast.ts
    │   ├── a11y/{useReducedMotion.ts,announce.ts,stepped.ts,useStepAnimation.ts}
    │   ├── api/{config.ts,client.ts}
    │   ├── games/registry.ts                                     # scaffold: imports games/<id>/index.ts ×9
    │   ├── games/<id>/{index.ts,data.ts,logic.ts,Game.tsx}       # one folder per game, owned by its slice
    │   ├── features/freewrite/**                                 # E (scaffold ships FreeWriteRound.tsx stub)
    │   ├── features/variations/**                                # Phase 2 W1
    │   ├── features/{tutor,recap,memory}/**                      # Phase 3 W1 / W2 (P3-C ships placeholders)
    │   ├── content/concepts.ts                                   # Phase 3 P3-C
    │   ├── screens/**                                            # A1 (scaffold ships placeholders)
    │   └── testing/{testGameApi.ts,renderWithProviders.tsx}
    ├── tests/                           # jest: unit + component, outside src/
    │   ├── unit/  engine/  art/  screens/  games/<id>/  features/freewrite/
    └── e2e/                             # playwright
        ├── helpers/{fixtures.ts,flows.ts}   # fresh context, onboard(), skipStory(), sortByTap(), pickLines(), expectWin()
        └── smoke, shell, module1..4, freewrite, journey .spec.ts
```

> **Assumed:** tests live in `web/tests` + `web/e2e` and `api/tests` (outside each project's source dir) rather than one root `tests/`, because the two halves use different runtimes and lockfiles; this honours "tests outside the source package, tiers separated".

## Contracts (frozen for Phase 1 — scaffold implements; slices consume, never edit)

- `web/src/contracts/routes.ts` (the `*_HREF` route constants, `stepHref`, `gameHref` and sibling `*Href` helpers) is also a frozen scaffold contract — screens never hand-build paths.

### `web/src/contracts/ids.ts`
```ts
export type HeroId = 'scout' | 'chrono' | 'guard' | 'oracle';
export type NpcId = 'z' | 'k' | 'd' | 'n';            // ZARA, KABIR, MS. D'SOUZA, NOVA
export type CharacterId = HeroId | NpcId;
export type PowerKind = 'scan' | 'rewind' | 'shield' | 'hint'; // X-RAY, REWIND, SHIELD, FOCUS
export type ModuleId = 1 | 2 | 3 | 4;
export type GameId = 'm1g1'|'m1g2'|'m2g1'|'m2g2'|'m3g1'|'m3g2'|'m4g1'|'m4g2'|'m4g3';
export type StepId = `m${ModuleId}h` | `m${ModuleId}s` | GameId;
export type BadgeId = 'boot'|'story'|'eye'|'smith'|'bias'|'fact'|'untouch'|'power'|'heroes'|'grad'|'streak'|'lvl';
export type LeverId = 'task' | 'context' | 'role' | 'format' | 'limit';
export type Mood = 'neutral' | 'bad' | 'good';
```

### `web/src/contracts/game.ts`
```ts
export interface PowerHandlers {
  scan?: () => boolean;   // X-RAY: return true iff something was revealed/solved (use consumed)
  hint?: () => boolean;   // FOCUS: return true iff a hint was given (use consumed)
  undo?: () => void;      // called by REWIND after it restores a heart (optional)
}
export interface GameApi {
  readonly hero: HeroId;
  readonly hearts: number;          // 0..3, live
  readonly over: boolean;           // true after win or fail — games ignore input then
  readonly reducedMotion: boolean;
  say(text: string, mood?: Mood): void;          // speech bubble (also a polite live region)
  miss(message?: string): void;                  // shield/heart rules live in the frame, not the game
  win(summary?: string): void;                   // frame computes stars/XP/bonuses
  registerPowers(h: PowerHandlers): void;        // replace current handlers (call again per step/round)
  toast(text: string): void;
}
export interface GameDefinition {
  id: GameId; module: ModuleId; title: string; goal: string; intro: string;
  Component: React.ComponentType<{ api: GameApi }>;
}
```
`web/src/games/<id>/index.ts` default-exports a `GameDefinition`. `games/registry.ts`
exports `GAMES: Record<GameId, GameDefinition>`. The scaffold stub for each game renders
"UNDER CONSTRUCTION" and nothing else.

### `web/src/features/freewrite/FreeWriteRound.tsx` (scaffold stub, E implements)
```ts
export interface FreeWriteRoundProps { api: GameApi; onPassed: () => void }
export function FreeWriteRound(props: FreeWriteRoundProps): JSX.Element;
```
m2g2 renders it after forge 2; `onPassed` → m2g2 calls `api.win(<v3 summary>)`.

### `web/src/contracts/state.ts`
The persisted shape is defined in `spec/data.md` → `PersistedStateV1`; this file is its
TypeScript mirror. `web/src/state/store.ts` exports `useGlitchStore` (zustand) with the
state plus these primitive actions only:
`setNickname(n|null)`, `setOnboarded()`, `setReadableFont(b)`, `patch(fn: (s) => void)`
(immer-free draft-style updater implemented with a structured clone — the only write
path A1's `state/actions.ts` uses), `addPromptHistory(entry)` (newest first, cap 50),
`resetProgress()` (rules in `spec/capabilities/course-shell.md`), `hydrated: boolean`.
Storage key `glitch.v1.state`; device id key `glitch.v1.device`.

### `web/src/contracts/api.ts`
TypeScript mirror of `spec/api.md` (envelope, `EnergyDTO`, `FreewriteEvaluateRequest`,
`FreewriteEvaluateData`, `ApiErrorCode`). `web/src/api/client.ts` exports
`getEnergy(signal?)` and `evaluateFreewrite(req, { timeoutMs = 8000 })`, each resolving to
`ApiResult<T> = ApiOk<T> | ApiErr | { ok: false; error: { code: 'NETWORK' | 'TIMEOUT'; … } }`
— they never throw.

### `web/src/contracts/art.ts` + pixel engine
```ts
export interface FrameBuffer { readonly w: number; readonly h: number; readonly data: Uint8ClampedArray;
  get(x: number, y: number): string /* '#rrggbb' or '' */ }
export type IconId = keyof typeof IC;                     // 40 icons from v3 (lines 163–204) + derived heart0, star0
export type SceneId = 'meadow'|'lab'|'forge'|'city'|'news'|'title';
export type CharFrame = 'idle' | 'blink' | 'talk' | 'think'; // 'think' only for 'n'
// art/characters.ts (A2):  drawCharacter(id: CharacterId, frame?: CharFrame): FrameBuffer  // 24×32 (NOVA 24×28)
// art/scenes.ts     (A2):  drawScene(id: SceneId, w?: number, h?: number, frame?: 0|1): FrameBuffer // default 192×80
// art/Icon.tsx:   <Icon name scale outlined? accessibilityLabel? />
// art/Sprite.tsx: <Sprite id scale frame? animate?: 'bob'|'talk'|'none' outlined? />
// art/Scene.tsx:  <Scene id style ambient?: boolean />   (ambient frames off under reduced motion)
```
`pixel/primitives.ts` ports v3 `rc, px1, cir, band, mtn, dith, txt, rnd` with identical
maths (signatures take the target framebuffer as the first argument). Scaffold stubs of
`drawCharacter`/`drawScene` return correctly sized silhouettes so screens render before
A2 lands.

### `web/src/dnd/*`
- `sortEngine.ts` — pure: `createSort(cfg)`, `drop(state, itemId, zoneId) → {state, result: 'placed'|'wrong'|'ignored'}`,
  `xray(state)`, `focus(state)`, `isDone(state)`. Semantics = v3 `sortGame` (`spec/capabilities/game-runtime.md` → Sort engine).
- `SortBoard.tsx` — `<SortBoard cfg api onDone layout="pool-first"|"zones-top" header? />`;
  wires drag (8 px threshold), tap-to-select, keyboard, X-RAY/FOCUS via `api.registerPowers`,
  wrong-drop → `api.miss(cfg.wrong?.(item, zone) ?? "Not there. Look at the clues again.")`.
- `pickEngine.ts` + `PickList.tsx` — tap-the-line games (Fact or Fib, Proxy Hunt):
  lines `{ text, isTarget: boolean|null /* null = redacted */, note? }`, marks
  target/safe, `found` count, X-RAY = first unmarked target, FOCUS = first unmarked
  non-target marked safe.
- `ui/Slider.tsx` — accessible stepped slider (role adjustable, ←/→ ±1, PageUp/PageDown
  ±10, Home/End, and visible − / + buttons), `onChange(value)`.

### Phase 3 contracts (slice P3-C lands these first; frozen for P3-D1 / P3-G / P3-W1 / P3-W2)

**`web/src/contracts/game.ts`** (additive and backwards-compatible; every existing
`miss(message)` call still compiles and behaves exactly as before):
```ts
export type Concept =
  | 'Machine learning' | 'Training data' | 'Generalization'
  | 'Weights and thresholds' | 'Classification' | 'Prompt engineering'
  | 'Dataset bias' | 'Proxy variables' | 'Algorithmic discrimination'
  | 'Hallucination' | 'Verification' | 'Human oversight';   // = the 12 module tags, in module order
export interface Mistake {
  itemId: string;        // ^[A-Za-z0-9._-]{1,40}$ — scheme per game below
  answer: string;        // ^[a-z_]{1,24}$ — the learner's choice, closed vocabulary per game
  correct: string;       // same vocabulary; the right choice
  concept: Concept;      // = conceptOf(gameId, itemId)
  itemText: string;      // ≤ 160 chars, the game's own content (never learner text) — recap only
  answerLabel: string;   // on-screen label of `answer`, e.g. "NOT SPAM" — recap only
  correctLabel: string;  // on-screen label of `correct` — recap only
  explain?: boolean;     // default true; false = ASK NOVA WHY not offered
}
export interface SessionMistake extends Mistake {
  gameId: GameId;
  variationId: string;   // 'v3' or the served case file's variationId
  message: string;       // the miss message as passed (no "SHIELDED! " prefix); DEFAULT_MISS when none
  shielded: boolean;     // the shield absorbed it
  at: string;            // ISO
}
export const mistakeKey = (m: Pick<Mistake, 'itemId' | 'answer'>): string => `${m.itemId}|${m.answer}`;
// GameApi.miss becomes:
miss(message?: string, mistake?: Mistake): void;
```
**Frame recording** (`screens/GameScreen.tsx`): on `miss(message, mistake)` the frame
applies `applyMiss` as today. Only if that returns a line (the miss was accepted) **and** a
`mistake` was passed, it appends a `SessionMistake` to this run's list (`shielded` = the
shield state before the miss; `variationId` = `file.kind === 'variation' ? file.variationId : 'v3'`),
calls `rememberMistake(record)` and makes it the "latest mistake" for the ask chip, tagged
with the bubble version the miss produced. X-RAY/FOCUS never call `miss`, so auto-solves
are never mistakes. REWIND does not remove records. After `winGame(...)` the frame calls
`onGameWon(gameId, rewards.stars)`. `restart()` clears the list, the latest mistake and the
run's explanations.

**`web/src/content/concepts.ts`**: `CONCEPTS: readonly Concept[]` (module order, the 12
tags), `conceptOf(gameId, itemId): Concept` (rules in the table below; a unit test asserts
`CONCEPTS` equals the union of `content/modules.ts` tags), and
`CONCEPTS_BY_GAME: Record<GameId, readonly Concept[]>`
(m1g1 `[Training data, Generalization]`, m1g2 `[Machine learning]`, m2g1
`[Weights and thresholds, Classification]`, m2g2 `[Prompt engineering]`, m3g1
`[Proxy variables]`, m3g2 `[Algorithmic discrimination]`, m4g1
`[Hallucination, Verification]`, m4g2 `[Verification]`, m4g3 `[Human oversight]`).

**`web/src/testing/testGameApi.ts`**: `calls.miss` is unchanged (`(string|undefined)[]`).
New `calls.mistakes: (Mistake | undefined)[]` runs parallel to `calls.miss`, and
`readonly recorded: { mistake: Mistake; shielded: boolean }[]` holds the accepted misses
that carried a payload (same rule as the frame).

**`web/src/contracts/api.ts` + `web/src/api/client.ts`**:
```ts
export interface ExplainRequest { gameId: GameId; variationId: string; itemId: string; answer: string }
export interface ExplainData { text: string; tip: string; cached: boolean; provider: ProviderName }
export const EXPLAIN_TIMEOUT_MS = 8000;
// client.ts: explainMistake(req: ExplainRequest, opts?: RequestOptions): Promise<ApiResult<ExplainData>>  — POST /v1/explain, never throws
// + isExplainData guard
```

**`web/src/contracts/state.ts` + `state/migrate.ts` + `state/store.ts`**:
`STATE_VERSION = 3`, `MISTAKES_MAX = 200`,
`MistakeRecord = Pick<SessionMistake, 'gameId'|'variationId'|'itemId'|'answer'|'concept'|'shielded'|'at'>`,
`PersistedStateV3 extends Omit<PersistedStateV2,'version'> { version: 3; mistakes: MistakeRecord[] }`
(`PersistedState = PersistedStateV3`), `migrateV2toV3`, `cleanMistakes` in sanitize
(`spec/data.md` → v3), `resetProgress()` sets `mistakes: []`. No new store action:
`features/memory` writes through `patch`.

**Mount points**: placeholder files that P3-C creates with their final signatures and
wires into the screens. W1/W2 replace the bodies and never edit the screens:
```ts
// features/tutor/AskNovaWhy.tsx   (placeholder: disabled chip, testID "ask-nova-why")
export interface Explanation { text: string; tip: string }
export interface AskNovaWhyProps { mistake: SessionMistake; chipVisible: boolean; onExplained(key: string, e: Explanation): void }
export function AskNovaWhy(p: AskNovaWhyProps): React.JSX.Element | null;
export const ASK_WINDOW_MS = 10_000;   // exported from features/tutor/copy.ts (P3-C creates it)
//   GameScreen mounts it under the bubble (where ask-nova-why-stub was) for the latest
//   mistake whose explain !== false (key = that mistake's index; unmounted on restart).
//   chipVisible = bubble.v === latest.bubbleV && now − latest.at < ASK_WINDOW_MS (the frame
//   runs a timer to flip it). Not opened + !chipVisible → renders null. Once tapped, the
//   panel stays open regardless of chipVisible until CLOSE or the next mistake (re-key).
// features/recap/MistakeRecap.tsx (placeholder: <View testID="recap"/>)
export interface MistakeRecapProps { mistakes: readonly SessionMistake[]; explanations: Readonly<Record<string, Explanation>> }
//   rendered in WinView (replacing win-soon-strip) and FailView (above the buttons).
// features/memory/index.ts        (placeholder: no-op bodies)
export function rememberMistake(m: SessionMistake, now?: Date): void;
export function onGameWon(gameId: GameId, stars: 1 | 2 | 3): void;
// features/memory/ReviewPanel.tsx (placeholder: returns null)
export function ReviewPanel(): React.JSX.Element | null;   // HomeScreen renders it directly under home-energy
```
**API mount point**: `api/src/glitch_api/routes/explain.py` stub (`POST /v1/explain` →
`AI_UNAVAILABLE` envelope with energy), mounted in `main.py` by P3-C. P3-D1 replaces it.

**Per-game mistake table** (P3-G emits these; P3-D1's extractor derives the same items,
correct answers and canned messages server-side). "Index" = 0-based position in v3 /
variation order (the same as `pick-line-<index>`). The canned message is the `message`
the game passes to `miss`.

| Game | Mistake event (call site) | `itemId` | `answer` vocabulary → `answerLabel` | `correct` (derivation) → `correctLabel` | Concept | Canned (server) | Ask? |
|---|---|---|---|---|---|---|---|
| m1g1 | wrong drop, step 1 (SortBoard) | `e1`–`e6` | `spam`,`ok` → zone label | item zone (`label` s→`spam`, n→`ok`) | Training data | `copy.trainWrong` | yes |
| m1g1 | wrong drop, step 2 | `t1`–`t4` | `right`,`wrong` → zone label | `modelRight ? right : wrong` | Generalization | `copy.testWrong` | yes |
| m1g2 | tap on a true line (PickList) | `s<index>` (`s0`–`s5`) | `fib` → "FIB" | `true` → "TRUE" | Machine learning | `copy.trueMiss` | yes |
| m2g1 | LOCK IT IN fails (Game) | `r1`,`r2` | `missed` (A > ga) → "<ma> OVER GOAL"; `false_alarms` → "<mbl> OVER GOAL" | `pass` → "BOTH GOALS MET" | r1 Weights and thresholds; r2 Classification | `fa` / `fb` of that round | yes |
| m2g2 | wrong drop in forge k (SortBoard) | `f<k>.b<i>` (k 1–2, i 0–7) | slot id `task`,`ctx`,`role`,`fmt`,`lim` → slot label | block slot, or `decoy` (slot null) → "NO SLOT · TOO VAGUE" | Prompt engineering | `decoy` ? `wrongDecoy` : `wrongSlot` | yes |
| m2g2 | weak free-write prompt (FreeWriteForge) | `fw.<goalId>` | `weak` → "<n>/5 LEVERS" | `strong` → "4+/5 LEVERS" | Prompt engineering | — | **no** (`explain: false`) |
| m3g1 | tap on a real line (PickList) | `l<index>` (`l2`–`l10`; `l0`/`l1` redacted) | `proxy` → "PROXY" | `real` → "OK" | Proxy variables | `copy.missMessage` | yes |
| m3g2 | RUN AUDIT fails (Game) | `audit` | `gap` → "GAP <n> · GOAL ≤ 6"; `accuracy` → "ACCURACY <n>% · GOAL ≥ 80" | `pass` → "GAP ≤ 6 · ACCURACY ≥ 80" | Algorithmic discrimination | `copy.gapFail` / `copy.accuracyFail` | yes |
| m4g1 | wrong drop (SortBoard) | `c1`–`c5` | `keep`,`cut` → zone label | `real ? keep : cut` | Hallucination | `copy.wrong` | yes |
| m4g1 | "Ask NOVA" trap (Game) | `ask` | `ask_nova` → "ASKED NOVA" | `lookup` → "CHECK THE CATALOGUE" | Verification | `copy.askMiss` | yes |
| m4g2 | wrong drop (SortBoard) | `a1`–`a6` | `trust`,`verify` → zone label | `trust ? trust : verify` | Verification | `copy.wrong` | yes |
| m4g3 | SHIP IT fails (Game) | `ship` | first failing metric id `time`,`well`,`fr`,`pv`,`help` → "<METRIC LABEL> OFF TARGET" | `all_met` → "ALL 5 TARGETS MET" | Human oversight | `notYetPrefix + failure + "."` | yes |

`itemText`: the email / sentence / resume line / block / citation / statement text; the
round title (m2g1); "THE SCREENER AUDIT" (m3g2); "SHIP THE COMPANION" (m4g3); the goal
text (free-write); "ASK NOVA TO CHECK ITS OWN SOURCES" (m4g1 `ask`). Plumbing: `SortConfig`
gains `mistake?(item, zone): Mistake | undefined`, and `SortBoard` passes it as the second
`miss` argument. `PickListProps` gains `mistakeFor?: (line: PickLine, index: number) => Mistake`.
The game logic files build the payloads (P3-G).

**Explain server modules (P3-D1)**: `explain/content.py` (load + cache the 9 JSON files),
`explain/items.py` (`items_for(game_id, data, copy, concept_rules) -> dict[item_id, ExplainItem]`,
where `ExplainItem = {item_id, concept, text, context, correct, correct_label, answers: {id: label}, canned: {answer: str}, explain: bool}`),
`explain/schemas.py` (`ExplainRequest`, `ExplainData`, the LLM JSON schema, the
validators), `explain/pipeline.py` (`spec/agent.md` → Composition 3),
`explain/fake.py`, `prompts/explain_system.md` + `prompts/explain_user.md` (placeholders
`{game_title}`, `{concept}`, `{item}`, `{context}`, `{learner_answer}`, `{correct_answer}`,
`{canned}`; the content goes inside `<case_item>` delimiters because variation text is
AI-generated data, not instructions).

## Conventions

### TypeScript (web)
- `strict: true`, `noUncheckedIndexedAccess: true`; no `any` across module boundaries.
- Files: components `PascalCase.tsx`, everything else `camelCase.ts`; one component per file.
- Game folders: `data.ts` (v3 data verbatim, typed, with a comment citing the v3 line
  range), `logic.ts` (pure scoring/validation — what the unit tests hit), `Game.tsx`
  (render + wiring only), `index.ts` (GameDefinition).
- All copy shown to learners lives in `data.ts`/`content/*` as constants, never inline in
  JSX, so tests can import the exact strings.
- Rules are pure functions taking an injected `now: Date` / seed; no `Date.now()` or
  `Math.random()` inside `engine/` or `logic.ts`. v3's seeded `rnd(i)` is used for all
  procedural art.
- Styling via `StyleSheet.create` + `theme/tokens.ts`; no hard-coded colours outside
  `tokens.ts`/`palette.ts`.
- Every interactive element: `accessibilityRole`, `accessibilityLabel`, a `testID` from
  `spec/ui.md` → Test IDs, min 44×44 touch target, visible focus ring on web.

### Python (api)
- Package `glitch_api`, `src/` layout; modules `snake_case`; pydantic models at every
  boundary; `async def` for routes and providers.
- Response envelope (always): success `{"ok": true, "data": …, "energy"?: …}`; error
  `{"ok": false, "error": {"code", "message", "retryable"}, "energy"?: …}` — raised as
  `ApiError` and rendered by one handler; unhandled exceptions → `INTERNAL` 500 envelope,
  never a stack trace.
- Singletons (`get_settings`, `get_provider`, metrics, counter store) expose `reset_*()`
  for tests.
- Prompts are files in `prompts/`, loaded once, `str.format`-style placeholders
  `{goal}` / `{prompt}`; learner text is inserted inside `<learner_prompt>` delimiters.
- Retry/backoff only at the provider boundary. Free-write: zero app-level retries (the
  7 s budget); OpenRouter `models` fallback covers provider failure. Offline tools
  (Phase 2+): 3 attempts, exponential backoff 1 s/2 s/4 s on 429/5xx.

### Logging fields (structlog JSON, stdout + optional file)
- Every request (`event="request"`): `request_id`, `method`, `route`, `status`,
  `latency_ms`, `device_hash` (or null), `outcome`.
- Every LLM call (`event="llm_call"`): `request_id`, `purpose` (`freewrite_eval`, later
  `scenario_gen`, `explain`), `provider`, `model_requested`, `model_used`, `latency_ms`,
  `prompt_tokens`, `completion_tokens`, `cache` (`none`|`hit`|`miss`), `outcome`
  (`ok`|`timeout`|`provider_error`|`invalid_output`|`moderated`), `prompt_chars` (length
  only).
- Caps (`event="cap"`): `scope` (`device`|`global`), `remaining`, `limit`.
- NEVER logged: prompt text, goal text from the client, reply text, raw device id, the key.

### Tests
- Python: `test_<unit>_<behaviour>` sentence names; Arrange/Act/Assert; frozen clock
  fixture for caps; `FakeProvider` for unit/integration; OpenRouter adapter tested with
  `httpx.MockTransport` returning recorded-shape responses (fenced JSON, bad JSON, 429,
  timeout, fallback `model` field); `live/` uses the real key and asserts structure and
  invariants, never prose.
- Live guard: when `-m live` is selected and the key is absent, a session fixture calls
  `pytest.fail("PENDING-KEY: GLITCH_OPENROUTER_API_KEY missing from .env")`.
- Web: `it('<behaviour sentence>')`; game logic tests import `data.ts` and assert v3
  numbers; component tests use `renderWithProviders` + `createTestGameApi()` (records
  `say/miss/win` calls, simulates hearts/shield exactly like the frame); fake timers for
  typing, toasts, the 350 ms sort completion delay and the 8 s timeout.
- E2E: tap-to-select paths for determinism, plus one real pointer-drag test and one
  keyboard-only game; each test uses a fresh browser context (= fresh device).
- `playwright.config.ts`: `baseURL http://127.0.0.1:8090/GLITCH/`; two `webServer`
  entries — backend `cd ../api && uv run python -m glitch_api` (env:
  `GLITCH_LLM_PROVIDER` = `GLITCH_E2E_EXPECT_PROVIDER`, `GLITCH_LOG_FILE=../web/test-results/api.log`,
  url `http://127.0.0.1:8787/healthz`) and static `node scripts/serve-export.mjs` (url
  `http://127.0.0.1:8090/GLITCH/`; requires a prior `expo export` built with
  `EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787`); `reuseExistingServer: false` so
  the provider mode is always the one under test. A global setup asserts `/healthz`
  reports the expected provider and fails with a clear message otherwise. Offline cases
  use `page.route('**/v1/freewrite/**', r => r.abort())`.

## Deploy (user-run; documented in README)

- API: `GLITCH_ENV=prod` requires `GLITCH_BLOB_BACKEND=gcs` + `GLITCH_GCS_BUCKET` (startup
  `ConfigError` otherwise — Cloud Run's disk is ephemeral, so a local backend would lose the
  counters and scenario cache on every cold start). One-time setup:
  `gcloud storage buckets create gs://$BUCKET --location us-central1 --uniform-bucket-level-access --public-access-prevention`;
  lifecycle rule deleting `caps/` objects older than 7 days
  (`gcloud storage buckets update gs://$BUCKET --lifecycle-file=<file>` with
  `{"rule":[{"action":{"type":"Delete"},"condition":{"age":7,"matchesPrefix":["caps/"]}}]}`;
  prefix `<GLITCH_BLOB_PREFIX>/caps/` when a prefix is set);
  grant the Cloud Run service account `roles/storage.objectAdmin` on the bucket
  (`gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member serviceAccount:$SA --role roles/storage.objectAdmin`);
  create the secret: `printf %s "$KEY" | gcloud secrets create glitch-openrouter-key --data-file=-`.
  Deploy: `cd api && gcloud run deploy glitch-api --source . --region us-central1 --allow-unauthenticated --max-instances 1 --set-env-vars GLITCH_ENV=prod,GLITCH_LLM_PROVIDER=openrouter,GLITCH_BLOB_BACKEND=gcs,GLITCH_GCS_BUCKET=$BUCKET,GLITCH_CORS_ORIGINS=https://smalltechorg.github.io --set-secrets GLITCH_OPENROUTER_API_KEY=glitch-openrouter-key:latest`.
  Verify: `curl -sf https://<service-url>/healthz`.
- Web: set repo variable `GLITCH_API_URL` to the Cloud Run URL, set Pages source to
  "GitHub Actions", push to `main` → `pages.yml` builds and deploys
  `https://smalltechorg.github.io/GLITCH/`. Manual equivalent:
  `cd web && EXPO_PUBLIC_GLITCH_API_URL=https://<service-url> npx expo export --platform web`
  then publish `web/dist` (including `.nojekyll`).
