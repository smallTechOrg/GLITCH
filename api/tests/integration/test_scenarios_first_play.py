"""``GET /v1/scenarios/{gameId}/next?first=1`` — first play draws among v3 + cached case files.

Never generates and never charges energy: with nothing cached it is always ``NO_CASE_FILE``
(play v3); with cached variations both outcomes occur; seen ids are excluded; the setting
``first_play_random=false`` forces v3.
"""

from __future__ import annotations

import random
from pathlib import Path

import pytest
from fastapi import FastAPI

from glitch_api.scenarios.pipeline import pick_first_play
from tests.conftest import TEST_DEVICE_ID

GAME = "m1g2"
HDR = {"X-Glitch-Device": TEST_DEVICE_ID}


def first(seen: list[str] | None = None) -> str:
    return f"/v1/scenarios/{GAME}/next?first=1" + ("&seen=" + ",".join(seen) if seen else "")


@pytest.fixture
def app(fake_app, tmp_path: Path) -> FastAPI:
    return fake_app(cache_dir=str(tmp_path / "cache"))


async def _cache_one(c) -> str:
    """A replay request generates (and caches) one variation; returns its id."""
    r = await c.get(f"/v1/scenarios/{GAME}/next", headers=HDR)
    assert r.status_code == 200
    return r.json()["data"]["variationId"]


async def test_nothing_cached_answers_no_case_file_without_generating(app, client_for) -> None:
    async with client_for(app) as c:
        r = await c.get(first(), headers=HDR)
        metrics = (await c.get("/v1/metrics")).json()["data"]
    assert r.status_code == 404
    body = r.json()
    assert body["ok"] is False and body["error"]["code"] == "NO_CASE_FILE" and body["error"]["retryable"] is False
    assert body["energy"]["remaining"] == 10
    assert metrics["llm_calls_total"] == 0


async def test_cached_variation_is_drawn_sometimes_and_never_costs_energy(app, client_for) -> None:
    async with client_for(app) as c:
        vid = await _cache_one(c)  # 10 → 9
        outcomes = []
        for _ in range(40):
            r = await c.get(first(), headers=HDR)
            assert r.json()["energy"]["remaining"] == 9
            outcomes.append(r.json()["data"]["variationId"] if r.status_code == 200 else "classic")
        calls = (await c.get("/v1/metrics")).json()["data"]["llm_calls_total"]
    assert set(outcomes) == {vid, "classic"}  # P(one-sided over 40 fair draws) ≈ 2e-12
    assert calls == 1  # only the replay generated


async def test_seen_variation_is_excluded(app, client_for) -> None:
    async with client_for(app) as c:
        vid = await _cache_one(c)
        rs = [await c.get(first([vid]), headers=HDR) for _ in range(10)]
    assert all(r.status_code == 404 and r.json()["error"]["code"] == "NO_CASE_FILE" for r in rs)


async def test_setting_off_always_plays_classic(fake_app, tmp_path: Path, client_for) -> None:
    app = fake_app(cache_dir=str(tmp_path / "cache"), first_play_random=False)
    async with client_for(app) as c:
        await _cache_one(c)
        rs = [await c.get(first(), headers=HDR) for _ in range(10)]
    assert all(r.status_code == 404 for r in rs)


class _Repo:
    def __init__(self, ids: list[str]) -> None:
        self.ids = ids

    async def unseen_ids(self, game_id, seen):
        return [i for i in self.ids if i not in seen]

    async def get(self, game_id, vid):
        from glitch_api.scenarios.repository import StoredVariation

        return StoredVariation(vid, game_id, 1, "m", "t", "h", {"sentences": []})


async def test_draw_is_uniform_over_classic_plus_unseen() -> None:
    rng = random.Random(7)
    repo = _Repo(["a", "b", "c"])
    counts = {"a": 0, "b": 0, "c": 0, "classic": 0}
    for _ in range(4000):
        r = await pick_first_play(GAME, frozenset(), repo=repo, rng=rng)  # type: ignore[arg-type]
        counts[r.variation_id if r else "classic"] += 1
    assert all(900 <= n <= 1100 for n in counts.values()), counts
