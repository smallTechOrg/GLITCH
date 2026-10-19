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

### Later versions
- v2 (Phase 2): `seenScenarios: { [GameId]: variationId[] }` (max 100 per game).
- v3 (Phase 3): `mistakes: MistakeRecord[]` (game, variation, item, answer, concept, at;
  max 200).
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
| `scenarios/<gameId>/index.json` | list of variation ids + content hashes |
| `scenarios/<gameId>/<variationId>.json` | `{ id, gameId, schemaVersion, model, createdAt, contentHash, data }` |
| `explanations/<gameId>/<variationId>/<itemId>/<answer>.json` (Phase 3) | `{ text, tip, model, createdAt }` |
| `forges/…`, `goals/…`, `sims/<gameId>/…`, `stories/<moduleId>/…` (Phase 4) | same envelope |
Generated content contains no learner text. Objects are immutable once written (ids are
content-derived), except `index.json` and `caps/*.json`, written with generation
preconditions.
