# Capability: Scenario Variations (content games) — Phase 2

## What It Does
When a learner replays a content game they have already cleared, they get a fresh,
never-seen-on-this-device scenario that NOVA generated once and every learner reuses.

Applies to: m1g1 Train the Model, m1g2 Fact or Fib, m3g1 Proxy Hunt, m4g1 Source
Detective, m4g2 Confidence Court.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game id | content game id | replay | yes |
| Seen variation ids | list | device (`seenScenarios`) | yes |
| Device id | anonymous id | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Scenario | the game's data shape (same fields as its v3 data) + variation id | game |
| Seen record | variation id appended | device |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | next unseen variation (cache first, generate on a miss) | play the v3 scenario with "NOVA'S OFFLINE — HERE'S A CLASSIC CASE FILE" |

## Business Rules
- First playthrough of a game is always the v3 scenario; variations only on replay after
  the game is cleared.
- The server returns a cached variation not in the device's seen list; only if none is
  available does it generate one (one AI call for the whole scenario).
- A served cached variation costs **no energy**; a generation costs 1 device energy and 1
  global budget unit.
- A generated scenario is cached only after: schema validation, domain validation (the
  same counts and answer balance as v3 — e.g. Fact or Fib: exactly 6 sentences, exactly 3
  fibs, each fib with an explanation ≤ 20 words; Proxy Hunt: 2 redacted, 5 proxies, 4
  real; Source Detective: 5 citations, 2–3 fake; Confidence Court: 6 answers, ≥1
  low-confidence TRUST and ≥1 high-confidence VERIFY; Train the Model: 6 + 4 emails,
  model wrong on exactly 2 test emails), output moderation, and duplicate check (content
  hash).
- Invalid output → one regeneration with the validation errors fed back; still invalid →
  fallback to v3, nothing cached.
- Variations display a "NEW CASE FILE" tag. Stars and XP rules are unchanged (game-clear
  XP is once per game, not per variation).
- If every cached variation has been seen and generation fails or energy is 0, the v3
  scenario is replayed.

## Success Criteria
- [ ] First play serves v3; replay after clear requests a variation.
- [ ] A device never receives a variation id already in its seen list.
- [ ] Second device requesting the same game receives the cached variation with
      `cache: hit` logged and no energy spent.
- [ ] Malformed generations (wrong fib count, unsafe text) are never cached.
- [ ] [live] One real generation per content game passes every validator and is playable
      end-to-end.
