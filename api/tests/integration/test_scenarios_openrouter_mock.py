"""Scenario generation through the real OpenRouterProvider over ``httpx.MockTransport``:
request body (one call, strict json_schema, bounded max_tokens), fenced output salvage,
the validator-fed regeneration, upstream errors, and the real (non-demo) cache namespace."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.schemas import GAMES
from tests.conftest import TEST_DEVICE_ID
from tests.integration.conftest import completion

HDR = {"X-Glitch-Device": TEST_DEVICE_ID}


@pytest.fixture
def cache_dir(tmp_path: Path) -> Path:
    return tmp_path / "cache"


async def test_one_strict_json_schema_call_and_real_namespace(openrouter_app, client_for, cache_dir) -> None:
    content = json.dumps(fake_scenario("m4g2", 1))
    app, rec = openrouter_app(lambda req: httpx.Response(200, json=completion(content)), cache_dir=str(cache_dir), llm_max_output_tokens=650)
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m4g2/next", headers=HDR)
    assert r.status_code == 200 and r.json()["data"]["cached"] is False
    assert len(rec.requests) == 1
    body = rec.bodies[0]
    assert body["max_tokens"] == 650
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "scenario_m4g2", "strict": True, "schema": GAMES["m4g2"].llm_json_schema},
    }
    assert body["models"] == ["google/gemini-2.5-flash-lite", "openai/gpt-4o-mini"]
    assert "<game>m4g2</game>" in body["messages"][1]["content"]
    vid = r.json()["data"]["variationId"]
    stored = json.loads((cache_dir / "scenarios" / "m4g2" / f"{vid}.json").read_text())
    assert stored["model"] == "google/gemini-2.5-flash-lite"


async def test_fenced_output_is_salvaged(openrouter_app, client_for, cache_dir) -> None:
    content = "```json\n" + json.dumps(fake_scenario("m1g1", 2)) + "\n```"
    app, _ = openrouter_app(lambda req: httpx.Response(200, json=completion(content)), cache_dir=str(cache_dir))
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m1g1/next", headers=HDR)
    assert r.status_code == 200 and r.json()["ok"] is True


async def test_invalid_then_valid_two_calls_with_feedback(openrouter_app, client_for, cache_dir) -> None:
    bad = fake_scenario("m1g2", 1)
    bad["sentences"] = bad["sentences"][:5]
    outputs = [json.dumps(bad), json.dumps(fake_scenario("m1g2", 1))]
    app, rec = openrouter_app(lambda req: httpx.Response(200, json=completion(outputs.pop(0))), cache_dir=str(cache_dir))
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m1g2/next", headers=HDR)
    assert r.status_code == 200 and r.json()["energy"]["remaining"] == 9
    assert len(rec.requests) == 2
    assert "exactly 6 items (got 5)" in rec.bodies[1]["messages"][1]["content"]


async def test_upstream_auth_error_falls_back(openrouter_app, client_for, cache_dir) -> None:
    app, rec = openrouter_app(lambda req: httpx.Response(401, json={"error": {"message": "bad key"}}), cache_dir=str(cache_dir))
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m3g1/next", headers=HDR)
        m = (await c.get("/v1/metrics")).json()["data"]
    assert r.status_code == 502 and r.json()["error"]["code"] == "AI_UNAVAILABLE"
    assert r.json()["energy"]["remaining"] == 10 and len(rec.requests) == 1
    assert m["cache_misses"] == 1 and m["llm_calls_by_outcome"] == {"provider_error": 1}
    assert not (cache_dir / "scenarios" / "m3g1").exists()


async def test_truncated_output_never_cached(openrouter_app, client_for, cache_dir) -> None:
    text = json.dumps(fake_scenario("m4g1", 1))[:120]  # max_tokens cut the JSON
    app, rec = openrouter_app(lambda req: httpx.Response(200, json=completion(text)), cache_dir=str(cache_dir))
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m4g1/next", headers=HDR)
    assert r.status_code == 502 and r.json()["error"]["code"] == "AI_INVALID_OUTPUT"
    assert len(rec.requests) == 2  # one regeneration, then fallback
    assert not (cache_dir / "scenarios" / "m4g1").exists()
