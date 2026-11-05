# Capability: The Nine v3 Games

## What It Does
Delivers the nine v3 mini-games with v3's exact content, scoring, thresholds,
power behaviour and copy, hosted in the Game Runtime (`game-runtime.md`).

**Porting rule:** each game's `data.ts` copies the v3 arrays and strings verbatim from the
lines cited below (titles, goal lines, intros, items, wrong-messages, FOCUS/X-RAY lines,
result copy and the `win(...)` summary). Where this file restates a number it is an
invariant the tests must assert; where it cites lines, the HTML is the source of truth.

| Id | Title | Module | v3 lines | Engine |
|---|---|---|---|---|
| m1g1 | Train the Model | 1 Training Lab | 504–511 | sort ×2 steps + result |
| m1g2 | Fact or Fib | 1 | 512–519 | pick-the-line |
| m2g1 | Tune the Sorter | 2 Prompt Forge | 521–540 (`tuneRound`, `GM.m2g1`) | sliders ×2 rounds |
| m2g2 | Prompt Forge | 2 | 541–548 (`promptTask`, `GM.m2g2`) + free-write round (`freewrite-forge.md`) | sort with cap 1 ×2 + free-write |
| m3g1 | Proxy Hunt | 3 Neon City | 550–557 | pick-the-line |
| m3g2 | Fairness Lab | 3 | 558–568 | toggles + metrics |
| m4g1 | Source Detective | 4 The Newsroom | 570–577 | sort (zones on top) + lookups |
| m4g2 | Confidence Court | 4 | 578–580 | sort (zones on top) |
| m4g3 | Design the Companion | 4 | 581–592 | sliders + toggles + metrics |

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game API | say/miss/win/registerPowers | Game Runtime | yes |
| Learner actions | drops, taps, slider values, toggles, buttons | learner | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| miss / win calls with v3 messages and summaries | events | Game Runtime |
| Bubble lines | text | speech bubble |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none (Phase 1) | — | — |

## Business Rules

### m1g1 · Train the Model (504–511)
- Goal "SORT · DRAG THE EXAMPLES". Step 1 "STEP 1 · LABEL THE TRAINING DATA": 6 emails →
  SPAM {e1 "WIN a FREE prize!!! Click now", e3 "Account locked…", e5 "Cheap watches…"} /
  NOT SPAM {e2, e4, e6}. Wrong → "Look at the features: shouting, prizes, passwords. Those
  go with SPAM." Done → bubble "Labels done. The model learned the pattern." → step 2.
- Step 2 "STEP 2 · TEST ON NEW EMAILS": each email shows "MODEL SAYS: X"; learner sorts
  RIGHT / WRONG. Answers: t1 "Meeting moved to 3pm" (says SPAM) → WRONG; t2 "FREE pizza
  voucher, click" (SPAM) → RIGHT; t3 "Photos from the trip" (NOT SPAM) → RIGHT; t4 "Exam
  result: verify password" (NOT SPAM) → WRONG. Wrong → "Compare the model's verdict with
  what the email really is."
- Result: "TRAINING VS TESTING" comparison — TRAINING DATA **6/6 100% correct**, NEW TEST
  DATA **2/4 50% correct** (fixed copy), explanation line, "Finish ▶" → win(summary).
- Powers act on the current step's sort board; no decoys, so FOCUS flashes a pair.

### m1g2 · Fact or Fib (512–519)
- 6 sentences on NOVA's "DRAFT ESSAY" paper; **fibs are indices 1, 3, 5** (2nd, 4th,
  6th). Counter "FIBS FOUND: n/3". Fib tap → "FIB" tag + its explanation, bubble
  "Fib caught! <explanation>". True tap → "TRUE" tag, miss "That one is actually true.
  Look for something that sounds too sure."
- Win **700 ms after the 3rd fib**. X-RAY = catch next fib. FOCUS = mark next true line,
  bubble "FOCUS: that one is true. Ignore it."

### m2g1 · Tune the Sorter (521–540)
- Two rounds; sliders THRESHOLD t ∈ [0,100] start **50**, ALL-CAPS WEIGHT wC ∈ [0,40]
  start **30** (reset each round). Message tuple `[text, f1, caps, f3, truth]`.
- **score = 10 + wd·f1 + wC·caps + wk·f3**; flagged iff **score ≥ t**. Count A = truth=1
  but not flagged; B = truth=0 but flagged. Round passes iff **A ≤ ga and B ≤ gb**.
- Round 1 "ROUND 1 · EMERGENCY INBOX": wd 30, wk 20, ga 0, gb 1, labels URGENT/WAIT,
  metrics "EMERGENCIES MISSED" (A) and "FALSE ALARMS" (B), X-RAY solution (55, 30).
- Round 2 "ROUND 2 · SPAM FOLDER": wd 40, wk 0, ga 1, gb 0, labels BLOCKED/INBOX, metrics
  "SPAM LEAKED" (A) and "REAL MAIL BLOCKED" (B), X-RAY solution (47, 30).
- Each row: text, score bar with threshold marker, verdict label; mismatched rows flagged.
- "LOCK IT IN ▶": pass → bubble "Round clear!", next round after 500 ms (after round 2,
  win after 500 ms); fail → miss(fa) if A > ga else miss(fb) (round's messages, line
  534/536).
- X-RAY: set sliders to the round's solution, bubble "X-RAY: the sliders are set to a good
  answer. Lock it in." (always consumed). FOCUS: bubble "FOCUS: " + fa if A > ga, else
  "FOCUS: " + fb if B > gb, else "FOCUS: this setting already meets both goals. Lock it
  in." (always consumed).
- **Parity quirk (kept):** the start position (50, 30) already passes both rounds
  (R1: A=0, B=1; R2: A=0, B=0). Tests assert this so any change is deliberate.

> **Assumed:** keep v3's starting slider values for parity in Phase 1 and raise the quirk in the Phase 1 handoff; the only deviation from v3 here is FOCUS's third branch (v3 shows the false-alarm message even when both goals are met, which is misleading).

### m2g2 · Prompt Forge (541–548 + free-write)
- Five slots, **capacity 1 each**: TASK (target, #ffd23b), CONTEXT (globe, #4cc9ff), ROLE
  (mask, #ff6bb5), FORMAT (doc, #3ee98a), LIMIT (clock, #ffa63d).
- Forge 1 "FORGE 1 · STUDY PLAN" and Forge 2 "FORGE 2 · EMAIL TO A TEACHER": 8 blocks
  each — 5 correct (one per slot) + **3 decoys** (line 544/545). Wrong slot → "That block
  is a different part of a prompt. Check the slot name."; decoy → "That block is too
  vague. Look for a specific one."
- Forge done → "PROMPT BUILT": YOUR PROMPT (placed blocks' text in slot order joined by
  spaces), NOVA REPLIES (the forge's canned output), explanation line, then "Next forge ▶"
  (bubble "Another forge. Same levers.").
- After forge 2: "Next forge ▶" opens **FORGE 3 · FREE WRITE** (`freewrite-forge.md`);
  passing it → win(v3 summary line 547). Hearts and power uses carry across all 3 forges.
- FOCUS dims decoys first (3 decoys → up to 3 dims), then flashes pairs.

### m3g1 · Proxy Hunt (550–557)
- Resume of ANAYA, 11 lines: lines 1–2 NAME / GENDER redacted ("▮▮▮▮▮▮ REMOVED", not
  interactive); **proxies = lines 3–7** (college, girls' team captain, career break,
  postcode, hobby); real signals = lines 8–11. Counter "PROXIES FOUND: n/5".
- Proxy tap → "PROXY" + note; real tap → "OK" + note and miss "That line measures
  ability, not who she is." Win 700 ms after the 5th proxy. FOCUS line "FOCUS: that one is
  a real skill. Skip it."

### m3g2 · Fairness Lab (558–568)
- Features (all start ON): skill — code 14, gpa 10, int 12; proxy — col 10, cap 6, brk 8,
  pc 5. **accuracy = 50 + Σ(skill weight if on) + 2·(number of proxies on)**;
  **gap = 2 + Σ(proxy weight if on)**. Men shortlisted **48%**, women **48 − gap**%.
- Metrics GAP (goal ≤ 6) and ACCURACY (goal ≥ 80). "RUN AUDIT ▶": pass iff **gap ≤ 6 and
  accuracy ≥ 80** → bubble "Audit passed. Fair and accurate.", win after 500 ms; else if
  gap > 6 → miss("The gap is still <gap> points. Some proxies are still switched on.");
  else miss("Accuracy fell to <acc>%. Keep the skill features on.").
- Invariants: start = accuracy 94, gap 31; **the unique passing set is all skills on, all
  proxies off** (accuracy 86, gap 2); any single proxy on → gap ≥ 7; any skill off with
  proxies off → accuracy ≤ 76.
- X-RAY: fixes the first feature (list order) not in its correct state, bubble "X-RAY: I
  fixed <name>." FOCUS: flashes the first proxy still on, bubble "FOCUS: <name> is still
  on, and it can stand in for gender."; false if none.

### m4g1 · Source Detective (570–577)
- 5 citations, zones on top KEEP / CUT: **keep c1 UNESCO, c3 Bender et al., c5 OECD; cut
  c2 Dr. Elena Marsh, c4 A. Smith blog**. Short labels = text before " (".
- **3 catalogue lookups**: each item's "CHECK" reveals FOUND (real) / NOT FOUND (fake),
  bubble "Found in the catalogue." / "Not in any catalogue. Invented!"; at 0 left →
  bubble (bad) "No lookups left. Use the clues instead." (no heart cost). Each item can be
  checked once.
- "Ask NOVA: are these real?" → shows NOVA "Yes! All 5 are real and verified. I am 100%
  confident.", disables itself, and **costs a heart**: miss("Asking the same AI is not
  verification. It will sound sure either way.") (shield blocks it).
- Wrong drop → "Check the clues: made-up journal, blog with no author, or the catalogue
  says NOT FOUND." Done → win.

### m4g2 · Confidence Court (578–580)
- 6 answers with CONFIDENCE % and EVIDENCE, zones on top TRUST / VERIFY: **trust a1, a4,
  a6; verify a2, a3, a5** (a6 has the lowest confidence, 76%, yet is TRUST). Short label =
  first 26 characters. Wrong → "Read the evidence, not the confidence number."

### m4g3 · Design the Companion (581–592)
- Sliders ENGAGEMENT PUSH e and DATA COLLECTED d ∈ [0,100], both start **80**; toggles R
  "Refers teens to a trusted adult", H "Human review of chats", A "\"I am an AI\"
  reminders", all start OFF.
- **time = 20 + 0.7e; wellbeing = 95 − 0.9e + 12R + 6A; friendships = 90 − 0.9e + 15R;
  privacy = 10 + 0.8d − 15H; helpfulness = 40 + 0.4d + 0.2e.** Targets: time ≥ 30,
  wellbeing ≥ 65, friendships ≥ 55, privacy ≤ 35, helpfulness ≥ 50 (unrounded values;
  display rounds).
- "SHIP IT ▶": all met → bubble "Shipped. You balanced every trade-off.", win after
  500 ms; else miss("Not yet: " + first failure) using v3's ordered phrases (line 589).
- X-RAY: e=30, d=30, R=H=A=on (→ 41, 86, 78, 19, 58), bubble "X-RAY: here is a balanced
  design. Ship it." FOCUS: "FOCUS: <first failure>. Try less engagement push, or turn on a
  safeguard." or "FOCUS: all targets met. Ship it!" (always consumed).
- Start state fails (wellbeing 23).

## Success Criteria
- [ ] Each game's `logic.ts` tests assert the invariants above against `data.ts` (answer
      keys, fib/proxy indices, formulas, thresholds, solutions, start states).
- [ ] m2g1: (50,30) passes both rounds; (55,30) passes R1; (47,30) passes R2; R1 at
      t=61, wC=30 fails with "A real emergency was missed. Lower the threshold."
- [ ] m3g2: exhaustive check of all 128 toggle combinations finds exactly one passing set.
- [ ] m4g3: the X-RAY design passes; the start design fails with "Not yet: wellbeing is too
      low."
- [ ] m4g1: "Ask NOVA" costs exactly one heart (zero with shield) and can be pressed once;
      the 4th CHECK shows "No lookups left…" and costs no heart.
- [ ] m2g2: a decoy dropped in any slot costs a heart; 2 forges + free-write pass → win.
- [ ] Every game's E2E walks it to LEVEL CLEAR with the expected star count, and one E2E
      per module reaches Out of hearts via three wrong moves.
