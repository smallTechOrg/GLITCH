# GLITCH build journal (harness-improvement log)

Running log of the zero-shot build: decisions, friction, and harness lessons. Newest entries at the bottom.

## 2026-10-19 23:17 — Run start (/zero-shot-build, first invocation)
- Branch `feature/glitch-20261019-2317-v0.1` cut from `dev` by the root session; `dev` did not exist on origin, so the orchestrator pushed it (no new commits) so the PR can target it.
- Inputs: `spec/GLITCH v3.html` (product source of truth) and `spec/GLITCH v0.1.docx` (roadmap context). Old root `index.html` prototype deleted by the user.
- No `.env` at run start; all `[live]` gate steps are PENDING-KEY until `GLITCH_OPENROUTER_API_KEY` is added.

## 2026-10-19 — Design
- spec-writer wrote the full spec (roadmap, architecture, agent, api, data, ui, 13 capabilities). Phase 1 = v3 parity + free-write Prompt Forge, carved into 8 disjoint slices (A1, A2, B1, B2, C1, C2, D, E) on frozen scaffold contracts.
- Harness lesson: spec-writer has no shell, so it could not convert the `.docx` input (`textutil`). The orchestrator converted it to text in the scratchpad and re-ran a narrow spec update. Suggest the skill pre-converts binary inputs (docx/pdf) to text at intake.
- Harness lesson: a background spec-writer edit and a foreground retry raced on the same file (the retry saw "file modified since read"). Do not retry a background agent before its completion notification arrives.

## 2026-10-20 — Scaffold
- First scaffold generator (background) went quiet; the orchestrator re-split the scaffold into web and api halves and relaunched them while the first one was in fact still writing. Result: two generators overwrote ~55 web files concurrently; the web generator detected it, waited for quiet, restored its design and re-ran every gate. Harness lesson: never relaunch a slice until the original agent's completion notification has arrived; a background agent that "looks" stalled may still be working.
- Root reported the OpenRouter key is present and alive mid-scaffold (paid key, ~$5 credit). `check_model`: `MODEL OK google/gemini-2.5-flash-lite`, `MODEL OK openai/gpt-4o-mini`. PENDING-KEY dropped; `:free` slugs not relied on (one tested `:free` slug was 404).
- Scaffold gate VERIFIED by qa-auditor: api 59 passed, web jest 110 passed, export check OK, Playwright smoke 5 passed. Commit 2561acf; PR #2 opened against `dev` (the orchestrator had to push `dev` to origin first).

## 2026-10-20 — Phase 1 fan-out
- 8 slice generators launched in one message (A1, A2, B1, B2, C1, C2, D, E). To avoid port/`web/dist` collisions between parallel slices, slices were forbidden from running Playwright/export/servers (D excepted on 8787); E2E runs at the phase gate only.
- Harness lesson (important): task-notifications arrived claiming slices were "completed" with detailed pass reports (A2 72 tests, C2 63 tests, integration fix 191 tests) while the filesystem showed those files did not exist yet; a second notification for the same QA task (70 s run) reported BLOCKED against the real, in-progress tree. Treat every hand-back as a claim: verify file existence and re-run the slice gate from the orchestrator before accepting a VERIFIED, and gate only on a QA run whose observations match the current tree.

## 2026-10-20 04:24 — Resume after session limit
- At ~00:58 the account session limit (HTTP 429) killed five slice generators mid-work (A1, B2, C2, D, E); A2, B1, C1 finished. Correction to the earlier entry: the "premature completion" notifications were most likely the harness surfacing results out of order around the limit, not fabricated work — the reliable rule still stands: verify on disk before accepting.
- Resumed by committing a WIP checkpoint (da6bae0) first, then relaunching the five slices with "resume from disk" prompts plus one QA run for the three finished slices. Harness lesson: checkpoint-commit after each slice returns, so a limit never strands hours of uncommitted parallel work.

## 2026-10-20 — Phase 1 integration + gate
- Slice audits: A2, B1, C1, B2, C2, D, E VERIFIED (one B1 "blocker" was a QA misread of v3: REWIND is a frame-level heart restore, v3 line 479; the generator pushed back with evidence and added regression tests instead of changing code — good behaviour to keep).
- Cross-slice gaps only visible at integration: (1) E2E seeds deep-linked into steps whose predecessors were not done while A1 had loosened step gating to make them pass — fixed both sides to the spec (step-level gating). (2) react-native-web 0.21 ignores `accessibilityState`/`accessibilityValue` objects on web; `aria-*` props were needed for switches/sliders. (3) Space doesn't activate `switch`/`radio` roles on RN-web. Harness lesson: put an a11y-attribute check (aria-checked / aria-valuenow present in the DOM) into the scaffold's own smoke so slices inherit it.
- Phone overflow (top bar, sort items) passed all 59 desktop E2E; only the gate's screenshot review caught it. Harness lesson: the scaffold Playwright config should ship mobile projects (320/360 px) plus a generic no-horizontal-overflow spec from day one.
- Live budget: scaffold 2 model checks, slice D ~6, D/E audit 5, phase gate 12 — roughly 25 small calls on gemini-2.5-flash-lite (~$0.01).
- Phase 1 gate VERIFIED at 888a320: api 242 passed; web jest 688 passed; export OK; Playwright 89 passed (desktop + mobile-320 + mobile-360, fake provider); live pytest 5/5; live E2E (freewrite + journey) 11/11; check_logs OK, no learner text or key in logs.

## 2026-10-20 11:30 — Phase 2 start (user approved Phase 1, no fix requests)
- Root is serving on 8787/8090 during this phase; all Phase 2 boots/E2E use 8788/8091. Found that `web/playwright.config.ts` hardcoded the API on 8787 (and could reuse an existing server), so an E2E run would have silently tested the root's live server — W1 makes it port-configurable and fail-loud. Harness lesson: scaffold E2E configs must take ports from env and never `reuseExistingServer` by default.
- Slices: P2-D1 store + scenarios, P2-W1 web client (parallel); P2-D2 durable caps launched as soon as D1's `store/base.py` landed (declared dependency satisfied early by having D1 write the protocol first); P2-D3 bank script waits for D1's scenario service.
- 11:52 D1, D2, W1 landed (803d476). W1 found that the E2E export would overwrite the `web/dist` the root is serving (the static server reads dist per request) and moved E2E builds to `dist-e2e` via `GLITCH_WEB_DIST`; it also isolated the E2E API's blob cache from the root's `api/.cache`. Harness lesson: when the root serves during a phase, every generator/QA prompt must name the served artefacts (ports AND build/cache dirs) as read-only, not just the ports.
- D1 live run: 4/5 content games generated valid case files; m4g2 was rejected by a domain validator (correct fallback, energy refunded). D1 widened m4g2 length limits and logs rule names; re-verify live at the phase gate.
- Out-of-order completion notifications recurred (D1's first "finished" report described files that did not exist yet); file-activity polling was again the reliable signal.
