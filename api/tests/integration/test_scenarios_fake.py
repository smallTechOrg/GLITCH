"""``GET /v1/scenarios/{gameId}/next`` through the real ASGI app with the demo (fake) provider.

Happy path per game (content + cache state), second-device cache hit at zero energy, seen
exclusion, all-seen → generate, caps, bad inputs, metrics, logs (check_logs), and a
server restart (new app instance on the same cache directory).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI

from glitch_api.caps.budget import EnergyService
from glitch_api.caps.store import MemoryCounterStore
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.repository import DEMO_NAMESPACE, ScenarioRepository
from glitch_api.scenarios.schemas import GAME_IDS, parse_candidate, validate_data
from glitch_api.store import LocalBlobStore
from glitch_api.tools.check_logs import check as check_log_lines
from tests.conftest import TEST_DEVICE_ID
from tests.integration.conftest import OTHER_DEVICES, read_log

ROUTE = "/v1/scenarios/{game_id}/next"


def url(game_id: str, seen: list[str] | None = None) -> str:
    base = f"/v1/scenarios/{game_id}/next"
    return base + ("?seen=" + ",".join(seen) if seen is not None else "")


def hdr(device: str = TEST_DEVICE_ID) -> dict[str, str]:
    return {"X-Glitch-Device": device}


@pytest.fixture
def cache_dir(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
def app(fake_app, cache_dir: Path) -> FastAPI:
    return fake_app(cache_dir=str(cache_dir))


# ---- happy path -------------------------------------------------------------------------
@pytest.mark.parametrize("game_id", GAME_IDS)
async def test_first_request_generates_valid_case_file_and_caches_it(game_id, app, client_for, cache_dir) -> None:
    async with client_for(app) as c:
        r = await c.get(url(game_id), headers=hdr())
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    data = body["data"]
    assert set(data) == {"variationId", "gameId", "schemaVersion", "cached", "data"}
    assert data["gameId"] == game_id and data["schemaVersion"] == 1 and data["cached"] is False
    assert data["variationId"].startswith(f"{game_id}-") and len(data["variationId"]) == len(game_id) + 13
    assert data["data"] == parse_candidate(game_id, fake_scenario(game_id, 1))
    assert validate_data(game_id, data["data"]) == data["data"]
    assert body["energy"]["remaining"] == 9 and body["energy"]["limit"] == 10
    # cache state on disk (demo namespace — never served once the real AI is connected)
    obj_path = cache_dir / DEMO_NAMESPACE / game_id / f"{data['variationId']}.json"
    stored = json.loads(obj_path.read_text())
    assert stored["data"] == data["data"] and stored["model"] == "glitch/demo-nova"
    index = json.loads((cache_dir / DEMO_NAMESPACE / game_id / "index.json").read_text())
    assert [v["id"] for v in index["variations"]] == [data["variationId"]]
    assert not (cache_dir / "scenarios").exists()


async def test_second_device_gets_cache_hit_with_no_energy_spent(app, client_for) -> None:
    async with client_for(app) as c:
        first = (await c.get(url("m1g2"), headers=hdr())).json()
        second = (await c.get(url("m1g2", []), headers=hdr(OTHER_DEVICES[0]))).json()
        energy = (await c.get("/v1/energy", headers=hdr(OTHER_DEVICES[0]))).json()
        metrics = (await c.get("/v1/metrics")).json()["data"]
    assert second["ok"] is True and second["data"]["cached"] is True
    assert second["data"]["variationId"] == first["data"]["variationId"]
    assert second["data"]["data"] == first["data"]["data"]
    assert second["energy"]["remaining"] == 10 and energy["energy"]["remaining"] == 10
    assert app.state.provider.calls == 1
    assert metrics["cache_hits"] == 1 and metrics["cache_misses"] == 1 and metrics["cache_hit_rate"] == 0.5
    assert metrics["llm_calls_total"] == 1


async def test_device_never_receives_a_seen_variation(app, client_for) -> None:
    seen: list[str] = []
    async with client_for(app) as c:
        for n in range(1, 4):
            body = (await c.get(url("m4g2", seen), headers=hdr())).json()
            assert body["ok"] is True and body["data"]["cached"] is False
            assert body["data"]["variationId"] not in seen
            assert body["data"]["data"] == parse_candidate("m4g2", fake_scenario("m4g2", n))
            seen.append(body["data"]["variationId"])
        # another device that has seen only the first one gets the second from cache
        other = (await c.get(url("m4g2", seen[:1]), headers=hdr(OTHER_DEVICES[1]))).json()
    assert other["data"]["cached"] is True and other["data"]["variationId"] == seen[1]
    assert app.state.provider.calls == 3


async def test_seen_param_tolerates_spaces_and_empty_parts(app, client_for) -> None:
    async with client_for(app) as c:
        vid = (await c.get(url("m3g1"), headers=hdr())).json()["data"]["variationId"]
        r = await c.get(f"/v1/scenarios/m3g1/next?seen=%20{vid}%20,,", headers=hdr())
    assert r.json()["data"]["variationId"] != vid


async def test_cache_survives_server_restart(fake_app, client_for, cache_dir) -> None:
    async with client_for(fake_app(cache_dir=str(cache_dir))) as c:
        vid = (await c.get(url("m1g1"), headers=hdr())).json()["data"]["variationId"]
    restarted = fake_app(cache_dir=str(cache_dir))  # new process: fresh app, same blob root
    async with client_for(restarted) as c:
        body = (await c.get(url("m1g1"), headers=hdr(OTHER_DEVICES[2]))).json()
    assert body["data"]["cached"] is True and body["data"]["variationId"] == vid
    assert restarted.state.provider.calls == 0


# ---- caps + failures → ok:false (client plays v3) ---------------------------------------
async def test_out_of_energy_returns_cap_device_but_hits_still_free(fake_app, client_for, cache_dir, frozen_clock) -> None:
    app = fake_app(cache_dir=str(cache_dir))
    app.state.energy = EnergyService(MemoryCounterStore(), device_cap=1, global_cap=500, clock=frozen_clock)
    async with client_for(app) as c:
        vid = (await c.get(url("m1g2"), headers=hdr())).json()["data"]["variationId"]
        capped = await c.get(url("m1g2", [vid]), headers=hdr())
        hit = await c.get(url("m1g2"), headers=hdr())
    assert capped.status_code == 429
    assert capped.json() == {
        "ok": False,
        "error": {"code": "CAP_DEVICE", "message": "This device has used all of today's AI energy.", "retryable": False},
        "energy": {"remaining": 0, "limit": 1, "resetsAt": "2026-10-20T00:00:00Z"},
    }
    assert hit.status_code == 200 and hit.json()["data"]["cached"] is True


async def test_global_budget_spent_returns_cap_global(fake_app, client_for, cache_dir) -> None:
    app = fake_app(cache_dir=str(cache_dir), global_daily_cap=0)
    async with client_for(app) as c:
        r = await c.get(url("m4g1"), headers=hdr())
    assert r.status_code == 503 and r.json()["error"]["code"] == "CAP_GLOBAL"
    assert r.json()["energy"]["remaining"] == 10


async def test_demo_timeout_returns_ai_timeout(fake_app, client_for, cache_dir) -> None:
    app = fake_app(cache_dir=str(cache_dir), fake_latency_ms=3000, llm_timeout_s=0.5)
    async with client_for(app) as c:
        r = await c.get(url("m1g2"), headers=hdr())
    assert r.status_code == 504 and r.json()["error"]["code"] == "AI_TIMEOUT"
    assert r.json()["error"]["retryable"] is True and r.json()["energy"]["remaining"] == 10


async def test_exhausted_demo_pool_is_rejected_as_duplicate(app, client_for, cache_dir) -> None:
    """Case files cycle after 8: a 9th demo generation duplicates a seen one → ok:false."""
    seen: list[str] = []
    async with client_for(app) as c:
        for _ in range(8):
            seen.append((await c.get(url("m1g2", seen), headers=hdr(OTHER_DEVICES[len(seen) % 3]))).json()["data"]["variationId"])
        r = await c.get(url("m1g2", seen), headers=hdr())
    assert len(set(seen)) == 8
    assert r.status_code == 502 and r.json()["error"]["code"] == "AI_INVALID_OUTPUT"
    repo = ScenarioRepository(LocalBlobStore(cache_dir), DEMO_NAMESPACE)
    assert await repo.count("m1g2") == 8


# ---- bad requests -----------------------------------------------------------------------
async def test_missing_device_header(app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.get(url("m1g2"))
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_DEVICE" and "energy" not in r.json()


@pytest.mark.parametrize("game_id", ["m2g1", "m1g3", "M1G2", "freewrite"])
async def test_unknown_or_non_content_game(game_id, app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.get(url(game_id), headers=hdr())
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "BAD_REQUEST" and "m1g1" in r.json()["error"]["message"]
    assert r.json()["energy"]["remaining"] == 10


@pytest.mark.parametrize("seen", ["bad id!", "x" * 65, ",".join(f"m1g2-{i:012x}" for i in range(201)), "<script>"])
async def test_invalid_seen_list(seen, app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m1g2/next", params={"seen": seen}, headers=hdr())
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_REQUEST"
    assert app.state.provider.calls == 0


async def test_seen_list_of_200_unknown_ids_accepted(app, client_for) -> None:
    seen = ",".join(f"m1g2-{i:012x}" for i in range(200))
    async with client_for(app) as c:
        r = await c.get("/v1/scenarios/m1g2/next", params={"seen": seen}, headers=hdr())
    assert r.status_code == 200 and r.json()["data"]["cached"] is False


async def test_post_not_allowed(app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.post(url("m1g2"), headers=hdr())
    assert r.status_code == 405


async def test_cors_preflight_allows_device_header(app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.options(
            url("m1g2"),
            headers={
                "Origin": "http://127.0.0.1:8090",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Glitch-Device",
            },
        )
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == "http://127.0.0.1:8090"


# ---- observability + privacy ------------------------------------------------------------
async def test_logs_have_hit_and_miss_and_pass_check_logs(app, client_for, log_path) -> None:
    async with client_for(app) as c:
        vid = (await c.get(url("m1g2", ["m1g2-aaaaaaaaaaaa"]), headers=hdr())).json()["data"]["variationId"]
        await c.get(url("m1g2"), headers=hdr(OTHER_DEVICES[0]))
    lines = read_log(log_path)
    calls = [x for x in lines if x["event"] == "llm_call"]
    assert [x["cache"] for x in calls] == ["miss", "hit"]
    assert all(x["variation_id"] == vid for x in calls)
    requests = [x for x in lines if x["event"] == "request"]
    assert {x["route"] for x in requests} == {ROUTE} and all(x["status"] == 200 for x in requests)
    raw = log_path.read_text()
    assert "aaaaaaaaaaaa" not in raw  # seen ids are never logged
    sentence = fake_scenario("m1g2", 1)["sentences"][0]["text"]
    failures, stats = check_log_lines(raw.splitlines(), [sentence], route=ROUTE)
    assert failures == [] and stats["llm_call"] == 2 and stats["request"] == 2
