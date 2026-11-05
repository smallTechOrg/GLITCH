# Capability: Story Variations — Phase 4

## What It Does
Rewatching a module's storytime plays an AI-generated retelling with new dialogue and
examples that teaches the same key ideas, generated once and cached.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Module id, seen story ids | ids | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Story | 8–12 slides using the v3 slide kinds, speakers and icon ids | cutscene player |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | next unseen story (cache, else one generation) | v3 story |

## Business Rules
- Must contain every KEY IDEA heading of the v3 story for that module, unchanged.
- Only existing characters (heroes, ZARA, KABIR, MS. D'SOUZA, NOVA) and existing icon ids;
  each line ≤ 160 characters; moderated.
- First watch is always v3; storytime XP stays once per module.

## Success Criteria
- [ ] A generated story missing a key idea or using an unknown icon id is rejected.
- [ ] [live] A generated Module 3 story plays through the cutscene player.
