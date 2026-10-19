# GLITCH — Server API

Base URL: `EXPO_PUBLIC_GLITCH_API_URL` (dev `http://127.0.0.1:8787`; prod the Cloud Run
URL). JSON only. CORS: exact origins from `GLITCH_CORS_ORIGINS`; methods `GET, POST,
OPTIONS`; allowed header `Content-Type, X-Glitch-Device`.

## Envelope (every response)
```json
{ "ok": true,  "data": { … }, "energy": { "remaining": 9, "limit": 10, "resetsAt": "2026-10-20T00:00:00Z" } }
{ "ok": false, "error": { "code": "CAP_DEVICE", "message": "…", "retryable": false }, "energy": { … } }
```
`energy` is present on `/v1/energy` and `/v1/freewrite/evaluate` responses whenever a
valid device header was sent.

| Code | HTTP | When | retryable |
|---|---|---|---|
| `BAD_REQUEST` | 400 | Invalid body, prompt empty/>600 chars, goal >200 chars | false |
| `BAD_DEVICE` | 400 | Missing or non-UUID-v4 `X-Glitch-Device` | false |
| `CAP_DEVICE` | 429 | Device has 0 energy today | false |
| `CAP_GLOBAL` | 503 | Server-wide daily budget spent | false |
| `AI_TIMEOUT` | 504 | Provider exceeded `GLITCH_LLM_TIMEOUT_S` | true |
| `AI_UNAVAILABLE` | 502 | Provider error (auth, 4xx/5xx, no model available) | true |
| `AI_INVALID_OUTPUT` | 502 | Output unparseable / failed schema | true |
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
No learner data. `cache_hit_rate` = hits / (hits + misses), 0 when both are 0 (always 0
in Phase 1 — free-write is never cached).

## Phase 2+ (contract sketch; finalised by the phase's spec update)
- `GET /v1/scenarios/{gameId}/next?seen=<comma ids>` → `data: { variationId, gameId, data, cached: bool }` or `ok:false` (fallback to v3).
- `POST /v1/explain` `{gameId, variationId, itemId, answer}` (Phase 3) → `data: { text, tip, cached }`.
- Same envelope, energy and error codes; cache hits never charge energy.
