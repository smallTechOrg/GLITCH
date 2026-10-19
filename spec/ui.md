# GLITCH — UI

Visual identity = v3 (dark indigo grid background, chunky 3 px pixel borders with hard
drop shadows, Press Start 2P, v3 colour tokens `--bg #0d0a24 … --pk #ff6bb5` from line 4,
sprite palette `PAL` from line 160). Upgrade = crisper, richer, smoother, mobile-first and
accessible; never a different look.

## Screens (Phase 1 — all REAL unless marked STUB)

| Route (under `/GLITCH/`) | Screen | Notes |
|---|---|---|
| `/welcome` | Welcome / nickname | `course-shell.md` → Welcome |
| `/` | Home | Redirects to `/welcome` until onboarded |
| `/module/[1-4]/hero` | Hero select | |
| `/module/[1-4]/story` | Storytime (full-screen) | |
| `/module/[1-4]/game/[gameId]` | Game frame + game | Only that module's game ids |
| `/module/[1-4]/complete` | Module complete | |
| `/settings` | Settings | nickname, readable font, reset, privacy note |
| `+not-found` | "LOST IN THE GRID" + Home button | |

Top bar (every screen except storytime and welcome): GLITCH logo (→ Home), HOME,
streak chip, LVL + XP bar, hero head, SETTINGS (gear). Sticky.

Locked/unavailable routes (e.g. a deep link into a locked module): show "This step is
locked. Finish the earlier steps first." + Home button — never a crash.

**STUBS (Phase 1):** both use the shared `StubBadge` look — dimmed, dashed border, yellow
"SOON" tag, `accessibilityState.disabled`, hint "Coming in a future update":
1. "ASK NOVA WHY" chip under the speech bubble after a mistake (testID `ask-nova-why-stub`).
2. Win-screen strip "COMING SOON: Fresh case files on replay · Mistake recap"
   (testID `win-soon-strip`).

## The four states (every data view)
| View | Empty | Loading | Error | Populated |
|---|---|---|---|---|
| App start | — | pixel "LOADING…" while fonts + store hydrate (no flash of wrong screen) | storage unreadable → start fresh + toast "Couldn't read saved progress. Starting fresh." | Home / Welcome |
| Home badges | all greyed with how-to text | — | — | coloured |
| Prompt log | "No prompts yet. Your sends will appear here." | — | — | last 5 |
| Free-write evaluate | goal + empty box with placeholder "e.g. Act as…" | NOVA thinking animation | offline banners (`freewrite-forge.md`) | reply + levers + tip |
| Energy meter | — | "…" segments | "?" offline | r/10 |

## Responsive
- Mobile-first single column; max content width 960 px (v3 `#wp`).
- ≤ 640 px: v3's mobile rules (line 134) — speech bubble moves to top of the banner and
  spans the width, sort zones stack 2-up, Tune-the-Sorter rows drop the bar, story text
  smaller. No horizontal scroll at 320 px width.
- Touch targets ≥ 44×44 px. Sliders have − / + buttons. Sort zones are ≥ 64 px tall.

## Accessibility
- Every interactive element: role, label, `testID`, visible 3 px white focus ring
  (v3 line 133), logical tab order.
- Keyboard: everything playable — sort (Tab/Enter/Space), pick lines (Enter), sliders
  (arrows, PageUp/Down, Home/End), toggles (Enter/Space), story (Space/Enter/→/←/Esc).
- Screen readers: speech bubble and toasts are polite live regions; hearts read "Hearts 2
  of 3" (+ ", shield up"); power button "X-RAY power, 2 uses left"; sort items announce
  "selected" and placement "Placed in SPAM"; result screens announce "Level clear, 3
  stars". Pixel images are decorative (`accessible={false}`) unless they convey state
  (hearts, stars, lever chips, energy) — then labelled.
- Colour is never the only signal: right/wrong also use icons + text tags (TRUE/FIB,
  PROXY/OK, ON/OFF, FOUND/NOT FOUND).
- Reduced motion (OS setting, read live): no wipe, bob, pop, shake, confetti fall, typing
  or ambient scene frames; state changes are instant and still announced.
- Text: pixel font at ≥ 12 px for body copy (v3 used 8–10 px), line height ≥ 1.9; the
  READABLE FONT setting swaps long text (story, game items, NOVA reply, tips) to the
  system sans-serif at 16 px. Contrast ≥ 4.5:1 for all text on its background.

## Pixel art (fidelity upgrade — A2 owns the art, scaffold owns the engine)
- **Engine**: integer-scaled nearest-neighbour rendering everywhere (no blur at any size).
- **Icons**: v3's 40 12×12 grids + heart0/star0; outlined variant (1 px white outline drawn
  into the framebuffer, replacing v3's CSS drop-shadow `.stk`).
- **Characters**: v3 `drawChar` / `drawNova` geometry exactly, plus frames: `idle`,
  `blink` (eyes closed 1 row), `talk` (mouth open 2×2) for speaking characters, and NOVA
  `think` (antenna light cycles 3 colours, eyes scan). Idle blink every ~3 s; talk
  alternates at 4 fps while text types.
- **Scenes**: v3 `SC.*` compositions exactly at 192×80 (title, lab, forge, city, news;
  meadow kept for completeness), plus a 2-frame ambient overlay at 4 fps: lab screen
  pixels blink, forge fire flickers, city windows twinkle + HIRE sign flickers, news
  lamp glow pulses, title glitch lines shift.
- **Animations** (all stepped, v3 timings): wipe 0.8 s steps(8); bob 1.2 s steps(2); pop
  0.35 s steps(4); shake 0.35 s steps(6); confetti fall 2.4 s steps(14); flash 0.5 s
  steps(2); toast pop 0.25 s steps(3); NOVA think 3 frames at 6 fps.

## Test IDs (contract for E2E — slices author tests against these)
Global: `topbar`, `topbar-home`, `topbar-settings`, `xp-level` (text "LVL n"), `xp-text`
("x/100 XP"), `streak-chip`, `toast`.
Welcome: `welcome-nickname-input`, `welcome-start`, `welcome-skip`.
Home: `home-greeting`, `home-quest`, `home-quest-button`, `module-card-<n>`,
`module-status-<n>` ("LOCKED" | "d/t STEPS"), `step-<stepId>` (e.g. `step-m1h`),
`step-<stepId>-status`, `badges-count` ("BADGES · e/12"), `badge-<badgeId>` with
accessibility label "<Name>, unlocked|locked".
Hero select: `hero-card-<heroId>`, `hero-enter`, `hero-back`.
Story: `story-root` (pressable), `story-text`, `story-skip`, `story-progress`.
Game frame: `game-title`, `hearts`, `shield-indicator`, `power-button`, `say-bubble`,
`game-goal`, `game-body`, `ask-nova-why-stub`; fail: `fail-screen`, `fail-retry`,
`fail-home`; win: `win-screen`, `win-stars` (label "n stars"), `win-continue`,
`win-replay`, `win-xp-tag`, `win-flawless-tag`, `win-soon-strip`.
Sort: `dnd-pool`, `dnd-item-<itemId>`, `dnd-zone-<zoneId>`. Pick: `pick-line-<index>`
(0-based, v3 order), `pick-found`. Slider: `slider-<id>`, `slider-<id>-dec`,
`slider-<id>-inc`, `slider-<id>-value`. Toggle: `toggle-<id>`. Metric: `metric-<id>`.
Game buttons: `m1g1-finish`, `m2g1-lock`, `m2g2-next-forge`, `m3g2-audit`,
`m4g1-ask-nova`, `m4g1-check-<citationId>`, `m4g1-lookups`, `m4g3-ship`.
Slider ids: m2g1 `th`, `wc`; m4g3 `en`, `da`. Toggle ids: m3g2 feature ids
(`code`, `gpa`, `int`, `col`, `cap`, `brk`, `pc`); m4g3 `R`, `H`, `A`.
Sort item ids = v3 ids (`e1`…`e6`, `t1`…`t4`, `b0`…`b7` per forge, `c1`…`c5`,
`a1`…`a6`); zone ids = v3 ids (`spam`, `ok`, `right`, `wrong`, `task`, `ctx`, `role`,
`fmt`, `lim`, `keep`, `cut`, `trust`, `verify`).
Free-write: `fw-goal`, `fw-energy` (label "AI energy r of 10"), `fw-input`, `fw-send`,
`fw-thinking`, `fw-offline-banner`, `fw-reply`, `fw-demo-tag`, `fw-lever-<leverId>`
(label "<Lever>: hit|missed"), `fw-score` ("n/5 LEVERS"), `fw-tip`, `fw-finish`,
`fw-history`.
Module complete: `complete-screen`, `complete-xp-tag`, `complete-next`, `complete-home`.
Settings: `settings-nickname-input`, `settings-save`, `settings-readable-font`,
`settings-reset`.
