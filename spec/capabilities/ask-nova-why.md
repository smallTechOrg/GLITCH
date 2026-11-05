# Capability: Ask NOVA Why — Phase 3

## What It Does
Right after a mistake the learner can ask NOVA why their answer was wrong. They get a short
explanation and one tip. Each distinct question is answered by the AI once, then served
from a global cache to every learner.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game id, variation id (`v3` or a served variation id), item id, wrong answer id | closed identifiers (`spec/architecture.md` → Contracts → Phase 3 → per-game mistake table) | the latest session mistake (Game Runtime) | yes |
| Device id | anonymous id | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Explanation | `text` ≤ 60 words + `tip` ≤ 25 words, plus `cached` and `provider` | the panel under NOVA's speech bubble; kept for this session so the recap can reuse it |
| Energy | remaining / limit | the same energy meter as everywhere else (`spec/api.md`) |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | `POST /v1/explain`: cache lookup, then ONE AI call on a cache miss | panel shows the in-world line plus the game's canned miss message (rules below); the game is never blocked |

## Business Rules
- Replaces the Phase 1 "ASK NOVA WHY · SOON" stub. The chip "ASK NOVA WHY" appears under
  the bubble for the **latest** mistake of the session, shielded ones included. It shows
  only while the bubble still shows that miss's line (any later `say`/`miss`/`win` replaces
  the bubble, which hides the chip) and for at most 10 s (`ASK_WINDOW_MS = 10000`). Once
  tapped, the panel stays open until the learner closes it, makes the next mistake, or
  the session restarts. Play continues; the panel is never modal.
- Not offered for mistakes whose payload has `explain: false`. The only such mistake is
  the free-write round's weak prompt (`fw.<goalId>`), whose feedback is already AI-scored.
- The client sends ids only, never free text. The server works out the item, the correct
  answer and the canned message itself, from bundled v3 content JSON or from the
  scenario store (`spec/api.md` → `POST /v1/explain`).
- Cache key = (game, variation, item, wrong answer). A cache hit costs no energy and no
  tokens. A miss costs 1 device energy, charged only when an explanation is served (the
  energy is reserved first and refunded on any failure), plus 1 global unit for the
  provider call.
- Output is schema-validated (word limits, plain text, no links) and moderated before it
  is cached or served. The server never retries the AI call.
- Within one page lifetime the client remembers every explanation it has received (in
  memory, keyed like the server cache), so asking again makes no network call.
- Failure lines (copy in `features/tutor/copy.ts`):
  - Network error, timeout or any `AI_*`/`MODERATED`/`INTERNAL`/`BAD_REQUEST`/`CAP_GLOBAL`:
    "NOVA'S OFFLINE — here's the short version:" followed by the canned miss message.
  - `CAP_DEVICE`: "OUT OF AI ENERGY TODAY — here's the short version:" followed by the
    canned message.
- Client timeout 8 s (`EXPLAIN_TIMEOUT_MS`). While waiting, NOVA's thinking indicator is
  shown (no dot animation under reduced motion) and "NOVA is thinking" is announced politely.

## Success Criteria
- [ ] A wrong tap in Fact or Fib shows the "ASK NOVA WHY" chip, and the chip is gone after 10 s
      or after the next action (component test, fake timers).
- [ ] Two devices asking the same (game, variation, item, answer) → one provider call total.
      The second response has `cached: true` and the same energy as before the request, and
      is logged as an `llm_call` with `cache: "hit"` (integration test + live gate).
- [ ] The request body has exactly the keys `gameId`, `variationId`, `itemId`, `answer`
      (client unit test).
- [ ] With the server down, the panel shows the offline line plus the canned message
      within 8 s (E2E with `page.route('**/v1/explain', r => r.abort())`).
- [ ] An answer equal to the correct answer, an unknown item, an unknown variation or a
      `fw.*` item → `BAD_REQUEST`, no provider call, no energy change (integration test).
- [ ] `[live]` A real explanation for a Fact or Fib mistake has ≤ 60 words, a tip of
      ≤ 25 words, passed moderation, and the repeat ask is a free cache hit.
