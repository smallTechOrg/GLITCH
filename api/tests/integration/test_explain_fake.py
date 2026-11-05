"""``POST /v1/explain`` through the real ASGI app with the demo (fake) provider.

Happy path (content, cache object, energy), the second device's free cache hit, single
flight, variation items, every BAD_REQUEST rule (no call, no energy), caps, server error
paths with refunds, invalid stored objects, logs (check_logs) and metrics, and a restart
on the same cache directory.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI

from glitch_api.caps.budget import EnergyService
from glitch_api.caps.store import MemoryCounterStore
from glitch_api.explain.fake import FAKE_TIP
from glitch_api.llm.base import LLMProviderError, LLMRequest, LLMResult
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.repository import DEMO_NAMESPACE, ScenarioRepository
from glitch_api.scenarios.schemas import parse_candidate
from glitch_api.store import LocalBlobStore, StoreError
from glitch_api.tools.check_logs import EXPLAIN_ROUTE
from glitch_api.tools.check_logs import check as check_log_lines
from tests.conftest import TEST_DEVICE_ID
from tests.integration.conftest import OTHER_DEVICES, read_log

URL = "/v1/explain"
FIB_TEXT = "That one is actually true. Look for something that sounds too sure. The right call here: TRUE."


def body(**over: Any) -> dict[str, Any]:
    return {"gameId": "m1g2", "variationId": "v3", "itemId": "s0", "answer": "fib", **over}


def hdr(device: str = TEST_DEVICE_ID) -> dict[str, str]:
    return {"X-Glitch-Device": device}


@pytest.fixture
def cache_dir(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
def app(fake_app, cache_dir: Path) -> FastAPI:
    return fake_app(cache_dir=str(cache_dir))


def stored(cache_dir: Path, game: str = "m1g2", variation: str = "v3", item: str = "s0", answer: str = "fib") -> Path:
    return cache_dir / "explanations-demo" / game / variation / item / f"{answer}.json"


async def energy_of(c, device: str = TEST_DEVICE_ID) -> int:
    return (await c.get("/v1/energy", headers=hdr(device))).json()["energy"]["remaining"]


# ---- happy path + cache -------------------------------------------------------------------
async def test_miss_generates_stores_and_charges_one_energy(app, client_for, cache_dir) -> None:
    async with client_for(app) as c:
        r = await c.post(URL, json=body(), headers=hdr())
    assert r.status_code == 200
    out = r.json()
    assert out["ok"] is True
    assert out["data"] == {"text": FIB_TEXT, "tip": FAKE_TIP, "cached": False, "provider": "fake"}
    assert out["energy"]["remaining"] == 9 and out["energy"]["limit"] == 10
    assert app.state.provider.calls == 1
    obj = json.loads(stored(cache_dir).read_text())
    assert {k: obj[k] for k in ("gameId", "variationId", "itemId", "answer", "text", "tip", "promptVersion")} == {
        "gameId": "m1g2", "variationId": "v3", "itemId": "s0", "answer": "fib",
        "text": FIB_TEXT, "tip": FAKE_TIP, "promptVersion": 1,
    }
    assert obj["model"] == "glitch/demo-nova" and obj["createdAt"].endswith("Z")
    assert not (cache_dir / "explanations").exists(), "demo output never lands in the real namespace"


async def test_second_device_is_a_free_hit_with_no_call(app, client_for, log_path) -> None:
    async with client_for(app) as c:
        first = await c.post(URL, json=body(), headers=hdr())
        before = await energy_of(c, OTHER_DEVICES[0])
        second = await c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[0]))
        metrics = (await c.get("/v1/metrics")).json()["data"]
    assert first.json()["data"]["cached"] is False
    out = second.json()
    assert out["ok"] is True and out["data"]["cached"] is True and out["data"]["text"] == FIB_TEXT
    assert out["energy"]["remaining"] == before == 10
    assert app.state.provider.calls == 1
    assert metrics["cache_hits"] == 1 and metrics["cache_misses"] == 1 and metrics["llm_calls_total"] == 1
    lines = [e for e in read_log(log_path) if e.get("event") == "llm_call"]
    assert [e["cache"] for e in lines] == ["miss", "hit"]
    assert all(e["purpose"] == "explain" and e["game_id"] == "m1g2" for e in lines)
    assert lines[1]["prompt_tokens"] == 0 and lines[1]["completion_tokens"] == 0


async def test_same_device_repeat_is_also_free(app, client_for) -> None:
    async with client_for(app) as c:
        await c.post(URL, json=body(), headers=hdr())
        again = await c.post(URL, json=body(), headers=hdr())
    assert again.json()["data"]["cached"] is True and again.json()["energy"]["remaining"] == 9
    assert app.state.provider.calls == 1


async def test_concurrent_identical_requests_share_one_call(fake_app, cache_dir, client_for) -> None:
    app = fake_app(cache_dir=str(cache_dir), fake_latency_ms=150)
    async with client_for(app) as c:
        responses = await asyncio.gather(
            c.post(URL, json=body(), headers=hdr()),
            c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[0])),
            c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[1])),
        )
        energies = [await energy_of(c, d) for d in (TEST_DEVICE_ID, OTHER_DEVICES[0], OTHER_DEVICES[1])]
    outs = [r.json() for r in responses]
    assert all(o["ok"] for o in outs)
    assert app.state.provider.calls == 1
    assert sorted(o["data"]["cached"] for o in outs) == [False, True, True]
    assert {o["data"]["text"] for o in outs} == {FIB_TEXT}
    assert sorted(energies) == [9, 10, 10]
    assert app.state.explain_inflight == {}


async def test_different_answers_are_different_cache_entries(app, client_for, cache_dir) -> None:
    async with client_for(app) as c:
        a = await c.post(URL, json=body(gameId="m2g2", itemId="f1.b1", answer="ctx"), headers=hdr())
        b = await c.post(URL, json=body(gameId="m2g2", itemId="f1.b1", answer="role"), headers=hdr())
    assert a.json()["data"]["cached"] is False and b.json()["data"]["cached"] is False
    assert a.json()["data"]["text"] == (
        "That block is a different part of a prompt. Check the slot name. The right call here: TASK."
    )
    assert stored(cache_dir, "m2g2", "v3", "f1.b1", "ctx").exists() and stored(cache_dir, "m2g2", "v3", "f1.b1", "role").exists()
    assert app.state.provider.calls == 2


@pytest.mark.parametrize("payload, expected", [
    (body(gameId="m1g1", itemId="t1", answer="right"), "Compare the model's verdict with what the email really is. The right call here: WRONG."),
    (body(gameId="m2g1", itemId="r2", answer="false_alarms"), "Real mail got blocked. Raise the threshold or lower the caps weight. The right call here: BOTH GOALS MET."),
    (body(gameId="m3g1", itemId="l7", answer="proxy"), "That line measures ability, not who she is. The right call here: OK."),
    (body(gameId="m3g2", itemId="audit", answer="gap"), "The gap is still some points. Some proxies are still switched on. The right call here: GAP ≤ 6 · ACCURACY ≥ 80."),
    (body(gameId="m4g1", itemId="ask", answer="ask_nova"), "Asking the same AI is not verification. It will sound sure either way. The right call here: CHECK THE CATALOGUE."),
    (body(gameId="m4g2", itemId="a5", answer="trust"), "Read the evidence, not the confidence number. The right call here: VERIFY."),
    (body(gameId="m4g3", itemId="ship", answer="pv"), "Not yet: privacy risk is too high. The right call here: ALL 5 TARGETS MET."),
    (body(gameId="m2g2", itemId="f2.b7", answer="lim"), "That block is too vague. Look for a specific one. The right call here: NO SLOT · TOO VAGUE."),
])
async def test_demo_text_per_game_uses_server_side_canned_and_label(app, client_for, payload, expected) -> None:
    async with client_for(app) as c:
        r = await c.post(URL, json=payload, headers=hdr())
    assert r.status_code == 200, r.json()
    assert r.json()["data"]["text"] == expected


async def test_variation_item_resolves_from_the_scenario_store(app, client_for, cache_dir) -> None:
    repo = ScenarioRepository(LocalBlobStore(cache_dir), DEMO_NAMESPACE)
    variation, _ = await repo.add("m1g2", parse_candidate("m1g2", fake_scenario("m1g2", 1)), model="glitch/demo-nova")
    true_idx = next(i for i, s in enumerate(variation.data["sentences"]) if s["fib"] is False)
    async with client_for(app) as c:
        r = await c.post(URL, json=body(variationId=variation.id, itemId=f"s{true_idx}"), headers=hdr())
    assert r.status_code == 200, r.json()
    assert r.json()["data"]["text"].endswith("The right call here: TRUE.")
    assert stored(cache_dir, "m1g2", variation.id, f"s{true_idx}").exists()


# ---- BAD_REQUEST: no provider call, no energy -------------------------------------------
@pytest.mark.parametrize("payload", [
    body(answer="true"),                                   # the correct answer
    body(itemId="s1"),                                     # a fib: not a mistake item
    body(itemId="s9"),                                     # unknown item
    body(answer="proxy"),                                  # out of vocabulary
    body(variationId="m1g2-0123456789ab"),                 # unknown variation
    body(gameId="m2g1", variationId="m2g1-0123456789ab", itemId="r1", answer="missed"),  # no variations
    body(variationId="m1g1-0123456789ab"),                 # variation of another game
    body(gameId="m2g2", itemId="fw.fw1", answer="weak"),  # explain: false
    body(extra="x"),
    {"gameId": "m1g2", "variationId": "v3", "itemId": "s0"},
    body(gameId="m9g9"),
    body(answer=5),
])
async def test_bad_requests_cost_nothing_and_call_nothing(app, client_for, payload) -> None:
    async with client_for(app) as c:
        r = await c.post(URL, json=payload, headers=hdr())
    assert r.status_code == 400
    out = r.json()
    assert out["ok"] is False and out["error"]["code"] == "BAD_REQUEST" and out["energy"]["remaining"] == 10
    assert app.state.provider.calls == 0
    raw = json.dumps(out)
    assert "Machine learning finds" not in raw


async def test_non_json_and_oversized_bodies(app, client_for) -> None:
    async with client_for(app) as c:
        a = await c.post(URL, content=b"not json", headers={**hdr(), "Content-Type": "application/json"})
        b = await c.post(URL, content=b"{" + b" " * 2000 + b"}", headers={**hdr(), "Content-Type": "application/json"})
        d = await c.post(URL, json=body())
    assert a.json()["error"]["code"] == "BAD_REQUEST" and b.json()["error"]["code"] == "BAD_REQUEST"
    assert d.status_code == 400 and d.json()["error"]["code"] == "BAD_DEVICE"
    assert app.state.provider.calls == 0


# ---- caps -------------------------------------------------------------------------------
async def test_out_of_energy_is_cap_device_but_a_hit_still_works(fake_app, cache_dir, client_for) -> None:
    app = fake_app(cache_dir=str(cache_dir), device_daily_cap=1)
    async with client_for(app) as c:
        first = await c.post(URL, json=body(), headers=hdr())
        miss = await c.post(URL, json=body(itemId="s2"), headers=hdr())
        hit = await c.post(URL, json=body(), headers=hdr())
    assert first.json()["energy"]["remaining"] == 0
    assert miss.status_code == 429 and miss.json()["error"]["code"] == "CAP_DEVICE"
    assert miss.json()["energy"]["remaining"] == 0
    assert hit.status_code == 200 and hit.json()["data"]["cached"] is True
    assert app.state.provider.calls == 1


async def test_global_cap_refunds_the_device(app, client_for, frozen_clock) -> None:
    app.state.energy = EnergyService(MemoryCounterStore(), device_cap=10, global_cap=0, clock=frozen_clock)
    async with client_for(app) as c:
        r = await c.post(URL, json=body(), headers=hdr())
    assert r.status_code == 503 and r.json()["error"]["code"] == "CAP_GLOBAL"
    assert r.json()["energy"]["remaining"] == 10
    assert app.state.provider.calls == 0


# ---- server error paths (refund on every failure) ---------------------------------------
class ScriptedProvider:
    name = "fake"
    model = "glitch/demo-nova"

    def __init__(self, text: str | None = None, exc: Exception | None = None) -> None:
        self.text, self.exc, self.calls = text, exc, 0
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.calls += 1
        self.requests.append(request)
        if self.exc is not None:
            raise self.exc
        return LLMResult(text=self.text or "", provider="fake", model_requested=self.model, model_used=self.model,
                         prompt_tokens=10, completion_tokens=5)

    async def aclose(self) -> None:
        return None


@pytest.mark.parametrize("provider, code, status", [
    (ScriptedProvider(exc=LLMProviderError("upstream 500")), "AI_UNAVAILABLE", 502),
    (ScriptedProvider(text="not json at all"), "AI_INVALID_OUTPUT", 502),
    (ScriptedProvider(text=json.dumps({"text": " ".join(["word"] * 61), "tip": "ok"})), "AI_INVALID_OUTPUT", 502),
    (ScriptedProvider(text=json.dumps({"text": "Go to www.cheat.com", "tip": "ok"})), "AI_INVALID_OUTPUT", 502),
    (ScriptedProvider(text=json.dumps({"text": "this is shit", "tip": "ok"})), "MODERATED", 502),
    (ScriptedProvider(exc=RuntimeError("bug")), "AI_UNAVAILABLE", 502),
])
async def test_failures_refund_and_store_nothing(app, client_for, cache_dir, log_path, provider, code, status) -> None:
    app.state.provider = provider
    async with client_for(app) as c:
        r = await c.post(URL, json=body(), headers=hdr())
    assert r.status_code == status
    out = r.json()
    assert out["error"]["code"] == code and out["energy"]["remaining"] == 10
    assert provider.calls == 1, "never retried"
    assert not stored(cache_dir).exists()
    req = provider.requests[0]
    assert (req.purpose, req.max_tokens, req.temperature, req.schema_name) == ("explain", 200, 0.3, "explanation")
    assert req.json_schema is not None and req.json_schema["required"] == ["text", "tip"]
    calls = [e for e in read_log(log_path) if e.get("event") == "llm_call"]
    assert len(calls) == 1 and calls[0]["cache"] == "miss" and calls[0]["error_code"] == code


async def test_store_failure_is_internal_and_refunds(app, client_for, cache_dir) -> None:
    class BrokenPut(LocalBlobStore):
        async def put(self, key: str, data: bytes, **kw: Any) -> int:  # type: ignore[override]
            if key.startswith("explanations"):
                raise StoreError("disk full")
            return await super().put(key, data, **kw)

    app.state.blob_store = BrokenPut(cache_dir)
    async with client_for(app) as c:
        r = await c.post(URL, json=body(), headers=hdr())
    assert r.status_code == 500 and r.json()["error"]["code"] == "INTERNAL"
    assert r.json()["energy"]["remaining"] == 10


async def test_invalid_stored_object_is_a_miss_and_is_overwritten(app, client_for, cache_dir) -> None:
    path = stored(cache_dir)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"gameId": "m1g2", "variationId": "v3", "itemId": "s0", "answer": "fib",
                                "text": "this is shit", "tip": "x", "model": "m", "promptVersion": 1, "createdAt": "x"}))
    async with client_for(app) as c:
        r = await c.post(URL, json=body(), headers=hdr())
    assert r.json()["data"]["cached"] is False and r.json()["energy"]["remaining"] == 9
    assert json.loads(path.read_text())["text"] == FIB_TEXT


async def test_follower_shares_the_leaders_failure_without_charge(fake_app, cache_dir, client_for) -> None:
    app = fake_app(cache_dir=str(cache_dir))

    class Slow(ScriptedProvider):
        async def complete(self, request: LLMRequest) -> LLMResult:
            await asyncio.sleep(0.1)
            return await super().complete(request)

    app.state.provider = Slow(exc=LLMProviderError("down"))
    async with client_for(app) as c:
        a, b = await asyncio.gather(c.post(URL, json=body(), headers=hdr()),
                                    c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[0])))
    assert {a.json()["error"]["code"], b.json()["error"]["code"]} == {"AI_UNAVAILABLE"}
    assert a.json()["energy"]["remaining"] == 10 and b.json()["energy"]["remaining"] == 10
    assert app.state.provider.calls == 1


# ---- logs, metrics, restart ---------------------------------------------------------------
async def test_logs_pass_check_logs_and_never_name_item_answer_or_variation(app, client_for, log_path) -> None:
    async with client_for(app) as c:
        await c.post(URL, json=body(), headers=hdr())
        await c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[0]))
        await c.post(URL, json=body(answer="true"), headers=hdr())
    raw = log_path.read_text()
    forbidden = ["Machine learning finds patterns", "That one is actually true", FAKE_TIP]
    failures, stats = check_log_lines(raw.splitlines(), forbidden, EXPLAIN_ROUTE)
    assert failures == [] and stats["cache_hit"] == 1 and stats["cache_miss"] == 1
    for entry in read_log(log_path):
        assert not {"item_id", "answer", "variation_id", "itemId", "variationId"} & set(entry)
    assert '"s0"' not in raw and '"fib"' not in raw


async def test_explanation_survives_a_restart(fake_app, cache_dir, client_for) -> None:
    first = fake_app(cache_dir=str(cache_dir))
    async with client_for(first) as c:
        await c.post(URL, json=body(), headers=hdr())
    second = fake_app(cache_dir=str(cache_dir))
    async with client_for(second) as c:
        r = await c.post(URL, json=body(), headers=hdr(OTHER_DEVICES[2]))
    assert r.json()["data"]["cached"] is True and r.json()["energy"]["remaining"] == 10
    assert second.state.provider.calls == 0
