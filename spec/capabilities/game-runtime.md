# Capability: Game Runtime

## What It Does
Hosts any of the nine games in a shared frame that owns hearts, the hero power, the
shield, the speech bubble, mistakes, winning, failing, stars and game XP, plus the shared
sort-into-bins and tap-the-line interaction engines, exactly as v3 does.

v3 source: game frame `spec/idea/GLITCH v3.html` lines 467–487 (`hearts`, `hud`, `say`,
`gameStart`, `usePower`, `miss`, `fail`, `win`); sort engine lines 488–500 (`sortGame`);
drag-and-drop lines 452–466; pick buttons line 501; metric bar line 502.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game id | one of the 9 game ids | route / step | yes |
| Hero | hero chosen for the game's module (fallback: last hero, then SCOUT) | device state | yes |
| Learner actions | drag, tap, keyboard, power button | learner | yes |
| Game callbacks | say / miss / win / power handlers | the running game | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Session state | hearts, lost count, shield, power uses, over | frame HUD |
| Stars (best kept), step done, once-bonuses, XP, powers used, heroes played | progress updates | device state |
| Win / Out-of-hearts screens | UI | learner |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules

### Session
- A session starts with **3 hearts**, **0 lost**, **no shield**, **2 power uses**, not over.
  Starting a game marks its hero as "played" (Hero Collector badge).
- Frame layout (v3 `gameStart`): banner with the module's scene, tag "MODULE n · TITLE" +
  game title, hero sprite (bobbing) on the left, NPC of the module on the right (NOVA for
  modules 1–2, KABIR for 3, MS. D'SOUZA for 4), speech bubble between; HUD with hearts,
  shield icon when active, the game's goal line, and the power button "ICON NAME xN";
  then the game body. The bubble opens with the game's intro line.
- The power button is disabled when uses = 0 or the session is over.

### Mistakes (`miss`)
- Ignored once the session is over.
- Body shakes (unless reduced motion).
- If the shield is up: the shield drops, **no heart is lost, `lost` is not incremented**,
  bubble (good mood) says `"SHIELDED! " + message`.
- Otherwise: hearts −1, lost +1, bubble (bad mood) says the message (default "Not quite.").
- Hearts reaching 0 → **Out of hearts**: session over; screen shows empty heart, "OUT OF
  HEARTS", "No problem. Use your hero power, read the clues, and try again.",
  "↻ Try again" (fresh session of the same game) and "← Home".

### Powers (`usePower`) — 2 uses per game; a use is consumed ONLY when the power acts
- **X-RAY (SCOUT)**: calls the game's `scan` handler; consumed iff it returns true.
- **FOCUS (ORACLE)**: calls the game's `hint` handler; consumed iff it returns true.
- **REWIND (CHRONO)**: if hearts < 3 → hearts +1 (lost is NOT decremented), calls the
  game's `undo` if registered, bubble "Time rewound. Heart restored."; else not consumed.
- **SHIELD (GUARDIAN)**: if no shield is up → shield up, bubble "Shield up. Your next
  mistake is blocked."; else not consumed.
- Not consumed → toast "NOTHING TO USE IT ON YET".
- Consumed → uses −1, the hero is recorded in "powers used" (Power User badge), badges
  re-checked.

### Winning (`win`)
- Ignored once over. Session over.
- **Stars = hearts remaining, clamped to 1..3**; stored stars = max(previous, new).
- Once-bonus `g<gameId>` (e.g. `gm1g1`) **+30 XP "GAME CLEAR"** the first time this game
  is ever won on the device.
- If `lost === 0` → once-bonus `untouch` **+25 XP "FLAWLESS"** — awarded once per device
  ever (first flawless game only); it unlocks the Untouchable badge.
- The game's step is marked done (then badges re-checked).
- Win screen: bobbing trophy, 3 big stars (earned filled), "LEVEL CLEAR", "WHAT YOU
  LEARNED" box with the game's summary, tags "+30 XP" / "FLAWLESS +25" only when awarded
  now, primary "Continue ▶" (or "Finish module ▶" when the module has no remaining
  incomplete step), "↻ Replay", bubble "Level clear!".
- Phase 1 stub: a "COMING SOON" strip (Fresh case files on replay · Mistake recap),
  disabled, tagged SOON.

### Sort engine (v3 `sortGame`) — used by m1g1, m2g2 forges, m4g1, m4g2
- Items have an answer zone, or none (a **decoy**). Zones have id, label, icon, colour;
  optional per-zone capacity.
- Dropping item X on zone Z: ignored if X already placed; **placed** iff X's answer = Z
  and (no capacity or zone count < capacity); otherwise **wrong** → item flashes red and
  `miss(wrong message)` (game-specific, default "Not there. Look at the clues again.").
  Dropping a decoy anywhere is wrong.
- Done when every non-decoy item is placed (decoys may remain in the pool); the game's
  done callback fires **350 ms** after the last placement.
- X-RAY: places the first unplaced non-decoy item (pool order) into its zone, bubble
  `"X-RAY: that one goes in <ZONE LABEL>."`; false if none left.
- FOCUS: if an unplaced, not-yet-dimmed decoy exists → dims (strikes through) the first,
  bubble "FOCUS: that one is not an answer. Skip it."; else flashes the first unplaced item
  and its zone for 2.2 s, bubble "FOCUS: look at the glowing pair."; false if nothing left.
- "Zones on top" layout (m4g1, m4g2): zones sit above the pool and stay visible while
  scrolling; a placed item shows its short label.
- Interaction (all three always available): **drag** (starts after 8 px of movement; a
  ghost follows the pointer; hovered zone highlights), **tap/click to select** an item
  (toggle) then tap a zone, **keyboard**: Tab to an item, Enter/Space selects, Tab to a
  zone, Enter/Space drops. Placed items are inert. Controls inside an item (m4g1's CHECK)
  never start a drag or a selection.

### Pick-the-line engine — used by m1g2, m3g1
- Lines are targets, non-targets, or redacted (not interactive).
- Tapping a target: marks it (red tag + note), found +1, game's success line. Tapping a
  non-target: marks it safe (green tag), disables it, `miss(game message)`.
- X-RAY: acts as tapping the first unmarked target. FOCUS: marks the first unmarked
  non-target safe with the game's FOCUS line (no heart cost). Each false if none left.

## Success Criteria
- [ ] A new session has hearts 3, power uses 2, no shield.
- [ ] miss() with shield up leaves hearts at 3 and lost at 0 and drops the shield; the
      bubble text starts with "SHIELDED! ".
- [ ] Three misses without shield → Out-of-hearts screen; a 4th miss changes nothing.
- [ ] REWIND at 3 hearts does not consume a use and toasts "NOTHING TO USE IT ON YET";
      at 2 hearts it restores to 3, consumes one use, and a later win is NOT flawless.
- [ ] SHIELD used twice in a row: second press is not consumed.
- [ ] X-RAY/FOCUS returning false never consumes a use; after 2 consumed uses the button
      is disabled.
- [ ] Win with 2 hearts stores 2 stars; a later replay won with 1 heart keeps 2 stars.
- [ ] First win of a game grants exactly +30 XP; replay wins grant 0 game-clear XP.
- [ ] The first flawless win grants +25 XP and the Untouchable badge; a second flawless
      win in another game grants no FLAWLESS XP.
- [ ] Sort engine: decoys left in the pool do not block completion; done fires 350 ms
      after the last real placement; a capacity-1 zone rejects a second item as wrong.
- [ ] Each sort game is completable by drag, by tap-tap, and by keyboard only.
- [ ] Using a power in any game updates "powers used" for that hero; using all four
      heroes' powers unlocks Power User.
