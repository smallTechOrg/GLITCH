# GLITCH — Server API

Base URL: `EXPO_PUBLIC_GLITCH_API_URL` (dev `http://127.0.0.1:8787`; prod the Cloud Run
URL). JSON only. CORS: exact origins from `GLITCH_CORS_ORIGINS`; methods `GET, POST,
OPTIONS`; allowed header `Content-Type, X-Glitch-Device`.

## Envelope (every response)
```json
{ "ok": true,  "data": { … }, "energy": { "remaining": 9, "limit": 10, "resetsAt": "2026-10-20T00:00:00Z" } }
{ "ok": false, "error": { "code": "CAP_DEVICE", "message": "…", "retryable": false }, "energy": { … } }
```
`energy` is present on `/v1/energy`, `/v1/freewrite/evaluate`,
`/v1/scenarios/{gameId}/next` and (Phase 3) `/v1/explain` responses whenever a valid device
header was sent.

| Code | HTTP | When | retryable |
|---|---|---|---|
| `BAD_REQUEST` | 400 | Invalid body, prompt empty/>600 chars, goal >200 chars, unknown scenario game, bad `seen` list | false |
| `BAD_DEVICE` | 400 | Missing or non-UUID-v4 `X-Glitch-Device` | false |
| `CAP_DEVICE` | 429 | Device has 0 energy today | false |
| `CAP_GLOBAL` | 503 | Server-wide daily budget spent | false |
| `AI_TIMEOUT` | 504 | Provider exceeded `GLITCH_LLM_TIMEOUT_S` | true |
| `AI_UNAVAILABLE` | 502 | Provider error (auth, 4xx/5xx, no model available) | true |
| `AI_INVALID_OUTPUT` | 502 | Output unparseable / failed schema or domain validation / duplicate of a seen scenario | true |
| `MODERATED` | 502 | Output blocked by the safety filter | true |
| `INTERNAL` | 500 | Anything unexpected | true |

## `GET /healthz`
`200 {"ok":true,"data":{"status":"ok","provider":"fake"|"openrouter","model":"<slug>","env":"dev"|"prod","version":"<pkg version>"}}`.
Never touches the provider.

## `GET /v1/energy`
Header `X-Glitch-Device`. `200 {"ok":true,"data":{},"energy":{…}}`. Does not consume.

## `POST /v1/freewrite/evaluate`
Header `X-Glitch-Device`. Request:
```json
{ "goalId": "fw1", "goal": "Explain photosynthesis to a 10-year-old.", "prompt": "Act as …" }
```
Success `200`:
```json
{ "ok": true,
  "data": { "reply": "…", "levers": { "task": true, "context": true, "role": true, "format": true, "limit": false },
            "leversHit": 4, "passed": true, "tip": "…", "provider": "openrouter", "model": "google/gemini-2.5-flash-lite" },
  "energy": { "remaining": 9, "limit": 10, "resetsAt": "…" } }
```
Rules: `leversHit` = count of true; `passed` = `leversHit >= 4`; `reply` ≤ 1 200 chars;
`tip` ≤ 200 chars; `model` = the model OpenRouter actually used. Device energy is charged
only on success; the global budget is charged on every provider call. Nothing in the
request is stored or logged (only `prompt_chars`).

## `GET /v1/metrics`
`200 {"ok":true,"data":{"since":"<ISO>","requests_total":n,"llm_calls_total":n,"llm_calls_by_outcome":{"ok":n,"timeout":n,…},"prompt_tokens_total":n,"completion_tokens_total":n,"cache_hits":n,"cache_misses":n,"cache_hit_rate":0.0,"cap_rejections":{"device":n,"global":n}}}`.
No learner data. `cache_hit_rate` = hits / (hits + misses), 0 when both are 0. Free-write is never cached;
from Phase 2 every `GET /v1/scenarios/{gameId}/next` records one hit or one miss.

## `GET /v1/scenarios/{gameId}/next?seen=<comma ids>` (Phase 2)
Header `X-Glitch-Device`. `gameId` ∈ `m1g1`, `m1g2`, `m3g1`, `m4g1`, `m4g2` (else
`BAD_REQUEST`). `seen` = the device's `seenScenarios[gameId]`, comma-separated, ≤ 200 ids
of `[A-Za-z0-9_-]{1,64}`; absent/empty = none seen (else `BAD_REQUEST`).

Success `200`:
```json
{ "ok": true,
  "data": { "variationId": "m1g2-3fa9c0d1e2b4", "gameId": "m1g2", "schemaVersion": 1, "cached": true,
            "data": { "sentences": [ … ] } },
  "energy": { "remaining": 10, "limit": 10, "resetsAt": "…" } }
```
Rules:
- Serves the oldest cached variation whose id is not in `seen` (`cached: true`): no
  provider call, **no energy**. Only when none is left it generates ONE (one provider call
  for the whole scenario; one validator-fed regeneration if the first fails validation),
  then schema validation → domain validation → output moderation (blocklist, and any
  link/URL rejects the whole case file) → dedupe (content hash) → store → serve
  (`cached: false`). A generation costs 1 device energy (only when served) and 1 global
  unit per provider call.
- The returned `variationId` is never one of `seen`. Ids are content-derived:
  `<gameId>-<first 12 hex of sha256(canonical data JSON)>`; the client appends it to
  `seenScenarios[gameId]`.
- Any failure (`CAP_DEVICE`, `CAP_GLOBAL`, `AI_TIMEOUT`, `AI_UNAVAILABLE`,
  `AI_INVALID_OUTPUT` incl. a duplicate of a seen case file, `MODERATED`, `INTERNAL`) is
  `ok:false` with `energy`; the client plays the v3 case file in-world. A cache hit works
  at 0 energy.
- `seen` ids are only compared — never stored or logged. Logs: one `llm_call` line per
  provider call with `cache: "miss"`, and one `llm_call` line with `cache: "hit"` (0
  tokens, no provider call) per served cached variation; metrics `cache_hits` /
  `cache_misses`.
- Server code: `api/src/glitch_api/scenarios/schemas/<gameId>.py` (pydantic `Data` model =
  the authoritative shape below), validators, `scenarios/pipeline.py`.

### Variation `data` per game (`schemaVersion` 1) — exactly these keys, nothing else
Ids are assigned by the server by position; answer-key fields marked *derived* are
computed server-side, never taken from the model.

**`m1g1` Train the Model**
```json
{ "trainEmails": [ { "id": "e1", "text": "WIN a FREE prize!!! Click now", "label": "spam" } ],
  "testEmails":  [ { "id": "t1", "text": "Meeting moved to 3pm", "label": "not_spam",
                     "modelSays": "SPAM", "modelRight": false } ] }
```
`trainEmails` × 6 (ids `e1`–`e6`; exactly 3 `spam` + 3 `not_spam`); `testEmails` × 4 (ids
`t1`–`t4`; exactly 2 `spam` + 2 `not_spam`; `modelSays` `"SPAM"|"NOT SPAM"`;
`modelRight` *derived* = (`modelSays == "SPAM"`) == (`label == "spam"`); exactly 2
`modelRight: false`). Texts 3–60 chars, all 10 different. v3 tuple mapping:
`[id, text, label === "spam" ? "s" : "n"]`, `[id, text, modelSays, modelRight ? "r" : "w"]`.

**`m1g2` Fact or Fib**
```json
{ "sentences": [ { "text": "Machine learning finds patterns in training data.", "fib": false, "explanation": null },
                 { "text": "A model's prediction is always a proven fact.", "fib": true,
                   "explanation": "A prediction is an informed guess and it can be wrong." } ] }
```
Exactly 6 sentences (10–110 chars, all different), exactly 3 `fib: true`; a fib's
`explanation` is a string of ≤ 20 words (≤ 140 chars); a true sentence's is `null`.
v3 mapping: `[text, fib ? 1 : 0, explanation]` (explanation only on fibs).

**`m3g1` Proxy Hunt**
```json
{ "candidate": "MAYA",
  "lines": [ { "text": "NAME", "proxy": null, "note": "hid" },
             { "text": "GENDER", "proxy": null, "note": "hid" },
             { "text": "Captain, Girls' Hockey Team", "proxy": true, "note": "Stands in for gender." },
             { "text": "Skills: JavaScript, Excel", "proxy": false, "note": "A real skill." } ] }
```
`lines` × 11: always the two redacted lines first exactly as shown, then 9 generated lines
in mixed order — exactly 5 `proxy: true` and 4 `proxy: false`; text 4–50 chars (all
different), `note` ≤ 12 words (≤ 70 chars). `candidate` = her first name, upper case,
`^[A-Z][A-Z'-]{1,11}$` (for the paper tag `<CANDIDATE> · RESUME · SCREENED BY AI`; the
hidden trait is always gender, the candidate a girl/woman, so the v3 copy still fits).
v3 mapping: `[text, proxy === null ? null : proxy ? 1 : 0, note]`.

**`m4g1` Source Detective**
```json
{ "citations": [ { "id": "c1", "text": "UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.", "real": true },
                 { "id": "c2", "text": "Dr. Mia Vance (2022). 'GPT-12 Knows Your Future'. Annals of Unlikely Science.", "real": false } ] }
```
Exactly 5 (ids `c1`–`c5`), 2 or 3 `real: false`; every text matches
`Author (Year). Title. Venue.` (20–140 chars; the web's `short = text.split(" (")[0]`),
all different, all authors different. Every `real: true` text is verbatim from the
hand-checked list `REAL_CITATIONS` in `scenarios/schemas/m4g1.py`; an invented one never
matches that list nor reuses one of its authors. No URLs (so no "blog.x.biz" style clue).
v3 mapping: `[id, text, real ? 1 : 0]`.

**`m4g2` Confidence Court**
```json
{ "answers": [ { "id": "a1", "statement": "Water boils at 100°C at sea level.", "confidence": 99,
                 "evidence": "Matches 3 textbooks", "trust": true } ] }
```
Exactly 6 (ids `a1`–`a6`): 3 `trust: true` + 3 `trust: false`; `confidence` integer 50–99;
at least one TRUST with confidence < 80 and at least one VERIFY with confidence ≥ 90;
statement 8–80 chars (all different), evidence 3–60 chars. v3 mapping:
`[id, statement, confidence, evidence, trust ? 1 : 0]`.

## `POST /v1/explain` (Phase 3)
Header `X-Glitch-Device`. The body has exactly these keys (any other key → `BAD_REQUEST`):
```json
{ "gameId": "m1g2", "variationId": "v3", "itemId": "s0", "answer": "fib" }
```
| Field | Rule |
|---|---|
| `gameId` | one of the 9 `GameId`s |
| `variationId` | `"v3"`, or `^<gameId>-[0-9a-f]{12}$` naming a variation in the scenario store (only the 5 content games have variations in Phase 3) |
| `itemId` | `^[A-Za-z0-9._-]{1,40}$` and present in that content (per-game table: `spec/architecture.md` → Contracts → Phase 3) |
| `answer` | in that item's answer vocabulary and **≠** the item's correct answer |

Success `200`:
```json
{ "ok": true,
  "data": { "text": "That sentence is true: labels are the right answers attached to training examples. A fib sounds too sure or mixes up training and testing.",
            "tip": "Before you flag a line, ask: is it too absolute to be true?",
            "cached": false, "provider": "openrouter" },
  "energy": { "remaining": 9, "limit": 10, "resetsAt": "…" } }
```
Rules:
- `text`: 1–60 words (whitespace split) and ≤ 420 chars. `tip`: 1–25 words and ≤ 180 chars.
  Both are plain text: newlines are collapsed to spaces, and any URL / `www.` or a markdown
  marker (`#`, `*`, `` ` ``, `[`) is rejected (`AI_INVALID_OUTPUT`).
- Item resolution happens on the server only. `v3` items come from the bundled
  `api/src/glitch_api/content/v3/<gameId>.json` (`spec/data.md` → v3 content JSON).
  Variation items come from `ScenarioRepository.get(gameId, variationId)` in the same
  namespace the scenarios route uses (`scenarios`, or `scenarios-demo` under the fake
  provider). An unknown variation, unknown item, out-of-vocabulary answer, an answer equal
  to the correct one, or an item with `explain: false` (`fw.*`) → `BAD_REQUEST`, with no
  provider call and no energy change.
- **Cache.** The key is the four request fields. The object lives at
  `explanations/<gameId>/<variationId>/<itemId>/<answer>.json`
  (`explanations-demo/…` under the fake provider). On a hit the stored object is
  re-validated (limits + moderation) and served with `cached: true`: no provider call, **no
  energy**, nothing reserved. An invalid stored object counts as a miss and is overwritten.
- **Miss.** `reserve_device` (0 left → `CAP_DEVICE` 429), then `ensure_global` (spent →
  `CAP_GLOBAL` 503, refund), then `charge_global`. Then ONE provider call (purpose
  `explain`, `max_tokens` 200, temperature 0.3, timeout `GLITCH_LLM_TIMEOUT_S`, strict
  JSON schema `{text: string, tip: string}`, no app-level retry, no regeneration). Then
  parse → validate → moderate (`moderation/filter.py`) → store (`put`) → serve with
  `cached: false`. Any failure after reserving refunds the device unit (the global unit
  stays spent once the provider was called) and returns the error envelope with `energy`.
- **Single flight.** Concurrent requests for the same key in one process await the first
  request's result; the followers are served as hits (`cached: true`, no charge).
  Cloud Run is `--max-instances 1`.
- **Fake provider** (deterministic, `explain/fake.py`, no network):
  `text` = `"<canned> The right call here: <correct label>."` (truncated to 60 words) and
  `tip` = `"Slow down: find the clue first, then make the call."`; `provider: "fake"`.
  `<canned>` and `<correct label>` are the server-side values from the content JSON
  (rules in `spec/data.md`).
- **Logs/metrics.** One `request` line. One `llm_call` line per request, with
  `purpose: "explain"`, `game_id` and `cache` set to `hit` (0 tokens, no provider) or
  `miss`. `item_id`, `answer` and `variation_id` are **never logged**. Metrics
  `cache_hits` / `cache_misses` count explain lookups as well.
- Error codes: the existing table. `BAD_REQUEST` also covers the explain rules above.
