# Capability: Mistake Memory — Phase 3

## What It Does
The device remembers which concepts a learner keeps getting wrong and the home screen
offers a "REVIEW" panel pointing them back at the games that teach those concepts.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Mistakes | (game, item, concept tag, time) | Game Runtime | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Concept tallies | per concept: misses, last missed | device storage |
| REVIEW panel | top 3 concepts + "Replay <game>" buttons | Home |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules
- Concept tags come from the module tags (e.g. "Training data", "Proxy variables",
  "Verification"); each game item maps to one tag in its data file.
- A concept leaves REVIEW after the learner clears a game teaching it with 3 stars.
- Stored on device only; cleared by Reset progress; capped at 200 mistake records.

## Success Criteria
- [ ] Missing two proxies then winning Proxy Hunt with 2 stars lists "Proxy variables" in
      REVIEW; a later 3-star clear removes it.
- [ ] REVIEW survives reload.
