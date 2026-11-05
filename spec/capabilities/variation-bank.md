# Capability: Variation Bank Script — Phase 2

## What It Does
An admin-run offline command pre-generates N validated variations per game into the
shared cache so learners rarely trigger live generation.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Game id(s) | one id or `all` | command line | yes |
| Count N | integer 1–100 | command line | yes |
| Backend | `local` \| `gcs` | command line / env | no (env default) |
| Dry run | flag | command line | no |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Variations | scenario JSON objects | blob cache |
| Report | generated / already present / rejected (with reasons) / tokens / est. cost | terminal |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| OpenRouter | one generation call per variation | retry ×3 with backoff, then record as rejected and continue |
| Blob cache | list / write | abort with a clear message |

## Business Rules
- Idempotent: target is "N variations present"; re-running with the same N generates 0.
- Uses exactly the same generate → validate → moderate → dedupe → store pipeline as
  live generation; never bypasses validators.
- Does not consume device energy; counts against nothing but the admin's OpenRouter key.
  Refuses to run with the demo provider unless `--dry-run`.
- Prints no secrets.

## Success Criteria
- [ ] `--count 3` then `--count 3` → second run reports "0 generated, 3 already present".
- [ ] A rejected generation is reported with its validation reason and not stored.
- [ ] `--dry-run` with the demo provider writes nothing and exits 0.
