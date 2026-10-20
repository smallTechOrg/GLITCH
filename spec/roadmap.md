# GLITCH — Roadmap

## What

GLITCH is a gamified AI-literacy game. Learners pick a pixel-art hero, watch a short
story cutscene, and play mini-games that make them *spot what AI gets wrong and make the
call*. It is being rebuilt from a single-file prototype (`spec/GLITCH v3.html`, "v3")
into a real product: one codebase that ships to the web now (static site on GitHub Pages
under `/GLITCH/`) and becomes the iOS/Android app later, plus a small server whose only
jobs are guarding the AI key, calling the AI model, filtering its output, enforcing daily
AI budgets, and (from Phase 2) owning a "generate once, cache forever" scenario cache.

v3 is the product. Every module, game, rule, number and line of copy in v3 is ported
faithfully (`spec/capabilities/v3-games.md`, `spec/capabilities/course-shell.md`,
`spec/capabilities/game-runtime.md`), with upgraded pixel-art polish, mobile-first layout
and full accessibility.

## Who

- Students aged 13–18 with little or no AI background.
- Playing alone at home or in a classroom, on phones and laptops.
- No accounts. A learner is a device: all progress lives on the device. An optional
  nickname personalises the greeting.

## Core principles

1. **v3 first, always.** The hand-authored v3 content is every learner's first
   playthrough and the always-available fallback. The game never depends on the AI to be
   playable.
2. **Zero-token architecture.** AI tokens are spent only (a) to generate a new scenario
   variation ONCE, which is then reused by every learner forever; (b) by an offline bank
   script admins run to pre-generate variations; (c) for genuinely subjective feedback
   (scoring a learner's free-written prompt). One AI call per artifact, never per item.
3. **Nothing about the learner leaves the device** except an anonymous random device ID
   used only to count daily AI actions. The server never stores learner text or learner
   data, and never logs learner text.
4. **AI failure is a game event, not an error.** NOVA "thinks" while waiting; after ~8s,
   or on any failure, the learner gets the classic v3 content / offline check with an
   in-world line ("NOVA's offline — …").

## Success criteria (product level)

- [ ] A fresh device can play all 4 modules (hero → story → every game) to "COURSE
      COMPLETE" with no network connection to the server at all (the free-write round
      falls back to the offline check).
- [ ] Every v3 game's scoring, pass thresholds, heart-loss conditions, star rules and XP
      awards match v3 exactly (invariants in `spec/capabilities/v3-games.md` and
      `spec/capabilities/game-runtime.md`), proven by automated tests.
- [ ] Every game is completable by keyboard alone, by touch alone, and with a screen
      reader (every interactive element labelled), and with reduced motion on.
- [ ] The Prompt Forge free-write round returns NOVA's real reply + a 5-lever verdict +
      one tip from a single AI call, within 8 s or falls back in-world.
- [ ] A device can make at most 10 live-AI actions per UTC day; the server-wide daily
      ceiling (500) is enforced; the learner sees both as an "AI energy" battery.
- [ ] Server logs carry route, latency, model, token counts and cache hit/miss for every
      AI request — and never the learner's text.

## Out of scope (whole roadmap unless a phase says otherwise)

- Accounts, logins, name+PIN, cross-device sync, any server-side learner record.
- Importing v3 `g9_*` saved progress (fresh start by decision).
- Input moderation of learner text (output is moderated; learner text is never stored).
- Teacher dashboards and class features (roadmap section below, not scheduled).
- Native store builds (same codebase; scheduled in the roadmap section, not a phase).

> **Assumed:** guest profile is nickname-only (optional, max 20 characters, device-local); no name+PIN, no accounts.
> **Assumed:** live-AI cap is 10 actions per device per UTC day, and a server-wide global ceiling of 500 AI calls per UTC day.
> **Assumed:** reflections are deferred to the roadmap section (not in any scheduled phase).
> **Source note:** `spec/GLITCH v0.1.docx` (problem statement, 10-module curriculum, investigator progression, review notes with dev plan of 27 Aug and 23 Sept 2026) has been read in full. It is **roadmap context only**. Phases 1–4 follow the intake brief and v3. Where the document and the brief disagree, the brief wins. The document's content is mapped in `## Beyond` below.

---

## Phases of Development

Phase order and content follow the user's intake choice: **Phase 1 = full v3 parity + one
AI feature** (the free-write round). This is larger than a typical first win by explicit
user decision; it is carved into seven disjoint slices so it builds in parallel.

Conventions used by every gate below:
- Commands are written as one line starting from the **repo root**
  (`/Users/sai/Workspace/Code/GLITCH`), using `cd <dir> && …` so the working directory is
  explicit. Backend commands run in `api/`, frontend commands in `web/`.
- Backend runner: `uv run` (Python pinned by `api/.python-version` = 3.12).
  Frontend runner: `npx`/`npm` on Node 22 (pinned by `.nvmrc` and `web/package.json`
  `engines`).
- Ports: backend **8787**, static export server **8090** (canonical test URL
  `http://127.0.0.1:8090/GLITCH/`), Expo dev server **8092** (dev only, never a gate path).
- Long-running servers are started with the terminal tool's background mechanism, never
  with `&`/`nohup`; health checks run in a follow-up call.
- **PENDING-KEY:** any gate step marked `[live]` needs `GLITCH_OPENROUTER_API_KEY` in the
  root `.env`. Until the user adds it, that step's status is reported as PENDING-KEY
  (never "passed"); every other step must be green without a key. `uv run pytest -m live`
  fails loudly (not skips) when the key is missing.
- **PENDING-CREDS:** steps marked `[gcs]` (Phase 2+) need `GLITCH_GCS_BUCKET` and
  Google application-default credentials; same reporting rule.

### Scaffold Gate — before any feature slice

**Goal:** the minimal runnable skeleton of `spec/architecture.md` → `## Layout`, including
every **frozen Phase-1 contract** (`## Contracts` there) so all Phase 1 slices can build in
parallel without touching each other's files.

**Scaffold delivers (owns these paths for the rest of Phase 1 — slices must not edit them):**
- Root: `README.md`, `.env.example`, `.gitignore`, `.nvmrc`, `.github/workflows/pages.yml`.
- `api/`: `pyproject.toml` (all Phase 1 deps + pytest markers `live`, `gcs`, default
  `-m "not live and not gcs"`), `uv.lock`, `.python-version`, `Dockerfile`,
  `.dockerignore`, `src/glitch_api/{__init__,__main__,main,config,logging,envelope,metrics,device}.py`,
  `routes/health.py`, `routes/metrics.py`, stub `routes/energy.py` + `routes/freewrite.py`
  (mounted by `main.py`; return an `AI_UNAVAILABLE` envelope until slice D replaces them),
  `llm/base.py` (provider protocol + DTOs),
  `tools/check_model.py` (one minimal real OpenRouter call via plain HTTP),
  `tests/conftest.py`, `tests/unit/test_health.py`.
- `web/`: `package.json` + `package-lock.json` (ALL Phase 1 dependencies installed —
  slices never add deps), `app.config.ts`, `tsconfig.json`, `babel.config.js`,
  `jest.config.js`, `playwright.config.ts`, `public/.nojekyll`, `assets/`,
  `scripts/serve-export.mjs`, `scripts/check-export.mjs`, every route file in `app/`,
  `src/contracts/**`, `src/theme/**`, `src/pixel/**`, `src/art/{icons.ts,Icon.tsx,Sprite.tsx,Scene.tsx}`,
  stub `src/art/{characters.ts,scenes.ts}`, `src/content/{modules.ts,heroes.ts}`,
  `src/state/{store.ts,migrate.ts,deviceId.ts}`, `src/dnd/**`, `src/ui/**`, `src/a11y/**`,
  `src/api/**`, `src/games/registry.ts`, stub `src/games/<id>/index.ts` ×9,
  stub `src/features/freewrite/FreeWriteRound.tsx`, placeholder `src/screens/**`,
  `src/testing/**`, `tests/unit/smoke.test.ts`, `e2e/smoke.spec.ts`, `e2e/helpers/**`.

**Gate (all must pass):**
1. Install: `cd api && uv sync` then `cd web && npm ci` (first scaffold run uses
   `npm install` to create and commit the lockfile).
2. Backend boots on its documented command (background): `cd api && uv run python -m glitch_api`
   then `curl -sf http://127.0.0.1:8787/healthz` prints `{"ok":true,"data":{"status":"ok",…}}`.
3. Web export builds and serves styled: `cd web && npx expo export --platform web && node scripts/check-export.mjs`
   (asserts `dist/index.html` exists and contains `GLITCH`, `dist/.nojekyll` exists, every
   referenced JS asset under `/GLITCH/_expo/` exists and is non-empty, the Press Start 2P
   font file is in `dist/`), then (background) `cd web && node scripts/serve-export.mjs`
   and `curl -sf http://127.0.0.1:8090/GLITCH/ | grep -q GLITCH`. Stop both background
   servers before step 4 (Playwright starts its own on the same ports).
4. Test harnesses green: `cd api && uv run pytest -q` ; `cd web && npx tsc --noEmit && npx jest --ci` ;
   `cd web && npx playwright install chromium && npx playwright test e2e/smoke.spec.ts`
   (the smoke loads `http://127.0.0.1:8090/GLITCH/`, sees the GLITCH title, the pixel
   font is applied, and `GET /healthz` on 8787 succeeds from the page origin — proving CORS).
5. No database in this product (state on device; server stateless) — migration step N/A.
6. `.env.example` documents every env var in `spec/architecture.md` → `## Configuration`.
   `[live]` key + model check: `cd api && uv run python -m glitch_api.tools.check_model`
   prints `MODEL OK google/gemini-2.5-flash-lite` (or the configured slug) — PENDING-KEY
   until the key exists.
7. First commit pushed, PR open (root session, per `rules/git.md`).

### Phase 1 — Full v3 parity + the first AI win (free-write Prompt Forge)

**Goal (the one user-testable increment):** on a phone or laptop, a new learner sets an
optional nickname, plays all 4 modules of v3 end-to-end in the upgraded pixel-art app —
heroes and powers, hearts, stars, XP, levels, streak, badges, cutscenes — and in Prompt
Forge writes their own prompt and gets NOVA's real reply, a 5-lever verdict and one tip
from the live AI (or an in-world offline check when the AI is unavailable or the energy
is spent). Progress survives reload.

**Capabilities:** `course-shell`, `game-runtime`, `v3-games`, `freewrite-forge`
(see `spec/capabilities/index.md`).

**Real vs stub in Phase 1:**
- REAL: everything in the four capabilities above, the backend free-write endpoint,
  energy endpoint, caps, moderation, logs, metrics.
- LABELLED STUBS (disabled, tagged "SOON", with an accessible hint "Coming in a future
  update"): "ASK NOVA WHY" chip under a bad-mood speech bubble (Phase 3); a "COMING SOON"
  strip on the win screen listing "Fresh case files on replay" and "Mistake recap"
  (Phases 2–3). Nothing else is stubbed.

**Independent slices (all depend ONLY on the scaffold; no slice edits another's paths or
any scaffold-owned path):**

| Slice | Owns (paths) | Delivers |
|---|---|---|
| **A1 · Shell & rules** | `web/src/screens/**` (replaces placeholders), `web/src/engine/**`, `web/src/state/actions.ts`, `web/src/content/{story.ts,badges.ts}`, `web/tests/engine/**`, `web/tests/screens/**`, `web/e2e/shell.spec.ts` | Welcome/nickname, Home (quest box, module path, steps, badges), top bar, toasts, Hero Select, Storytime cutscene player, Game Frame (hearts, powers, shield, say bubble, miss/win/fail, win screen, Phase-1 stubs), Module Complete, Settings (nickname, readable font, reset), screen wipe; XP/levels/streak/badges/once-bonuses/progression rules; daily XP. |
| **A2 · Pixel art library** | `web/src/art/characters.ts`, `web/src/art/scenes.ts`, `web/src/art/ambient.ts`, `web/tests/art/**` | Faithful ports of `drawChar`/`drawNova`/`SC.*` onto the scaffold framebuffer API, plus the fidelity upgrade (idle/blink/talk/think frames, ambient scene frames) per `spec/ui.md` → Pixel art. |
| **B1 · Module 1 games** | `web/src/games/m1g1/**`, `web/src/games/m1g2/**`, `web/tests/games/m1g1/**`, `web/tests/games/m1g2/**`, `web/e2e/module1.spec.ts` | Train the Model, Fact or Fib. |
| **B2 · Module 2 block games** | `web/src/games/m2g1/**`, `web/src/games/m2g2/**`, `web/tests/games/m2g1/**`, `web/tests/games/m2g2/**`, `web/e2e/module2.spec.ts` | Tune the Sorter; Prompt Forge forges 1–2 (blocks) and the hand-off to the free-write round component (imported from its scaffold path). |
| **C1 · Module 3 games** | `web/src/games/m3g1/**`, `web/src/games/m3g2/**`, `web/tests/games/m3g1/**`, `web/tests/games/m3g2/**`, `web/e2e/module3.spec.ts` | Proxy Hunt, Fairness Lab. |
| **C2 · Module 4 games** | `web/src/games/m4g1/**`, `web/src/games/m4g2/**`, `web/src/games/m4g3/**`, `web/tests/games/m4g*/**`, `web/e2e/module4.spec.ts` | Source Detective, Confidence Court, Design the Companion. |
| **D · Backend free-write** | `api/src/glitch_api/{routes/freewrite.py,routes/energy.py,llm/openrouter.py,llm/fake.py,llm/factory.py,agent/**,prompts/**,schemas/**,heuristics/**,moderation/**,caps/**,tools/check_logs.py}`, `api/tests/unit/**` (except `test_health.py`), `api/tests/integration/**`, `api/tests/live/**` | Provider layer (fake + OpenRouter with model fallbacks, 7 s timeout, bounded tokens, JSON-schema validation), freewrite agent pipeline, output moderation, device + global caps, energy endpoint, structured LLM logs + metrics counters, log checker tool. |
| **E · Free-write frontend** | `web/src/features/freewrite/**` (replaces the stub), `web/tests/features/freewrite/**`, `web/e2e/freewrite.spec.ts`, `web/e2e/journey.spec.ts` | Goal bank, prompt editor, NOVA thinking animation, energy meter wiring, 8 s timeout → in-world offline check, lever verdict + reply + tip display, prompt history on device, hero powers for the round, demo-provider tag; the full primary-journey E2E. |

**True dependencies (declared):**
- A1, A2, B1, B2, C1, C2, D, E → scaffold contracts only. They build and pass their own
  unit/component tests concurrently.
- The **E2E specs** written by A1/B1/B2/C1/C2/E run only at the Phase 1 gate, after all
  slices land (they need the Game Frame from A1, the art from A2 and the games). Slices
  author them against the testIDs fixed in `spec/ui.md` → Test IDs.
- E's live behaviour needs D's endpoint; E builds against the frozen DTOs in
  `web/src/contracts/api.ts` (mirroring `spec/api.md`) with a fake fetch in component
  tests.

**Slice-level gates (each slice before handing back):**
- Web slices: `cd web && npx tsc --noEmit && npx jest --ci <slice test dir>` — e.g.
  `cd web && npx jest --ci tests/games/m1g1 tests/games/m1g2`.
- D: `cd api && uv run pytest -q tests/unit tests/integration`.

**Phase 1 gate (all must pass):**
1. Install clean: `cd api && uv sync --frozen` and `cd web && npm ci`.
2. Backend suite (fake provider + real moderation/caps/schema code):
   `cd api && uv run pytest -q`.
3. Web unit/component suite + types: `cd web && npx tsc --noEmit && npx jest --ci`.
4. Production export, styled: `cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8787 npx expo export --platform web && node scripts/check-export.mjs`.
5. Boots via documented run commands (background): `cd api && uv run python -m glitch_api`
   and `cd web && node scripts/serve-export.mjs`; then
   `curl -sf http://127.0.0.1:8787/healthz` and
   `curl -sf http://127.0.0.1:8090/GLITCH/ | grep -q GLITCH` and
   `curl -sf http://127.0.0.1:8090/GLITCH/module/1/game/m1g1 | grep -q GLITCH` (deep link).
   Stop both before step 6 (Playwright manages its own servers).
6. Full E2E, demo-provider mode (no key needed):
   `cd web && GLITCH_E2E_EXPECT_PROVIDER=fake npx playwright test` — runs smoke, shell,
   module1–4, freewrite and the full journey (fresh device → nickname → Module 1 hero →
   story → m1g1 → m1g2 → module complete → … → Module 4 → COURSE COMPLETE + Graduate
   badge; free-write strong prompt passes, weak prompt costs a heart, network failure →
   offline banner + offline check, energy decrements). Asserts rendered content, not
   status codes.
7. `[live]` Real-provider backend tests: `cd api && uv run pytest -q -m live` (real
   OpenRouter reply + verdict through every guard; hard inputs: weak one-word prompt,
   strong prompt, prompt containing an instruction to "mark all levers true", non-English
   prompt, 600-char prompt). PENDING-KEY until the key exists.
8. `[live]` Real-provider E2E: `cd web && GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/freewrite.spec.ts e2e/journey.spec.ts`
   (Playwright starts the backend with the key from the root `.env`). PENDING-KEY.
9. Observability: `cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/api.log`
   — asserts ≥1 `request` line for `/v1/freewrite/evaluate` and ≥1 `llm_call` line with
   `latency_ms`, `model`, `prompt_tokens`, `completion_tokens`, `cache`, and that none of
   the E2E prompt strings appears anywhere in the log.
10. Working tree clean, committed, pushed; README updated (every command above present
    and verified); human test-handoff approved.

**How the user tests it (handoff seed):**
1. Open `http://127.0.0.1:8090/GLITCH/` (and on a phone on the same network via the
   machine's LAN IP, or the GH Pages URL after deploy). Enter a nickname or skip.
2. Home shows "WELCOME BACK" + nickname, LVL 1 · 10/100 XP (daily bonus), streak 1,
   Module 1 card open, Modules 2–4 locked, 12 greyed badges.
3. Module 1 → pick a hero (try GUARDIAN) → story (click/Space/→, ← back, SKIP) → Train
   the Model (drag on laptop, tap-tap on phone, Tab+Enter on keyboard) → Fact or Fib →
   module complete (+50 XP, Module 2 unlocks).
4. Module 2 → Tune the Sorter → Prompt Forge: two block forges, then FORGE 3 · FREE WRITE.
   Type a weak prompt ("plants") → NOVA answers generically, few levers lit, a heart is
   lost, energy drops 10→9. Type a strong prompt (role + task + context + format +
   limit) → ≥4/5 levers, LEVEL CLEAR.
5. Turn Wi-Fi off (or stop the backend) and send a prompt → NOVA thinks, then "NOVA'S
   OFFLINE" banner and the offline checklist scores you.
6. Finish Modules 3–4. Reload the page at any point — progress persists.
7. Labelled stubs to expect (not bugs): "ASK NOVA WHY · SOON" after a mistake, "COMING
   SOON" strip on the win screen.
8. Known v3 parity quirk to judge: Tune the Sorter's starting sliders already meet both
   rounds' goals (see `spec/capabilities/v3-games.md` → m2g1). Tell us if you want the
   start positions changed.

### Phase 2 — Fresh case files: scenario variations + bank + durable AI budget

**Goal:** replaying a content game (Train the Model, Fact or Fib, Proxy Hunt, Source
Detective, Confidence Court) serves a new, never-seen-on-this-device AI-generated
scenario that was generated once and cached for everyone; admins can pre-fill the cache
offline; AI budgets survive server restarts.

**Capabilities:** `scenario-variations`, `variation-bank`, `durable-ai-budget`.

**Independent slices:**
| Slice | Owns | Depends on |
|---|---|---|
| **P2-D1 · Blob store + scenario service** | `api/src/glitch_api/store/**`, `api/src/glitch_api/scenarios/**` (schemas, validators, generator prompts in `prompts/scenarios/`), `api/src/glitch_api/routes/scenarios.py`, `api/tests/**/scenarios*` | none |
| **P2-D2 · Durable caps** | `api/src/glitch_api/caps/blob_store.py`, `api/tests/**/caps_blob*` | P2-D1's `store/base.py` protocol — **declared dependency**: D1 lands `store/base.py` + `store/local.py` first (half-day), then D2 starts |
| **P2-D3 · Bank script** | `api/src/glitch_api/tools/build_bank.py`, `api/tests/**/build_bank*` | P2-D1 (uses the scenario service) — **declared dependency** |
| **P2-W1 · Variation client** | `web/src/features/variations/**`, state migration v1→v2 (`seenScenarios`) in `web/src/state/migrate.ts`, game data-source seam in the 5 content games' `data.ts` loaders, `web/e2e/variations.spec.ts` | API contract in `spec/api.md` only |

**Gate:**
1. `cd api && uv run pytest -q` and `cd web && npx tsc --noEmit && npx jest --ci`.
2. `[live]` `cd api && uv run pytest -q -m live` — generates one real variation per content
   game through schema → domain validation → moderation → store, and re-requests it from
   cache (assert second call is a cache hit and costs no energy).
3. `[gcs]` `cd api && uv run pytest -q -m gcs` — real bucket round-trip for scenario store
   and counters (create/read/list/conditional-write conflict), under a unique test prefix
   removed on teardown.
4. `[live][gcs]` `cd api && uv run python -m glitch_api.tools.build_bank --game m1g2 --count 3 --backend gcs`
   then `--count 3` again prints `0 generated, 3 already present`.
5. `[live]` `cd web && GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/variations.spec.ts`.
6. Observability: `cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/api.log --route "/v1/scenarios/{game_id}/next"`
   (on a side-port run: `../web/test-results/<port>/api.log`) — for the scenarios route it
   requires ≥1 `llm_call` line with cache `hit` and ≥1 with cache `miss` belonging to that
   route's requests (`--require-cache-hit-and-miss`, automatic for this route) — and
   `/v1/metrics` reports a `cache_hit_rate` between 0 and 1.

**How the user tests it:** clear Module 1, replay Fact or Fib → six new sentences (three
fibs) with a "NEW CASE FILE" tag; replay again → a different one; restart the backend →
energy count is unchanged.

### Phase 3 — Tutor NOVA: ask why, recap, mistake memory

**Goal:** after a mistake a learner can ask NOVA why (explanations cached globally so the
same question costs tokens once), sees a short recap of their mistakes at the end of each
game, and the home screen remembers which ideas they struggle with.

**Capabilities:** `ask-nova-why`, `mistake-recap`, `mistake-memory`. The frozen design
is in `spec/architecture.md` → Contracts → Phase 3 (Mistake payload, frame recording,
per-game mistake table, mount points), `spec/api.md` → `POST /v1/explain`,
`spec/data.md` → v3 state and v3 content JSON, and `spec/ui.md` → Tutor NOVA.

**Real vs stub:** everything is REAL. Both remaining stubs (`ask-nova-why-stub`,
`win-soon-strip`) are removed.

**Slices.** P3-C is serial and lands first. Then the four others run in parallel, each
depending ONLY on P3-C. No slice edits another slice's paths, and none of the four edits
P3-C's paths.

| Slice | Owns (paths) | Delivers |
|---|---|---|
| **P3-C · Contract (serial, first)** | `web/src/contracts/{game,api,state}.ts`, `web/src/api/client.ts`, `web/src/state/{migrate,store}.ts`, `web/src/testing/testGameApi.ts`, `web/src/content/concepts.ts`, `web/src/engine/session.ts` (only if needed), `web/src/screens/GameScreen.tsx`, `web/src/screens/HomeScreen.tsx`, `web/src/screens/copy.ts`, placeholder `web/src/features/tutor/{AskNovaWhy.tsx,copy.ts}` (copy exports `ASK_WINDOW_MS`), `web/src/features/recap/MistakeRecap.tsx`, `web/src/features/memory/{index.ts,ReviewPanel.tsx}`, `api/src/glitch_api/routes/explain.py` (stub), `api/src/glitch_api/main.py` (mount); tests `web/tests/unit/{concepts,testGameApi,migrate*,client*}.test.ts`, `web/tests/screens/**`, `web/tests/features/variations/replay.test.tsx`, `web/tests/unit/ui.test.tsx`, `web/e2e/variations.spec.ts` (stub asserts updated) | `Concept`/`Mistake`/`SessionMistake`/`mistakeKey`; `miss(message?, mistake?)`; frame recording + ask-chip window + recap/REVIEW mounting; `testGameApi` `calls.mistakes`/`recorded`; `ExplainRequest`/`ExplainData`/`explainMistake`; state v3 + `migrateV2toV3` + sanitize + reset; `CONCEPTS`, `conceptOf`, `CONCEPTS_BY_GAME`; explain route stub. Frame tests use a fake game that calls `miss(msg, mistake)` (recorded, shielded flag, ignored-when-over, no payload → not recorded, restart clears). |
| **P3-D1 · Explain endpoint + cache + v3 content** | `api/src/glitch_api/explain/**`, `api/src/glitch_api/content/**` (the 9 v3 JSON files), `api/src/glitch_api/routes/explain.py` (replaces the stub), `api/src/glitch_api/prompts/explain_{system,user}.md`, `api/src/glitch_api/tools/check_logs.py` (explain route → hit+miss required), `api/tests/**/*explain*`, `web/tests/contracts/explainContent.test.ts` | Endpoint per `spec/api.md`: validation, server-side item resolution (v3 JSON + `ScenarioRepository.get`), cache in `explanations[-demo]/…`, single flight, reserve/refund energy, one bounded call, schema + moderation, fake output, logs/metrics without item/answer; content parity test; `tests/live/test_explain_live.py` (exactly 2 provider calls). |
| **P3-G · Games emit mistakes** | `web/src/games/**` (logic/data/Game, never `index.ts` contracts), `web/src/dnd/{sortEngine.ts,SortBoard.tsx,pickEngine.ts,PickList.tsx}`, `web/src/features/freewrite/FreeWriteForge.tsx`, `web/tests/games/**`, `web/tests/unit/{SortBoard,PickList}.test.tsx`, `web/tests/features/freewrite/FreeWriteForge.test.tsx`, `web/tests/features/variations/games.test.tsx` | Every row of the per-game mistake table, for v3 and for variations (ids by position). New label copy goes in each game's `data.ts`. Tests assert `api.recorded` for each event (itemId, answer, correct, concept, labels), and that X-RAY/FOCUS record nothing. |
| **P3-W1 · Ask NOVA why UI** | `web/src/features/tutor/**` (replaces the placeholder), `web/tests/features/tutor/**`, `web/e2e/tutor.spec.ts` | Chip → thinking → panel (text, tip, cost, demo tag) / offline / no-energy lines; 8 s timeout; per-page memo; `onExplained`; a11y announcements. `tutor.spec.ts`: demo-mode tests are skipped unless the expected provider is `fake`; one test tagged `@live` is skipped unless it is `openrouter`. |
| **P3-W2 · Recap + memory + REVIEW** | `web/src/features/recap/**`, `web/src/features/memory/**` (replace the placeholders), `web/tests/features/{recap,memory}/**`, `web/e2e/recap.spec.ts` | Recap rules (dedupe, ×n, max 5, +n more, SHIELDED, explanation-or-canned, clean run); `rememberMistake` (prepend, cap 200, via `patch`); `onGameWon` 3-star mastery removal; tallies/ranking; ReviewPanel with replay buttons. |

**True dependencies (declared):** P3-D1, P3-G, P3-W1 and P3-W2 → P3-C only. The E2E specs
(`tutor.spec.ts`, `recap.spec.ts`) run only at the phase gate, after all slices land,
because they need the real game payloads from P3-G and the endpoint from P3-D1. W1 builds
against the `ExplainData` DTO with a fake fetch, and W2 builds against `SessionMistake`
fixtures.

**Slice-level gates:**
- P3-C: `cd web && npx tsc --noEmit && npx jest --ci` and `cd api && uv run pytest -q` (the
  whole suite, because the contract touches every consumer).
- P3-D1: `cd api && uv run pytest -q` and `cd web && npx jest --ci tests/contracts`.
- P3-G: `cd web && npx tsc --noEmit && npx jest --ci tests/games tests/unit/SortBoard.test.tsx tests/unit/PickList.test.tsx tests/features/freewrite tests/features/variations`.
- P3-W1: `cd web && npx tsc --noEmit && npx jest --ci tests/features/tutor`.
- P3-W2: `cd web && npx tsc --noEmit && npx jest --ci tests/features/recap tests/features/memory`.

**Phase 3 gate.** The E2E runs on side ports **8798 (API) / 8097 (web)** with the
`dist-e2e` export, so a dev server on 8787/8090 and its `web/dist` + `api/.cache` are left
untouched. Side-port runs use the scratch blob cache `web/test-results/8798/blob-cache`,
and the live pytest run uses its own temporary cache. **Live budget: ≤ 4 explain provider
calls in the whole gate** (step 5: 2, step 7: 1, and 1 spare for a flaky retry; no other
live suites run in this gate).
1. Install clean: `cd api && uv sync --frozen` and `cd web && npm ci`.
2. `cd api && uv run pytest -q` (fake provider; it includes the content parity load test,
   the cache hit/miss + single-flight + refund tests, and `BAD_REQUEST` with no charge).
3. `cd web && npx tsc --noEmit && npx jest --ci` (includes `tests/contracts/explainContent.test.ts`).
4. Export for the side ports:
   `cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8798 npx expo export --platform web --output-dir dist-e2e`.
5. `[live]` `cd api && uv run pytest -q -m live tests/live/test_explain_live.py`. Real
   explanations for an m1g2 v3 mistake (`s0`/`fib`) and the m4g3 `ship`/`well` mistake are
   generated, word-limited, moderated and stored, and the repeat ask of each is
   `cached: true` with energy unchanged. Exactly 2 provider calls. PENDING-KEY until the
   key exists.
6. Demo-mode E2E (all specs, no key):
   `cd web && GLITCH_WEB_DIST=dist-e2e GLITCH_E2E_API_PORT=8798 GLITCH_WEB_PORT=8097 GLITCH_E2E_EXPECT_PROVIDER=fake npx playwright test`.
   - `tutor.spec`: a wrong tap in Fact or Fib → chip → panel with the deterministic demo
     text containing the canned message, plus the DEMO tag. A second fresh context asks the
     same → "FREE · NOVA ALREADY KNEW THIS" and the same energy. `/v1/explain` aborted →
     offline line + canned message. The chip is gone after 10 s.
   - `recap.spec`: three wrong drops in Train the Model with no shield → out of hearts →
     the fail-screen recap with three rows and the right zone labels (a win screen with
     three wrong drops needs GUARDIAN's shield to absorb one). Two missed proxies (one
     SHIELDED) + a 2-star Proxy Hunt win → Home REVIEW "Proxy variables · 2 misses" →
     reload → still there → "Replay Proxy Hunt" → 3-star clear → the row is gone. Both
     tests run with `/v1/**` aborted (the recap and REVIEW are device-only — zero-token
     proof: no `/v1/explain` request is attempted). The clean-run line
     ("No mistakes. Clean run!") is covered by the recap Jest tests.
7. `[live]` `cd web && GLITCH_WEB_DIST=dist-e2e GLITCH_E2E_API_PORT=8798 GLITCH_WEB_PORT=8097 GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/tutor.spec.ts --grep @live`
   (one real explanation, ≤ 60 words, and a second context gets a cache hit: 1 provider call).
   PENDING-KEY.
8. `[gcs]` `cd api && uv run pytest -q -m gcs` (adds an explanation round trip under the
   unique test prefix). PENDING-CREDS.
9. Observability:
   `cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/8798/api.log --route /v1/explain`
   requires ≥ 1 `llm_call` with `purpose: "explain"` and cache `hit`, ≥ 1 with cache `miss`,
   and no item id / answer / variation id field in any explain line.
   `/v1/metrics` `cache_hit_rate` is between 0 and 1.
10. Working tree clean, committed, pushed; README updated (the commands above); human
    test-handoff approved.

**How the user tests it (handoff seed):**
1. Open `http://127.0.0.1:8090/GLITCH/` against a backend with the key (or demo mode).
2. Fact or Fib: tap a TRUE line. NOVA's bad-mood bubble shows "ASK NOVA WHY". Tap it →
   NOVA thinks → an explanation of at most 60 words + "TIP: …" + "−1 AI ENERGY". The Home
   energy drops by 1.
3. In a second browser (or after a reload), make the same mistake and ask again →
   "FREE · NOVA ALREADY KNEW THIS", and the energy does not change.
4. Wait 10 s after a mistake without tapping → the chip disappears. The free-write weak
   prompt never shows the chip.
5. Finish the game → MISTAKE RECAP lists each mistake with "YOU SAID / IT WAS" and NOVA's
   explanation (or the classic hint). Use GUARDIAN's SHIELD in Train the Model, then make
   a wrong drop → that row is tagged SHIELDED. A clean run says "No mistakes. Clean run!".
   Lose all hearts → the recap shows on the Out-of-hearts screen too.
6. Home → REVIEW shows up to 3 ideas you missed, with "Replay <game>". Win that game
   with 3 stars → the idea leaves REVIEW. Reload → REVIEW persists. Reset progress → it
   is gone.
7. Stop the backend and ask → "NOVA'S OFFLINE — here's the short version: <classic hint>".
   The recap and REVIEW still work.
8. There are no labelled stubs left in the app.

### Phase 4 — Remixed forges, simulations and stories

**Goal:** replays of Prompt Forge (block tasks + goal bank), the three simulations (Tune
the Sorter, Fairness Lab, Design the Companion) and storytime cutscenes come in fresh
AI-generated variations, with every simulation programmatically proven solvable before it
is cached.

**Capabilities:** `forge-variations`, `simulation-variations`, `story-variations`.

**Independent slices:** P4-D1 forge + goal generators/validators; P4-D2 simulation
generators + solvability checkers (`api/src/glitch_api/scenarios/solvers/**`); P4-D3 story
generator; P4-W1 client wiring for forge/sim/story data sources. All depend on the Phase 2
scenario service only.

**Gate:** `cd api && uv run pytest -q` (solvability checkers proven against the v3
originals, against hand-made unsolvable fixtures, and a starts-already-solved fixture) ;
`cd web && npx tsc --noEmit && npx jest --ci` ; `[live]` `cd api && uv run pytest -q -m live` ;
`[gcs]` `cd api && uv run pytest -q -m gcs` ; `[live]` `cd web && GLITCH_E2E_EXPECT_PROVIDER=openrouter npx playwright test e2e/remix.spec.ts`.

**How the user tests it:** replay Fairness Lab → new features/weights, still solvable; use
X-RAY to see the solver's answer; replay a story → new dialogue with the same key ideas.

---

## Beyond (roadmap, not scheduled)

- **Reflections** — short end-of-module reflection prompts with NOVA feedback (deferred).
- **Teacher / class features** — class codes, anonymous class progress, teacher view.
- **Native iOS/Android builds** from the same codebase (store builds, haptics, offline
  font/asset bundling already in place).
- **PWA / offline install** for the web build.
- **AI-native games aligned with v3 modules:** *Prompt → Run → Remix* (V1 vs V2 prompt
  comparison, Module 2); *Flip to X-Ray of the AI call* (show the tokens, the prompt and
  the confidence behind a NOVA answer — Modules 1 and 4, natural fit with the X-RAY
  power).

### The 10-module curriculum (from `spec/GLITCH v0.1.docx`)

The document's teaching loop is **Situation → Interaction → Experiment → Observation →
Explanation → Reflection** (it replaces "Lesson → Quiz → Correct Answer"). Each module has
one signature activity with 6 variations. In the future these would be built on v3's
module → hero → story → games structure. "Nearest today" names the v3 game (Phase 1) that
already covers part of the same idea. It is a pointer, not a commitment.

| # | Module | Signature activity | Main skill | 6 variations (per the doc) | Nearest today |
|---|---|---|---|---|---|
| 1 | Meet the Machine | Sort the System | AI fundamentals | face recognition, spam filtering, calculator, chatbot, recommendation system, weather prediction | — |
| 2 | How AI Learns | Train the Machine | Data & training | cat vs dog, spam vs normal email, fruit, loan risk, house price, movie recommendation | Train the Model (m1g1) |
| 3 | Prediction Machine | Guess the Output | Predictions & probability | hiring, medical symptoms, email spam, image classification, credit risk, product recommendation | Tune the Sorter (m2g1) |
| 4 | Python: Talk to the Machine | Code the Behaviour | Basic Python | eligibility checker, spam detector, temperature categories, recommendation rule, scoring system, if/elif/else decision tree | — (needs an in-app code runner) |
| 5 | Prompt Lab | Prompt → Run → Remix | Generative AI | audience, context, constraints, output format, tone/style, multi-step instructions | Prompt Forge + free-write round (Phase 1), forge variations (Phase 4) |
| 6 | Inside the Black Box | Flip to X-Ray | Model mechanics | classification weights, decision boundary, token prediction, word/document similarity, recommendation embeddings, image-feature classification | X-RAY hero power |
| 7 | The Bias Files | Find the Hidden Signal | AI bias | hiring, loan approval, school admissions, image recognition, content moderation, recommendation systems | Proxy Hunt (m3g1) |
| 8 | Hallucination Lab | Break the Answer | Reliability | fake citation, wrong historical fact, fake statistic, misread scientific claim, made-up person/company, wrong maths reasoning | Fact or Fib (m1g2), Source Detective (m4g1), Confidence Court (m4g2) |
| 9 | Recommendation Detective | Trace the Recommendation | Personalization & privacy | video, music, shopping, news feed, social media, advertising | — |
| 10 | AI Decision Lab | Pull the Lever | Ethics & trade-offs | fairness vs accuracy, privacy vs personalization, safety vs freedom, false positives vs false negatives, moderation vs expression, automation vs human oversight | Fairness Lab (m3g2), Design the Companion (m4g3) |

The "6 variations per module" idea is what the "generate once, cache forever" scenario
service (Phases 2 and 4) is meant to support. Any future module would plug its variations
into that service instead of hand-authoring all six.

### Gamification ideas from the document (not scheduled)

- **Investigator ranks:** Rookie Analyst → Field Investigator → AI Detective → Systems
  Analyst → Senior Investigator → Chief Investigator. These would sit on top of v3's
  numbered levels, which Phase 1 keeps unchanged.
- **XP for experimenting** and discovering hidden clues, in addition to v3's existing XP
  awards. Phase 1 keeps v3's XP numbers exactly.
- **Skill-area badges:** AI Fundamentals, Python Builder, Model Explorer, Bias Detective,
  Fact Checker, AI Ethics. These would be added to v3's 12 badges.
- **Evidence Board:** collect clues and link Evidence → Mechanism → Diagnosis.
- **Corruption Meter:** shown only in trade-off cases, to demonstrate that optimizing one
  objective can create a new problem.

### Where the document's dev plan lands

| Dev-plan item (review notes, 27 Aug and 23 Sept 2026) | Where it lands |
|---|---|
| Convert to a mobile app (Expo) | **Scaffold Gate + Phase 1.** One Expo codebase. The web export ships now, and native store builds are listed in Beyond above. |
| Re-design the app for mobile with gamification | **Phase 1** (mobile-first pixel-art UI and the v3 game layer, per `spec/ui.md`). The document's extra gamification ideas are in the section above. |
| Set up the Expo React repo | **Scaffold Gate.** |
| Frontend development / Backend development | **Phase 1**, slices A1–E. |
| Add AI/LLM integration (e.g. Prompt Lab) | **Phase 1** free-write Prompt Forge. More AI comes in **Phases 2–4** (variations, Ask NOVA why, remixes). |
| User session persistence | **Phase 1**, with progress kept on the device and surviving reload. *Superseded by intake decision: guest-only, no accounts or name+PIN, all learner state on the device, no server-side learner data, so no server-side sessions.* |
| Integrate frontend with backend | **Phase 1 gate** (live E2E steps 6–8). |
| Testing and inviting beta users | Testing happens at every phase gate plus the human test-handoff. **Beta-user invites are Beyond** (after Phase 1 is deployed to GitHub Pages). |
| Named owners and week estimates (Smrithi, Chhavi; 1–2 weeks per item) | Not adopted. The spec plans by slice and gate, not by calendar. |
