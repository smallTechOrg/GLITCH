"""check_logs on the explain route: hit + miss required by default; no item/answer/variation."""

from __future__ import annotations

import json

from glitch_api.tools.check_logs import EXPLAIN_ROUTE, check


def _call(rid: str, cache: str, **extra: object) -> str:
    return json.dumps({"event": "llm_call", "request_id": rid, "purpose": "explain", "game_id": "m1g2", "cache": cache,
                       "model": "m", "latency_ms": 1.0, "prompt_tokens": 1, "completion_tokens": 1, **extra})


def _req(rid: str) -> str:
    return json.dumps({"event": "request", "route": EXPLAIN_ROUTE, "request_id": rid, "status": 200})


def test_explain_route_needs_hit_and_miss_by_default() -> None:
    failures, stats = check([_call("a", "miss"), _req("a"), _call("b", "hit"), _req("b")], [], EXPLAIN_ROUTE)
    assert failures == [] and stats["cache_hit"] == 1 and stats["cache_miss"] == 1
    failures, _ = check([_call("a", "miss"), _req("a")], [], EXPLAIN_ROUTE)
    assert failures == [f"no llm_call cache=hit line for {EXPLAIN_ROUTE}"]
    failures, _ = check([_call("a", "miss"), _req("a")], [], EXPLAIN_ROUTE, require_cache_hit_and_miss=False)
    assert failures == []


def test_explain_line_with_item_answer_or_variation_fails() -> None:
    for field in ("item_id", "answer", "variation_id"):
        failures, _ = check([_call("a", "miss", **{field: "x"}), _req("a"), _call("b", "hit"), _req("b")], [], EXPLAIN_ROUTE)
        assert any("item/answer/variation" in f for f in failures), field
