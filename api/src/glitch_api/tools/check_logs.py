"""Observability + privacy check over a JSON-lines API log (Phase 1 gate step 9).

    cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/api.log
    cd api && uv run python -m glitch_api.tools.check_logs <log> --forbid "some prompt text" --forbid-file prompts.txt
    cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/api.log --route "/v1/scenarios/{game_id}/next"
    cd api && uv run python -m glitch_api.tools.check_logs ../web/test-results/8798/api.log --route /v1/explain

Asserts:
1. every non-blank line is a JSON object;
2. ≥1 ``request`` line for ``/v1/freewrite/evaluate`` (``--route`` to change);
3. ≥1 ``llm_call`` line carrying ``latency_ms``, ``model``, ``prompt_tokens``,
   ``completion_tokens`` and ``cache``;
4. cache (``--require-cache-hit-and-miss``; ON by default for the scenarios route
   ``/v1/scenarios/{game_id}/next`` and the explain route ``/v1/explain``, off otherwise; ``--no-require-cache-hit-and-miss``
   turns it off): ≥1 complete ``llm_call`` line with ``cache: "hit"`` AND ≥1 with
   ``cache: "miss"`` whose ``request_id`` belongs to a ``request`` line for the route
   (Phase 2 gate step 6 — a log of only generations, or only cache hits, fails);
5. privacy: no line has a learner-text / secret field (``prompt``, ``goal``, ``reply``,
   ``tip``, ``messages``, ``content``, ``device_id``, ``authorization``, ``api_key`` …), no
   raw UUID (device ids), no OpenRouter key, and none of the forbidden strings appears
   anywhere (case-insensitive). ``purpose: "explain"`` lines additionally never carry the
   item id, the answer or the variation id (``item_id``, ``answer``, ``variation_id`` …). Forbidden strings = the spec fixture prompts + ``--forbid``
   + ``--forbid-file`` lines + every multi-word string literal in the web E2E specs
   (``web/e2e/**/*.ts``; skip with ``--no-e2e-scan``).

Prints ``LOGS OK …`` and exits 0, or prints each failure to stderr and exits 1.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
E2E_DIR = REPO_ROOT / "web" / "e2e"
DEFAULT_ROUTE = "/v1/freewrite/evaluate"
SCENARIOS_ROUTE = "/v1/scenarios/{game_id}/next"
EXPLAIN_ROUTE = "/v1/explain"
CACHE_ROUTES = frozenset({SCENARIOS_ROUTE, EXPLAIN_ROUTE})  # routes where hit + miss are required by default

REQUIRED_LLM_FIELDS = ("latency_ms", "model", "prompt_tokens", "completion_tokens", "cache")
FORBIDDEN_KEYS = frozenset(
    {"prompt", "goal", "reply", "tip", "text", "messages", "content", "body", "device_id", "device",
     "authorization", "api_key", "openrouter_api_key", "key"}
)
# Explain lines must not identify what was asked (spec/api.md → POST /v1/explain → Logs).
EXPLAIN_FORBIDDEN_KEYS = frozenset({"item_id", "itemid", "answer", "variation_id", "variationid", "item", "answers"})
# Spec fixture prompts (freewrite-forge.md) — must never appear in a log.
SPEC_FIXTURES = (
    "Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants.",
    "Tell me about plants",
    "Explain photosynthesis to a 10-year-old.",
    "Plan a 3-day revision timetable for your science test.",
    "Write a message asking your coach to move practice to Thursday.",
    "Get ideas for a school poster about saving water.",
    "Summarise the causes of World War I for a quiz tomorrow.",
    "Write a short thank-you note to a teacher.",
)
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.IGNORECASE)
_KEY = re.compile(r"sk-or-[A-Za-z0-9-]{8,}")
_TS_STRING = re.compile(r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`""")
MIN_E2E_WORDS = 3
MIN_E2E_CHARS = 16


def e2e_strings(directory: Path = E2E_DIR) -> list[str]:
    """Multi-word string literals from the web E2E specs (prompts the E2E types in)."""
    found: list[str] = []
    if not directory.is_dir():
        return found
    for path in sorted(directory.rglob("*.ts")):
        for match in _TS_STRING.finditer(path.read_text(encoding="utf-8", errors="replace")):
            value = next(g for g in match.groups() if g is not None)
            value = value.replace("\\'", "'").replace('\\"', '"').strip()
            if len(value) >= MIN_E2E_CHARS and len(value.split()) >= MIN_E2E_WORDS:
                found.append(value)
    return found


def _walk_keys(obj: Any) -> Iterable[str]:
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield str(k)
            yield from _walk_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_keys(v)


def check(
    lines: Sequence[str],
    forbidden: Iterable[str],
    route: str = DEFAULT_ROUTE,
    require_cache_hit_and_miss: bool | None = None,
) -> tuple[list[str], dict[str, int]]:
    """``require_cache_hit_and_miss=None`` = auto: required for the routes in ``CACHE_ROUTES``."""
    failures: list[str] = []
    stats = {"lines": 0, "request": 0, "llm_call": 0, "forbidden_checked": 0, "cache_hit": 0, "cache_miss": 0}
    route_request_ids: set[str] = set()
    cache_calls: list[tuple[str, str]] = []  # (request_id, cache) of complete llm_call lines
    needles = sorted({f.strip().lower() for f in forbidden if f and f.strip()})
    stats["forbidden_checked"] = len(needles)

    for n, raw in enumerate(lines, start=1):
        if not raw.strip():
            continue
        stats["lines"] += 1
        try:
            entry = json.loads(raw)
        except ValueError:
            failures.append(f"line {n}: not JSON")
            continue
        if not isinstance(entry, dict):
            failures.append(f"line {n}: not a JSON object")
            continue

        bad_keys = sorted({k for k in _walk_keys(entry) if k.lower() in FORBIDDEN_KEYS})
        if bad_keys:
            failures.append(f"line {n}: forbidden field(s) {bad_keys}")
        if entry.get("purpose") == "explain":
            explain_keys = sorted({k for k in _walk_keys(entry) if k.lower() in EXPLAIN_FORBIDDEN_KEYS})
            if explain_keys:
                failures.append(f"line {n}: explain line carries item/answer/variation field(s) {explain_keys}")
        if _UUID.search(raw):
            failures.append(f"line {n}: contains a raw UUID (device id?)")
        if _KEY.search(raw):
            failures.append(f"line {n}: contains an OpenRouter key")
        low = raw.lower()
        for needle in needles:
            if needle in low:
                failures.append(f"line {n}: contains forbidden learner text ({len(needle)} chars)")
                break

        event = entry.get("event")
        if event == "request" and entry.get("route") == route:
            stats["request"] += 1
            if isinstance(entry.get("request_id"), str):
                route_request_ids.add(entry["request_id"])
        elif event == "llm_call":
            missing = [f for f in REQUIRED_LLM_FIELDS if f not in entry]
            if missing:
                failures.append(f"line {n}: llm_call missing {missing}")
                continue
            if not isinstance(entry["latency_ms"], (int, float)):
                failures.append(f"line {n}: llm_call latency_ms not a number")
            elif not (isinstance(entry["model"], str) and entry["model"]):
                failures.append(f"line {n}: llm_call model empty")
            elif not all(isinstance(entry[f], int) for f in ("prompt_tokens", "completion_tokens")):
                failures.append(f"line {n}: llm_call token counts not integers")
            elif entry["cache"] not in ("none", "hit", "miss"):
                failures.append(f"line {n}: llm_call cache not none|hit|miss")
            else:
                stats["llm_call"] += 1
                if isinstance(entry.get("request_id"), str):
                    cache_calls.append((entry["request_id"], entry["cache"]))

    if stats["request"] == 0:
        failures.append(f"no request line for {route}")
    if stats["llm_call"] == 0:
        failures.append(f"no complete llm_call line ({', '.join(REQUIRED_LLM_FIELDS)})")

    # llm_call lines precede their request line (written when the request ends) → match after the pass.
    for request_id, cache in cache_calls:
        if request_id in route_request_ids and cache in ("hit", "miss"):
            stats[f"cache_{cache}"] += 1
    if require_cache_hit_and_miss is None:
        require_cache_hit_and_miss = route in CACHE_ROUTES
    if require_cache_hit_and_miss:
        for cache in ("hit", "miss"):
            if stats[f"cache_{cache}"] == 0:
                failures.append(f"no llm_call cache={cache} line for {route}")
    return failures, stats


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m glitch_api.tools.check_logs", description=__doc__.split("\n")[0])
    parser.add_argument("logfile", type=Path)
    parser.add_argument("--forbid", action="append", default=[], help="text that must not appear (repeatable)")
    parser.add_argument("--forbid-file", type=Path, action="append", default=[], help="file of forbidden lines")
    parser.add_argument("--route", default=DEFAULT_ROUTE, help=f"request route template (default {DEFAULT_ROUTE})")
    parser.add_argument(
        "--require-cache-hit-and-miss",
        action=argparse.BooleanOptionalAction,
        default=None,
        help=f"require >=1 cache hit and >=1 cache miss llm_call line for --route (default: on for {SCENARIOS_ROUTE} and {EXPLAIN_ROUTE})",
    )
    parser.add_argument("--no-e2e-scan", action="store_true", help="do not read string literals from web/e2e")
    args = parser.parse_args(list(sys.argv[1:] if argv is None else argv))

    if not args.logfile.is_file():
        print(f"LOGS FAIL: log file not found: {args.logfile}", file=sys.stderr)
        return 1
    forbidden = [*SPEC_FIXTURES, *args.forbid]
    for path in args.forbid_file:
        forbidden += [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not args.no_e2e_scan:
        forbidden += e2e_strings()

    lines = args.logfile.read_text(encoding="utf-8", errors="replace").splitlines()
    failures, stats = check(lines, forbidden, args.route, args.require_cache_hit_and_miss)
    if failures:
        for failure in failures:
            print(f"LOGS FAIL: {failure}", file=sys.stderr)
        return 1
    print(
        f"LOGS OK {args.logfile}: {stats['lines']} lines, {stats['request']} {args.route} request line(s), "
        f"{stats['llm_call']} llm_call line(s), {stats['cache_hit']} cache hit / {stats['cache_miss']} cache miss, "
        f"{stats['forbidden_checked']} forbidden strings absent"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
