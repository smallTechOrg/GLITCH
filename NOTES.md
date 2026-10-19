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
