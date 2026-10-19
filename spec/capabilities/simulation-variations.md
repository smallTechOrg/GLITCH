# Capability: Simulation Variations — Phase 4

## What It Does
Replays of Tune the Sorter, Fairness Lab and Design the Companion bring AI-generated
parameter sets and stories, each mathematically proven solvable before it is cached.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Seen simulation ids | list | device | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Simulation | same shape as the v3 data (messages + weights + goals; features + weights; formula coefficients + targets) + X-RAY solution | m2g1 / m3g2 / m4g3 |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| GLITCH server | next unseen simulation (cache, else one generation) | v3 simulation |

## Business Rules
- The formulas stay v3's; only the data/coefficients/targets vary (m2g1: messages and
  wd/wk/goals; m3g2: features, weights, goals; m4g3: coefficients within ±30% of v3 and
  targets).
- **Solvability check (programmatic, before caching):** exhaustive search over the
  discrete space — m2g1 all integer (t 0–100, wC 0–40); m3g2 all 2^k toggle sets; m4g3
  e, d in steps of 1 × all 8 toggle sets — must find ≥ 1 solution; the stored X-RAY
  solution must itself pass; **the starting position must NOT already pass** (fixes the
  v3 m2g1 quirk for variations); m3g2 must have exactly one passing set.
- Unsolvable or trivially-solved generations are rejected and never cached.

## Success Criteria
- [ ] The solver confirms the v3 originals solvable (and flags v3 m2g1's start as
      already solved).
- [ ] A hand-made unsolvable fixture is rejected.
- [ ] [live] One generated simulation per game passes the solver and is winnable via its
      X-RAY solution in the UI.
