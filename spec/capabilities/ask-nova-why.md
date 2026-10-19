# Capability: Ask NOVA Why — Phase 3

## What It Does
After a mistake, the learner can ask NOVA why their answer was wrong and get a short
explanation plus one tip; each distinct question is answered by the AI once and then
served from a global cache to every learner.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game id, variation id (or `v3`), item id, wrong answer | identifiers | game mistake | yes |
| Device id | anonymous id | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Explanation | ≤60 words + one tip ≤25 words | speech-bubble panel |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | explanation (cache, then one AI call on a miss) | show v3's canned miss message again with "NOVA'S OFFLINE" |

## Business Rules
- Replaces the Phase 1 "ASK NOVA WHY · SOON" stub; available on the miss bubble for 10 s
  or until the next action.
- Cache key = (game, variation, item, wrong answer). A cache hit costs no energy; a miss
  costs 1 energy.
- The server builds the question from the scenario it already knows (v3 content is
  bundled server-side as JSON; variations come from the cache) — the client sends ids
  only, never free text.
- Output moderated and schema-validated before caching.

## Success Criteria
- [ ] Two devices asking the same (game, item, answer) → one AI call total; second is a
      logged cache hit with no energy spent.
- [ ] With the server down, the learner sees the canned message and the offline line.
- [ ] [live] Explanation for a Fact or Fib mistake is ≤60 words and moderated.
