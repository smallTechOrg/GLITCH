# Capability: Mistake Memory — Phase 3

## What It Does
The device remembers which concepts a learner keeps getting wrong. The home screen shows a
"REVIEW" panel that sends them back to the games that teach those concepts.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Mistakes | `SessionMistake` per recorded miss | Game Frame → `features/memory` `rememberMistake` | yes |
| Game wins | (gameId, stars) | Game Frame → `features/memory` `onGameWon` | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| `mistakes` | `MistakeRecord[]`, newest first, max 200 (`spec/data.md` → v3) | device storage |
| REVIEW panel | top 3 concepts, each with a miss count and a "Replay <game title>" button | Home |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules
- Every recorded session mistake (shielded included) is saved to the device as soon as it
  happens. It is not batched at game end, so a quit or a failed run still counts.
- Concepts are the 12 module tags (`CONCEPTS` in `web/src/content/concepts.ts`). Each
  item maps to exactly one tag (per-game table in `spec/architecture.md` → Contracts →
  Phase 3). "Dataset bias" is a valid tag that no Phase 3 item uses.
- Tallies are derived from `mistakes` and never stored separately. For each concept:
  `misses` = record count and `last` = newest `at`. Ranking: `misses` desc, then `last`
  desc, then `CONCEPTS` order. REVIEW shows the top 3.
- Each REVIEW row's replay button opens the game of the newest record with that concept
  (`gameHref(module, gameId)`).
- Mastery: when a game is won with **3 stars**, every record whose concept is in
  `CONCEPTS_BY_GAME[gameId]` is removed, from every game. This runs after that win's own
  mistakes were recorded, so shielded mistakes from a 3-star run are removed too. A win
  with 1–2 stars removes nothing.
- When there are no records, REVIEW is not rendered (it has no empty state).
- Device only. Reset progress clears `mistakes`; the explanation cache is never persisted.
  Over 200 records, the oldest are dropped.

## Success Criteria
- [ ] Missing two proxies and then winning Proxy Hunt with 2 stars → REVIEW lists "Proxy
      variables · 2 misses" with "Replay Proxy Hunt". A later 3-star clear of Proxy Hunt
      removes the row (unit test on `features/memory/logic.ts` + E2E).
- [ ] REVIEW survives reload (E2E).
- [ ] 201 recorded mistakes → 200 stored, and the oldest is gone (unit).
- [ ] Ranking tie-breaks follow the rule above (unit).
- [ ] A stored v2 state migrates to v3 with `mistakes: []`. Malformed records (unknown game,
      unknown concept, bad ids) are dropped by sanitize (unit, fixture).
- [ ] Reset progress empties REVIEW (component test).
