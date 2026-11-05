# Capability: Forge Variations — Phase 4

## What It Does
Replays of Prompt Forge bring AI-generated block forges (new task + five correct blocks +
three decoys + canned NOVA output) and new free-write goals, generated once and cached.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Seen forge/goal ids | lists | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Forge | heading, 8 blocks (5 slot answers + 3 decoys), output text | m2g2 forges 1–2 |
| Goal | goal text, offline reply, 5 example phrases | free-write round |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | next unseen forge / goal (cache, else one generation) | v3 forges / built-in goal bank |

## Business Rules
- Validators: exactly one block per slot, exactly 3 decoys, each block ≤ 90 characters,
  decoys must fail the lever cue rules for every slot; goal ≤ 80 characters, teen-appropriate,
  example phrases must each hit their lever under the lever cue rules.
- Same cache, energy, seen-tracking and fallback rules as `scenario-variations.md`.

## Success Criteria
- [ ] A generated forge with two TASK blocks is rejected.
- [ ] [live] A generated goal's example phrases each hit their own lever.
