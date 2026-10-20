"""[live] One real generation per content game through schema → domain validation →
moderation → store, then a second device re-requests it: a cache hit that costs no energy
and no provider call.

Budget: one or two real OpenRouter calls per game — the first try plus at most one
validator-fed regeneration (the pipeline's normal ``MAX_ATTEMPTS``) — so at most 10
scenario calls, which with the 5 free-write calls stays inside the conftest
``MAX_LIVE_CALLS`` guard. The cache lives in a temp directory, so the developer's
``api/.cache`` is never touched.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from glitch_api.llm.factory import build_provider
from glitch_api.main import create_app
from glitch_api.moderation.filter import check as moderation_check
from glitch_api.moderation.filter import strip_links
from glitch_api.scenarios.pipeline import MAX_ATTEMPTS, ScenarioOptions
from glitch_api.scenarios.schemas import GAME_IDS, GAMES, validate_data
from glitch_api.tools.check_logs import check as check_log_lines
from tests.live.conftest import MAX_LIVE_CALLS, CountingProvider, live_calls, live_settings

pytestmark = pytest.mark.live

DEVICE_A = "5d0c8e1a-7b3f-4c2d-9e6a-0f1b2c3d4e5f"
DEVICE_B = "6e1d9f2b-8c4a-4d3e-af7b-1a2b3c4d5e6f"
ROUTE = "/v1/scenarios/{game_id}/next"
FREEWRITE_LIVE_CALLS = 5  # one call per test in test_freewrite_live.py


@pytest.fixture
async def live_scenario_app(tmp_path: Path, live_log: Path) -> AsyncIterator[tuple[httpx.AsyncClient, Any, Path]]:
    assert MAX_ATTEMPTS == 2, "budget assumes first try + one validator-fed regeneration"
    assert FREEWRITE_LIVE_CALLS + len(GAME_IDS) * MAX_ATTEMPTS <= MAX_LIVE_CALLS, "worst case must fit the live guard"
    settings = live_settings(tmp_path, log_file=str(live_log))
    assert settings.cache_path == tmp_path / "cache", "live tests must never use the repo's api/.cache"
    assert settings.resolved_provider == "openrouter", "live tests need the OpenRouter provider"
    app = create_app(settings)
    provider: Any = CountingProvider(build_provider(settings))
    app.state.provider = provider
    app.state.scenario_options = ScenarioOptions(
        max_tokens=settings.llm_max_output_tokens,
        timeout_s=settings.llm_timeout_s,
        deadline_s=settings.llm_timeout_s,
        max_attempts=MAX_ATTEMPTS,  # first try + at most one validator-fed regeneration
    )
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8787") as c:
            yield c, app, tmp_path / "cache"
    finally:
        await provider.aclose()


@pytest.mark.parametrize("game_id", GAME_IDS)
async def test_live_generation_validated_cached_then_free_hit(game_id: str, live_scenario_app, live_log: Path) -> None:
    client, _app, cache_dir = live_scenario_app
    calls_before = live_calls()

    first = await client.get(f"/v1/scenarios/{game_id}/next", headers={"X-Glitch-Device": DEVICE_A})
    payload = first.json()
    assert first.status_code == 200, f"{game_id}: live generation failed: {payload.get('error')}"
    used = live_calls() - calls_before
    assert 1 <= used <= MAX_ATTEMPTS, f"{game_id}: {used} provider calls (expected 1, or 2 with one regeneration)"
    data = payload["data"]
    assert data["cached"] is False and data["gameId"] == game_id and data["schemaVersion"] == 1
    assert validate_data(game_id, data["data"]) == data["data"]  # schema + domain, re-checked here
    for text in GAMES[game_id].texts(data["data"]):
        assert moderation_check(text).allowed and strip_links(text) == text
    assert payload["energy"]["remaining"] == 9

    stored = cache_dir / "scenarios" / game_id / f"{data['variationId']}.json"
    assert stored.is_file(), "a valid generation must be cached in the real (non-demo) namespace"

    second = await client.get(f"/v1/scenarios/{game_id}/next", headers={"X-Glitch-Device": DEVICE_B})
    hit = second.json()
    assert second.status_code == 200 and hit["data"]["cached"] is True
    assert hit["data"]["variationId"] == data["variationId"] and hit["data"]["data"] == data["data"]
    assert hit["energy"]["remaining"] == 10  # a cache hit costs no energy
    assert live_calls() == calls_before + used  # ... and no provider call

    metrics = (await client.get("/v1/metrics")).json()["data"]
    assert metrics["cache_hits"] >= 1 and metrics["cache_misses"] >= 1
    assert 0 < metrics["cache_hit_rate"] < 1

    lines = live_log.read_text().splitlines()
    failures, stats = check_log_lines(lines, [], route=ROUTE)
    assert failures == [], failures
    caches = {(line_cache) for line_cache in ('"cache": "hit"', '"cache": "miss"') if any(line_cache in ln for ln in lines)}
    assert caches == {'"cache": "hit"', '"cache": "miss"'}
