# Capability: Durable AI Budget — Phase 2

## What It Does
Device daily caps and the server-wide daily budget persist across server restarts and
cold starts, and the learner sees AI energy on the home screen.

## Inputs
| Input | Type | Source | Required |
|---|---|---|---|
| Device id | anonymous id | request header | yes |
| UTC day | date | server clock | yes |

## Outputs
| Output | Type | Destination |
|---|---|---|
| Counters | per-day device counts + global count | blob cache (`caps/<day>.json`) |
| Energy | remaining / limit / resets at | client |

## External Calls
| System | Operation | On Failure |
|---|---|---|
| Blob cache | conditional read-modify-write | retry on write conflict up to 5×; then deny the AI action (fail closed) and the client uses its fallback |

## Business Rules
- Same limits as Phase 1 (10 per device per UTC day, 500 global).
- Counters for a day are one object; writes use a generation precondition so concurrent
  writers never lose an increment.
- Counter objects store only hashed device ids and counts — no learner data.
- Objects older than 7 days may be deleted (lifecycle rule documented for the bucket).
- Home shows the energy meter (same component as the free-write round).

## Success Criteria
- [ ] Charge 3 times, restart the server, energy shows 7 remaining.
- [ ] Two concurrent charges against the same day both persist (count +2).
- [ ] [gcs] Real bucket: conflicting conditional write is detected and retried.
