# Capability: End-of-Game Mistake Recap — Phase 3

## What It Does
The win and Out-of-hearts screens show a short recap of the mistakes made in that game
session and what each answer should have been. It is built on the device with zero AI
tokens.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Session mistakes | `SessionMistake[]` (`spec/architecture.md` → Contracts → Phase 3) | Game Frame (this run only) | yes |
| Fetched explanations | `{ [mistakeKey]: { text, tip } }` | Ask NOVA Why (this run only) | no |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Recap list | ≤ 5 rows: item text, "YOU SAID", "IT WAS", one-line why, optional SHIELDED tag | win screen and fail screen (testIDs in `spec/ui.md`) |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules
- Replaces the Phase 1/2 "COMING SOON: Mistake recap" strip (`win-soon-strip` is removed).
- Rows are deduplicated by `mistakeKey` (`itemId|answer`) and kept in the order of first
  occurrence. A repeated key shows "×n". At most 5 rows; if there are more, the line
  "+n more" follows.
- Every row shows `itemText`, "YOU SAID: <answerLabel>", "IT WAS: <correctLabel>" and the
  why line. The why line is the explanation `text` already fetched in this session for
  that key if there is one, else the canned miss `message` the frame recorded.
- A shielded mistake is listed with a "SHIELDED" tag. Power auto-solves (X-RAY, FOCUS) are
  never mistakes. REWIND gives back a heart but does not remove the mistake.
- Free-write weak prompts appear as rows ("YOU SAID: n/5 LEVERS", "IT WAS: 4+/5 LEVERS").
- No mistakes → the single line "No mistakes. Clean run!".
- Never makes a network call. Retry/Replay starts a new session with an empty recap.

## Success Criteria
- [ ] Three wrong drops in Train the Model (three different emails) → three rows, each showing
      the right zone label (component test on the frame with the real game).
- [ ] Six different mistakes → 5 rows + "+1 more". The same wrong drop made twice → one row with "×2".
- [ ] A row whose explanation was fetched shows the explanation text; the others show the
      canned message.
- [ ] A shielded mistake shows the SHIELDED tag; an X-RAY solve adds no row.
- [ ] A clean 3-heart run shows "No mistakes. Clean run!".
- [ ] The recap renders with the server unreachable (E2E, all `/v1/**` aborted).
