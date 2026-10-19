# Capability: Course Shell & Progression

## What It Does
Takes a learner from first launch through the four modules — optional nickname, home
course map, hero select, storytime cutscenes, module-complete celebrations — and keeps
XP, levels, the daily streak, the 12 badges and once-bonuses on the device, as v3 does.

v3 source: state/XP/streak lines 282–301; course data + progression 302–320; badges
321–336; home 347–365; hero select 366–373; module complete 374–378; storytime 379–451;
heroes/NPCs 209–222; screen wipe `go()` 293; top bar/toasts 295–301. The v3 login
(338–346) is **replaced** by the nickname welcome below.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Nickname | text, 0–20 chars | learner | no |
| Navigation choices | taps / keys | learner | yes |
| Current local date | date | device clock | yes |
| Game outcomes | step done, stars, bonuses | Game Runtime | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Learner progress record | `PersistedStateV1` (`spec/data.md`) | device storage |
| Toasts (XP, level up, badges) | queued messages | screen + live region |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| none | — | — |

## Business Rules

### Welcome (replaces v3 login)
- First launch shows the v3 title banner (title scene, "GLITCH", "AN AI LITERACY
  ADVENTURE", ZARA/KABIR/MS. D'SOUZA/NOVA bobbing, staggered 0.25 s), tagline "Spot what AI
  gets wrong. Pick a hero. Win the game.", an optional "Your nickname" field (trimmed,
  max 20), "▶ Start playing" and "Skip". Footer: "Saved on this device only. No account
  needed." Either button marks the device onboarded and opens Home.
- Greeting: eyebrow "WELCOME BACK", heading = nickname, or **"PLAYER 1"** when none.

> **Assumed:** the no-nickname display name is "PLAYER 1".

### Modules, steps and unlocking (v3 `MODS`, `stepsOf`)
- Modules (title, subtitle, colour, scene, NPC, icon, tags, games) exactly as line
  303–307. Each module's steps: `m<n>h` HERO "Choose your hero", `m<n>s` STORY
  "Storytime", then its games in order.
- Module 1 is always open; module n+1 opens when every step of module n is done.
- A step is startable when all earlier steps of its module are done. Done steps stay
  replayable.
- "Continue/advance": go to the module's first not-done step; if none, the Module
  Complete screen.

### Home (v3 `menu`)
- Hero sprite (last hero), greeting, sub "Spot what AI gets wrong. Make the call."
- Stats: "LVL n" (n/100 XP to next level), total XP, streak with flame ("Day streak (best
  b)"), "d/4" modules complete.
- Quest box with NOVA: fresh device → "START HERE" "Module 1: Training Lab · Choose your
  hero" "▶ Start"; in progress → "CONTINUE" + next step; all done → "COURSE COMPLETE" "You
  finished all four modules. Replay any game to earn more stars." "▶ Replay" (opens
  `m1s`).
- "COURSE · AI LITERACY" path of 4 module cards: number / check (done) / lock; scene
  banner (greyscale when locked); chosen hero's head; "MODULE n · d/total STEPS" or
  "LOCKED"; title, subtitle, tags; progress bar; step list with tag HERO/STORY/GAME and
  status (done game → its stars, min 1 shown; done → "DONE"; startable → "START"; else
  lock). Locked module: "Finish Module n to unlock this one."
- "BADGES · e/12" grid; unlocked badges in colour with "UNLOCKED", locked greyed with their
  description.

### Hero select (v3 `heroSel`)
- Heading "MODULE n · TITLE", "CHOOSE YOUR HERO", "Each hero has one power. You get 2 uses
  per game." Four cards (sprite, name, power chip, description, v3 line 211–214).
  Preselected = this module's hero, else last hero, else SCOUT.
- "▶ Enter the <Module title>": saves hero for the module, sets last hero, marks the hero
  played, marks `m<n>h` done, advances. "← HOME" returns home.

### Storytime (v3 `STORY`, `cut`)
- 41 slides across the 4 modules (11/10/10/10), text and order verbatim from lines
  387–428. Slide kinds: **title** (scene, eyebrow/heading/subline, hero sprite), **portrait**
  (speaker large with outline + text), **icons** (8 icons popping in, 0.12 s stagger, with
  captions), **key** (dimmed scene, "KEY IDEA", heading, module icon), **scene** (scene,
  hero + speaker sprites, speaker talking; dialogue box with speaker name in their colour;
  `big` slides use the larger scale).
- Text types at **22 ms per character**; reduced motion shows it at once.
- Controls: click/tap anywhere, Space, Enter, → = next (first press while typing completes
  the text); ← = previous; Esc or "SKIP ▶▶" = finish. Progress pips (done / current /
  ahead). Hint "CLICK · SPACE · ► TO CONTINUE" (+ " · ◄ BACK" after slide 1). On touch the
  same hint reads "TAP TO CONTINUE".
- Finish (last slide or skip): marks `m<n>s` done, once-bonus `story<n>` **+10 XP
  "STORYTIME DONE"**, advances.

### Module complete (v3 `modDoneScreen`)
- Once-bonus `mod<n>` **+50 XP "MODULE COMPLETE"**. Confetti (28 pieces, 5 colours; static
  under reduced motion), trophy, "MODULE n COMPLETE" tag, "+50 XP" tag when awarded now,
  title (or "COURSE COMPLETE!" for module 4), "You covered:" + tags, WHAT'S NEXT box
  ("Module n+1 is unlocked: <title>.") or for module 4 "YOU FINISHED GLITCH" + v3 line 377
  copy; "Start Module n+1 ▶" (not on module 4), "← Home".

### XP, levels, streak
- **Level = floor(XP / 100) + 1**; the bar shows XP mod 100.
- Every XP award toasts "+n XP · REASON"; crossing a level toasts "LEVEL UP! LVL n".
- **Daily**: on app start and whenever Home gains focus, if the stored last-play day ≠
  today (local date, `YYYY-MM-DD`): streak = previous + 1 if last-play day was yesterday,
  else 1; best = max(best, streak); last-play day = today; **+10 XP "DAILY xN"**. A fresh
  device therefore starts at 10 XP, streak 1.
- XP sources are exactly: daily +10, storytime +10 ×4 (once), game clear +30 ×9 (once),
  module +50 ×4 (once), flawless +25 (once). Maximum one-off XP = 535.

### Badges (v3 `BD`, lines 323–335) — checked after every XP award, step completion, power use
| Id | Name | Unlocks when |
|---|---|---|
| boot | Boot Up | Module 1 complete |
| story | Story Fan | All 4 storytime steps done |
| eye | Sharp Eye | 3 stars on any game |
| smith | Prompt Smith | 3 stars in Prompt Forge (m2g2) |
| bias | Bias Buster | 3 stars in Fairness Lab (m3g2) |
| fact | Fact Checker | 3 stars in Source Detective (m4g1) |
| untouch | Untouchable | Flawless once-bonus earned |
| power | Power User | Powers used with all 4 heroes |
| heroes | Hero Collector | Played with all 4 heroes |
| grad | Graduate | All 4 modules complete |
| streak | 3-Day Streak | Best streak ≥ 3 |
| lvl | Level 3 | Level ≥ 3 (200 XP) |
- Unlock toasts "BADGE · <NAME UPPERCASE>". Badges never re-lock (except via reset).

### Toasts
- Queued, one at a time, **2.3 s** each, announced politely to screen readers.

### Settings (new; replaces v3 LOG OUT)
- Change nickname; "READABLE FONT" toggle (long text switches from the pixel font to a
  plain readable font at ≥16 px); privacy note "Everything saves on this device. NOVA's
  server never keeps what you type."; "Reset progress" needs a second tap ("Tap again to
  erase XP, badges and progress"). Reset keeps streak, best, last-play day, nickname,
  readable-font setting and device id; clears everything else including prompt history.

> **Assumed:** a Settings screen replaces v3's LOG OUT; the readable-font toggle is added for accessibility; reset also clears prompt history.

### Screen transitions
- Screen changes play v3's 0.8 s stepped wipe; skipped under reduced motion.

## Success Criteria
- [ ] Fresh device: onboarding shown; after Skip, Home greets "PLAYER 1", LVL 1, 10 XP,
      streak 1, Module 1 open, Modules 2–4 locked, 0/12 badges.
- [ ] Streak: last day = yesterday → streak+1; last day = 3 days ago → 1; same day → no
      change and no XP (tested with an injected clock).
- [ ] Completing every step of Module 1 unlocks Module 2 and Boot Up; module complete
      grants +50 once (revisiting the screen grants 0).
- [ ] Story: Space/Enter/→ advance, ← goes back, Esc finishes; finishing marks the step
      and grants +10 once.
- [ ] Hero select saves the module's hero; the game frame uses it; Hero Collector unlocks
      after playing with all 4.
- [ ] Level 3 badge unlocks at exactly 200 XP; the level-up toast fires at 100 and 200.
- [ ] Reset keeps streak/best/nickname and returns XP to 0 and all steps to not done.
- [ ] State survives a full page reload (second-interaction test: complete a step, reload,
      complete the next step, reload, both present).
