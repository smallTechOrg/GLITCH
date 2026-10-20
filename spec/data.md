# GLITCH — Data

There is **no database**. All learner data lives on the device. The server holds only
non-identifying counters (Phase 1 in memory; Phase 2+ in the blob cache) and, from Phase
2, shared AI-generated content. v3 `g9_*` keys are never read.

## On-device entities

### PersistedStateV1 (storage key `glitch.v1.state`, JSON)
| Field | Type | Meaning / rules |
|---|---|---|
| `version` | `1` | Bumped with a migration in `migrate.ts` whenever the shape changes. |
| `profile.nickname` | string \| null | 0–20 chars, trimmed; null → "PLAYER 1". |
| `profile.onboarded` | boolean | Welcome done. |
| `profile.createdAt` | ISO string | First launch. |
| `settings.readableFont` | boolean | Default false. |
| `xp` | integer ≥ 0 | Level = floor(xp/100)+1. |
| `streak.current` / `streak.best` | integer ≥ 0 | Daily rules in `course-shell.md`. |
| `streak.lastPlayDay` | `YYYY-MM-DD` \| null | Local date. |
| `steps` | `{ [StepId]: true }` | Done steps: `m1h`, `m1s`, `m1g1` … |
| `stars` | `{ [GameId]: 1\|2\|3 }` | Best stars. |
| `heroByModule` | `{ [ModuleId]: HeroId }` | Hero chosen per module. |
| `lastHero` | HeroId | Default `scout`. |
| `heroesPlayed` | `{ [HeroId]: true }` | Hero Collector. |
| `powersUsed` | `{ [HeroId]: true }` | Power User. |
| `badges` | `{ [BadgeId]: ISO string }` | Unlock time. |
| `onceBonuses` | `{ [key]: true }` | Keys `story<n>`, `g<gameId>` (e.g. `gm1g1`), `mod<n>`, `untouch` — same as v3. |
| `promptHistory` | `PromptHistoryEntry[]` | Newest first, max 50. |

### PromptHistoryEntry
| Field | Type |
|---|---|
| `id` | random id |
| `goalId` / `goal` | goal-bank id / text |
| `prompt` | learner text (device only) |
| `levers` | `{ task, context, role, format, limit: boolean }` |
| `leversHit` | 0–5 |
| `passed` | boolean |
| `source` | `nova` \| `demo` \| `offline` |
| `at` | ISO string |

### Device id (key `glitch.v1.device`)
Random UUID v4 created on first launch; never reset by Reset progress; sent only as the
`X-Glitch-Device` header.

### Ephemeral (never persisted)
- **GameSession**: `gameId`, `hero`, `hearts` 0–3, `lost`, `shield`, `powerUses` 0–2,
  `status` `playing|won|failed`.
- Toast queue, cutscene position, sort/pick board state, free-write draft.
- (Phase 3) Per run: `SessionMistake[]` and fetched explanations `{ [itemId|answer]: {text, tip} }`
  (Game Frame). Per page lifetime: the client explanation memo in `features/tutor`.

### Later versions
- v2 (Phase 2): `seenScenarios: { [GameId]: variationId[] }` (max 100 per game). Kept by
  Reset progress (with settings and the device id), so a reset device never re-receives a
  variation it has played.
- v3 (Phase 3): `mistakes: MistakeRecord[]`, newest first, max 200
  (`capabilities/mistake-memory.md`). The storage key stays `glitch.v1.state`.
  `migrateV2toV3` adds `mistakes: []`. `sanitizeState` drops any record that fails the
  rules below and keeps the newest 200. **Reset progress clears `mistakes`** (and still
  keeps streak, nickname, onboarded, createdAt, settings, seenScenarios).

  | MistakeRecord field | Type | Rule |
  |---|---|---|
  | `gameId` | GameId | one of the 9 |
  | `variationId` | string | `"v3"` or `^[A-Za-z0-9_-]{1,64}$` |
  | `itemId` | string | `^[A-Za-z0-9._-]{1,40}$` |
  | `answer` | string | `^[a-z_]{1,24}$` |
  | `concept` | Concept | one of the 12 `CONCEPTS` |
  | `shielded` | boolean | the shield absorbed it |
  | `at` | ISO string | when it happened |

  Concept tallies are derived from `mistakes`, never stored. Item text, labels and
  explanations are session-only and never persisted.
- v4 (Phase 4): seen ids for forges, goals, simulations, stories (same map).
Each migration is a pure function `vN → vN+1` with a unit test from a stored fixture.

## Server-side data

### Phase 1 (memory, lost on restart)
- Device counter: `(utcDay, sha256(deviceId)[:12]) → count`.
- Global counter: `utcDay → count`.
- Metrics counters (`spec/api.md` → `/v1/metrics`).

### Phase 2+ (blob cache: GCS bucket or local directory, same layout)
| Object | Contents |
|---|---|
| `caps/<YYYY-MM-DD>.json` | `{ global: n, devices: { <hash>: n } }` |
| `scenarios/<gameId>/index.json` | `{ gameId, schemaVersion, variations: [{ id, contentHash, createdAt }] }`, oldest first |
| `scenarios/<gameId>/<variationId>.json` | `{ id, gameId, schemaVersion, model, createdAt, contentHash, data }` |
| `scenarios-demo/<gameId>/…` | same layout, written only by the demo (fake) provider so demo case files are never served once the real AI is connected |
| `explanations/<gameId>/<variationId>/<itemId>/<answer>.json` (Phase 3) | `{ gameId, variationId, itemId, answer, text, tip, model, promptVersion: 1, createdAt }`. Written with `put` (an invalid object found on read is overwritten). |
| `explanations-demo/…` (Phase 3) | same layout, written only by the fake provider |
| `forges/…`, `goals/…`, `sims/<gameId>/…`, `stories/<moduleId>/…` (Phase 4) | same envelope |
Generated content contains no learner text. Objects are immutable once written (ids are
content-derived), except `index.json` and `caps/*.json`, which are written with generation
preconditions, and `explanations*/…`, which is rewritten only to replace an invalid object.

### v3 content JSON (Phase 3, bundled read-only in the API package)
The server needs the v3 items to explain a v3 mistake without the client sending text.
There is one file per game: `api/src/glitch_api/content/v3/<gameId>.json` (9 files,
shipped with the package). Each file is `{ "gameId", "data", "copy", "conceptRules" }`:
- `data` uses **exactly the variation `data` shape** of `spec/api.md` for the 5 content
  games (filled with v3 values, ids by position as in v3), so one extractor serves both
  v3 and variations. For the other 4 games:
  - `m2g1`: `{ "rounds": [ { "id": "r1", "title", "rule", "ma", "mbl", "ga", "gb", "fa", "fb" } ×2 ] }`
  - `m2g2`: `{ "forges": [ { "title", "blocks": [ { "id": "b0", "text", "slot": "task"|"ctx"|"role"|"fmt"|"lim"|null } ×8 ] } ×2 ] }`
  - `m3g2`: `{ "features": [ { "id", "name", "kind": "skill"|"proxy", "weight" } ×7 ], "gapGoal": 6, "accuracyGoal": 80 }`
  - `m4g3`: `{ "metrics": [ { "id", "label", "target", "dir": 1|-1, "failure" } ×5 ], "toggles": [ { "id", "label" } ×3 ], "sliders": [ { "id", "label" } ×2 ] }`
- `copy` holds the v3 learner-facing strings the explainer needs. They are fixed for v3 and
  for variations alike:
  `m1g1 {zones:{spam,ok,right,wrong → label}, trainWrong, testWrong}`;
  `m1g2 {trueMiss}`; `m3g1 {missMessage}`; `m4g1 {zones:{keep,cut}, wrong, askMiss}`;
  `m4g2 {zones:{trust,verify}, wrong}`; `m2g1 {}` (messages are in `data`);
  `m2g2 {slots:{task,ctx,role,fmt,lim → label}, wrongDecoy, wrongSlot}`;
  `m3g2 {gapFail, accuracyFail}` (templates with `{n}` where v3 inserts the number; the
  explainer substitutes "some");
  `m4g3 {notYetPrefix}`.
- `conceptRules`: `[[itemIdPrefix, Concept], …]`. The first prefix that matches wins, and
  `""` matches everything. Example `m1g1`: `[["e","Training data"],["t","Generalization"]]`.
- The server-side canned message and correct label per item follow the per-game table in
  `spec/architecture.md` → Contracts → Phase 3.
- **Parity:** `web/tests/contracts/explainContent.test.ts` rebuilds every file from the web
  v3 `data.ts` constants and `web/src/content/concepts.ts`, using the mappings above, and
  asserts deep equality with the JSON. `api/tests/unit/test_explain_content.py` asserts
  that every file loads, that every item has a correct answer plus ≥ 1 wrong answer, and
  that every item has a concept.
