"""tools/check_logs.py — observability + privacy assertions over a JSON-lines log."""

from __future__ import annotations

import json
from pathlib import Path

from glitch_api.tools.check_logs import check, e2e_strings, main

REQUEST = {"event": "request", "route": "/v1/freewrite/evaluate", "status": 200, "request_id": "abc", "device_hash": "0123456789ab"}
LLM_CALL = {
    "event": "llm_call",
    "request_id": "abc",
    "model": "google/gemini-2.5-flash-lite",
    "latency_ms": 812.5,
    "prompt_tokens": 420,
    "completion_tokens": 95,
    "cache": "none",
    "outcome": "ok",
    "prompt_chars": 140,
}


def _lines(*entries: dict) -> list[str]:
    return [json.dumps(e) for e in entries]


def test_check_logs_passes_on_complete_private_log() -> None:
    failures, stats = check(_lines(REQUEST, LLM_CALL), forbidden=["secret learner words"])
    assert failures == []
    assert stats["request"] == 1 and stats["llm_call"] == 1


def test_check_logs_requires_request_and_llm_call_lines() -> None:
    failures, _ = check(_lines({"event": "request", "route": "/healthz"}), forbidden=[])
    assert any("no request line" in f for f in failures)
    assert any("no complete llm_call" in f for f in failures)


def test_check_logs_flags_missing_llm_fields() -> None:
    partial = {k: v for k, v in LLM_CALL.items() if k != "completion_tokens"}
    failures, _ = check(_lines(REQUEST, partial), forbidden=[])
    assert any("missing ['completion_tokens']" in f for f in failures)


def test_check_logs_flags_forbidden_text_without_echoing_it() -> None:
    leaked = {**LLM_CALL, "detail": "Explain Photosynthesis to my brother"}
    failures, _ = check(_lines(REQUEST, leaked), forbidden=["explain photosynthesis to my brother"])
    assert any("forbidden learner text" in f for f in failures)
    assert not any("photosynthesis" in f.lower() for f in failures)


def test_check_logs_flags_learner_fields_uuids_and_keys() -> None:
    entries = [
        {**REQUEST, "prompt": "x"},
        {**REQUEST, "note": "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c"},
        {**REQUEST, "note": "sk-or-v1-abcdefabcdef1234"},
        LLM_CALL,
    ]
    failures, _ = check(_lines(*entries), forbidden=[])
    assert any("forbidden field(s) ['prompt']" in f for f in failures)
    assert any("raw UUID" in f for f in failures)
    assert any("OpenRouter key" in f for f in failures)


def test_check_logs_flags_non_json_lines() -> None:
    failures, _ = check(["not json", *_lines(REQUEST, LLM_CALL)], forbidden=[])
    assert any("not JSON" in f for f in failures)


def test_e2e_strings_extracts_multi_word_literals(tmp_path: Path) -> None:
    (tmp_path / "a.spec.ts").write_text(
        "await page.fill('#p', 'Act as a teacher and explain plants');\nconst id = 'fw1';\n"
    )
    assert e2e_strings(tmp_path) == ["Act as a teacher and explain plants"]


def test_main_exit_codes(tmp_path: Path, capsys) -> None:
    good = tmp_path / "good.log"
    good.write_text("\n".join(_lines(REQUEST, LLM_CALL)) + "\n")
    assert main([str(good), "--no-e2e-scan"]) == 0
    assert "LOGS OK" in capsys.readouterr().out

    bad = tmp_path / "bad.log"
    bad.write_text("\n".join(_lines(REQUEST, {**LLM_CALL, "detail": "my secret prompt"})) + "\n")
    assert main([str(bad), "--no-e2e-scan", "--forbid", "my secret prompt"]) == 1
    assert "LOGS FAIL" in capsys.readouterr().err

    assert main([str(tmp_path / "missing.log")]) == 1


# ---- cache hit + miss for a route (Phase 2 gate step 6) -----------------------------------
SCENARIOS = "/v1/scenarios/{game_id}/next"


def _scenario_request(rid: str) -> dict:
    return {"event": "request", "route": SCENARIOS, "status": 200, "request_id": rid, "device_hash": "0123456789ab"}


def _scenario_call(rid: str, cache: str) -> dict:
    return {**LLM_CALL, "request_id": rid, "purpose": "scenario_gen", "game_id": "m1g2", "cache": cache}


def test_scenarios_route_requires_hit_and_miss_automatically() -> None:
    # llm_call lines are written before their request line (the request line closes the request)
    ok = _lines(_scenario_call("r1", "miss"), _scenario_request("r1"), _scenario_call("r2", "hit"), _scenario_request("r2"))
    failures, stats = check(ok, forbidden=[], route=SCENARIOS)
    assert failures == []
    assert stats["cache_hit"] == 1 and stats["cache_miss"] == 1

    only_miss = _lines(_scenario_call("r1", "miss"), _scenario_request("r1"))
    failures, stats = check(only_miss, forbidden=[], route=SCENARIOS)
    assert failures == ["no llm_call cache=hit line for /v1/scenarios/{game_id}/next"]
    assert stats["cache_hit"] == 0 and stats["cache_miss"] == 1

    only_hit = _lines(_scenario_call("r2", "hit"), _scenario_request("r2"))
    failures, _ = check(only_hit, forbidden=[], route=SCENARIOS)
    assert failures == ["no llm_call cache=miss line for /v1/scenarios/{game_id}/next"]


def test_cache_lines_count_only_for_the_routes_requests() -> None:
    # A hit belonging to a request on another route (or to no request at all) does not count.
    lines = _lines(
        _scenario_call("r1", "miss"),
        _scenario_request("r1"),
        _scenario_call("fw", "hit"),
        {**REQUEST, "request_id": "fw"},
        _scenario_call("orphan", "hit"),
        {k: v for k, v in _scenario_call("x", "hit").items() if k != "request_id"},
    )
    failures, stats = check(lines, forbidden=[], route=SCENARIOS)
    assert any("no llm_call cache=hit line" in f for f in failures)
    assert stats["cache_hit"] == 0 and stats["cache_miss"] == 1


def test_cache_requirement_is_off_by_default_for_freewrite_and_can_be_forced() -> None:
    lines = _lines(REQUEST, LLM_CALL)  # cache "none"
    assert check(lines, forbidden=[])[0] == []
    failures, _ = check(lines, forbidden=[], require_cache_hit_and_miss=True)
    assert failures == [
        "no llm_call cache=hit line for /v1/freewrite/evaluate",
        "no llm_call cache=miss line for /v1/freewrite/evaluate",
    ]
    only_miss = _lines(_scenario_call("r1", "miss"), _scenario_request("r1"))
    assert check(only_miss, forbidden=[], route=SCENARIOS, require_cache_hit_and_miss=False)[0] == []


def test_main_cache_flags(tmp_path: Path, capsys) -> None:
    log = tmp_path / "api.log"
    log.write_text("\n".join(_lines(_scenario_call("r1", "miss"), _scenario_request("r1"))) + "\n")
    assert main([str(log), "--no-e2e-scan", "--route", SCENARIOS]) == 1
    assert "no llm_call cache=hit line" in capsys.readouterr().err
    assert main([str(log), "--no-e2e-scan", "--route", SCENARIOS, "--no-require-cache-hit-and-miss"]) == 0
    capsys.readouterr()

    with log.open("a") as fh:
        fh.write("\n".join(_lines(_scenario_call("r2", "hit"), _scenario_request("r2"))) + "\n")
    assert main([str(log), "--no-e2e-scan", "--route", SCENARIOS]) == 0
    out = capsys.readouterr().out
    assert "LOGS OK" in out and "1 cache hit / 1 cache miss" in out

    fw = tmp_path / "fw.log"
    fw.write_text("\n".join(_lines(REQUEST, LLM_CALL)) + "\n")
    assert main([str(fw), "--no-e2e-scan", "--require-cache-hit-and-miss"]) == 1
