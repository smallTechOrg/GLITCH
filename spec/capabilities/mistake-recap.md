# Capability: End-of-Game Mistake Recap — Phase 3

## What It Does
The win and Out-of-hearts screens show a short recap of the mistakes made in that game
and what each one should have been — composed on the device with zero AI tokens.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Mistakes this session | list of (item, wrong answer, canned message) | Game Runtime | yes |
| Cached explanations | text | Ask NOVA Why (if already fetched) | no |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Recap list (max 5) | item, "you said", "it was", one-line why | result screen |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules
- Replaces the Phase 1 "Mistake recap · SOON" stub.
- Shielded mistakes are listed (marked "SHIELDED"); powers' auto-solves are not mistakes.
- Uses an explanation already fetched in this session when available, else v3's canned
  message. Never triggers an AI call.
- No mistakes → "No mistakes. Clean run!"

## Success Criteria
- [ ] Three wrong drops in Train the Model produce three recap rows with the right answer.
- [ ] Recap renders with the server unreachable.
