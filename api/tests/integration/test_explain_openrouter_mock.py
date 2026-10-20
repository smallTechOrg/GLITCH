"""``POST /v1/explain`` through the real OpenRouter adapter over ``httpx.MockTransport``."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from tests.conftest import TEST_DEVICE_ID
from tests.integration.conftest import OTHER_DEVICES, completion

URL = "/v1/explain"
BODY = {"gameId": "m4g3", "variationId": "v3", "itemId": "ship", "answer": "well"}
TEXT = "Wellbeing was below its target, so the companion is not ready. Every target must be met before you ship."
TIP = "Check each meter against its target before you press SHIP IT."


async def test_real_adapter_miss_then_hit(openrouter_app, client_for, tmp_path: Path) -> None:
    cache = tmp_path / "cache"
    app, rec = openrouter_app(lambda r: httpx.Response(200, json=completion(json.dumps({"text": TEXT, "tip": TIP}))),
                              cache_dir=str(cache))
    async with client_for(app) as c:
        miss = await c.post(URL, json=BODY, headers={"X-Glitch-Device": TEST_DEVICE_ID})
        hit = await c.post(URL, json=BODY, headers={"X-Glitch-Device": OTHER_DEVICES[0]})
    assert miss.json()["data"] == {"text": TEXT, "tip": TIP, "cached": False, "provider": "openrouter"}
    assert miss.json()["energy"]["remaining"] == 9
    assert hit.json()["data"]["cached"] is True and hit.json()["energy"]["remaining"] == 10
    assert len(rec.requests) == 1
    sent = rec.bodies[0]
    assert sent["max_tokens"] == 200 and sent["temperature"] == 0.3
    assert sent["response_format"]["json_schema"]["strict"] is True
    user = next(m["content"] for m in sent["messages"] if m["role"] == "user")
    assert "<learner_answer>WELLBEING OFF TARGET</learner_answer>" in user
    assert "<canned>Not yet: wellbeing is too low.</canned>" in user
    obj = json.loads((cache / "explanations" / "m4g3" / "v3" / "ship" / "well.json").read_text())
    assert obj["model"] == "google/gemini-2.5-flash-lite" and obj["text"] == TEXT


async def test_upstream_429_refunds(openrouter_app, client_for, tmp_path: Path) -> None:
    app, rec = openrouter_app(lambda r: httpx.Response(429, json={"error": {"message": "slow down"}}),
                              cache_dir=str(tmp_path / "cache"))
    async with client_for(app) as c:
        r = await c.post(URL, json=BODY, headers={"X-Glitch-Device": TEST_DEVICE_ID})
    assert r.json()["ok"] is False and r.json()["error"]["code"] == "AI_UNAVAILABLE"
    assert r.json()["energy"]["remaining"] == 10
    assert len(rec.requests) >= 1
