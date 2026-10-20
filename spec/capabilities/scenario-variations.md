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
| GLITCH server | next unseen variation (cache first, generate on a miss); client timeout **8 s** | network error, timeout, cap, or unparseable/seen variation → play the v3 scenario with "NOVA'S OFFLINE — HERE'S A CLASSIC CASE FILE" |

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
  real; Source Detective: 5 citations, 2–3 fake; Confidence Court: 6 answers, 3 TRUST +
  3 VERIFY, ≥1 low-confidence TRUST and ≥1 high-confidence VERIFY, and every answer's
  verdict agrees with its own evidence (below); Train the Model: 6 + 4 emails, model wrong
  on exactly 2 test emails), output moderation, and duplicate check (content hash).
- Confidence Court verdict/evidence agreement, checked deterministically in the same single
  generation call: each generated answer also carries a self-check `evidenceKind` from a
  closed enum — TRUST kinds `official_record`, `verified_source`, `firsthand_confirmed`;
  VERIFY kinds `unsourced`, `anecdotal`, `outdated`, `contradicted`, `overconfident_claim`,
  `high_stakes_unchecked` — and `trust` must equal "kind is a TRUST kind". Evidence keyword
  sanity also applies (at generation and on every cache read): evidence saying "no source",
  "unverified", "unconfirmed", "rumour", "anonymous", "someone said" or "hearsay" must be
  VERIFY; evidence with an un-negated "confirms" / "official" / "published" / "verified by"
  marked VERIFY is a mismatch. A mismatch is a validation error (fed to the one
  regeneration). `evidenceKind` is never stored or served — the served `data` shape is
  unchanged.
- Every cached variation is re-validated against the CURRENT validators when read; one that
  fails is skipped (never served). `cd api && uv run python -m glitch_api.tools.purge_invalid`
  lists cached variations (all games, both namespaces) that fail today's validators — id +
  rule messages only, never generated text (dry run, the default); `--apply` moves them to
  the `quarantine/` prefix and removes them from the game's index.
- Invalid output → one regeneration with the validation errors fed back; still invalid →
  fallback to v3, nothing cached.
- Variations display a "NEW CASE FILE" tag. Stars and XP rules are unchanged (game-clear
  XP is once per game, not per variation).
- If every cached variation has been seen and generation fails or energy is 0, the v3
  scenario is replayed.
- The client waits at most **8 s** for the next variation (the brief's ~8 s AI timeout;
  `SCENARIO_TIMEOUT_MS` in `web/src/contracts/api.ts`). The server caps the whole scenario
  pipeline — cache lookup, generation and its one validator-fed regeneration — at **7 s**
  (`deadline_s` in `api/src/glitch_api/scenarios/pipeline.py`), so it always answers before
  the client gives up. While waiting the client shows NOVA's thinking card ("NOVA IS PULLING
  A NEW CASE FILE…", no tag — the "NEW CASE FILE" tag appears only once a variation is
  served); on timeout it falls back to v3 with the offline note above.
- When the case file resolves the outcome is announced politely to screen readers: "New case
  file loaded" for a served variation, the offline note for a v3 fallback (once per fetch).
- A variation the client cannot parse into the game's data shape is treated as a
  failure: v3 is played with the offline note and the id is not recorded as seen.
- Reset progress keeps `seenScenarios` (see `spec/data.md`), so a reset device still
  never re-receives a variation it has already played.

## Success Criteria
- [ ] First play serves v3; replay after clear requests a variation.
- [ ] A device never receives a variation id already in its seen list.
- [ ] Second device requesting the same game receives the cached variation with
      `cache: hit` logged and no energy spent.
- [ ] Malformed generations (wrong fib count, unsafe text) are never cached.
- [ ] A fetch that does not answer within 8 s, or answers with an unparseable
      variation, plays v3 with "NOVA'S OFFLINE — HERE'S A CLASSIC CASE FILE".
- [ ] [live] One real generation per content game passes every validator and is playable
      end-to-end.
