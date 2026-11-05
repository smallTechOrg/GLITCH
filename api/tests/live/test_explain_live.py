"""[live] Ask NOVA why with the real OpenRouter key — exactly 2 provider calls.

Two real explanations: an m1g2 Fact or Fib v3 mistake (``s0``/``fib``) and the m4g3
``ship``/``well`` mistake. Each is word-limited, moderated and stored, and the repeat ask
from a second device is a free cache hit (``cached: true``, energy unchanged, no call).
The cache lives in a temp directory, never the developer's ``api/.cache``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from glitch_api.explain.schemas import TEXT_MAX_CHARS, TEXT_MAX_WORDS, TIP_MAX_CHARS, TIP_MAX_WORDS
from glitch_api.llm.factory import build_provider
from glitch_api.main import create_app
from glitch_api.moderation.filter import check as moderation_check
from glitch_api.tools.check_logs import EXPLAIN_ROUTE
from glitch_api.tools.check_logs import check as check_log_lines
from tests.live.conftest import CountingProvider, live_settings

pytestmark = pytest.mark.live

DEVICE_A = "7a2e0f3c-9d5b-4e4f-b08c-2b3c4d5e6f70"
DEVICE_B = "8b3f1a4d-0e6c-4f5a-81ad-3c4d5e6f7081"
CASES = [
    {"gameId": "m1g2", "variationId": "v3", "itemId": "s0", "answer": "fib"},
    {"gameId": "m4g3", "variationId": "v3", "itemId": "ship", "answer": "well"},
]
EXPECTED_CALLS = 2


class LocalCount(CountingProvider):
    def __init__(self, inner: Any) -> None:
        super().__init__(inner)
        self.calls = 0

    async def complete(self, request):  # type: ignore[no-untyped-def]
        self.calls += 1
        if self.calls > EXPECTED_CALLS:
            pytest.fail(f"explain live budget: more than {EXPECTED_CALLS} provider calls")
        return await super().complete(request)


async def test_two_real_explanations_then_free_hits(tmp_path: Path, live_log: Path) -> None:
    import httpx

    settings = live_settings(tmp_path, log_file=str(live_log))
    assert settings.cache_path == tmp_path / "cache", "live tests must never use the repo's api/.cache"
    assert settings.resolved_provider == "openrouter", "live tests need the OpenRouter provider"
    app = create_app(settings)
    provider = LocalCount(build_provider(settings))
    app.state.provider = provider
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8787") as c:
            for case in CASES:
                miss = await c.post("/v1/explain", json=case, headers={"X-Glitch-Device": DEVICE_A})
                out = miss.json()
                assert miss.status_code == 200, out.get("error")
                data = out["data"]
                assert data["cached"] is False and data["provider"] == "openrouter"
                assert 1 <= len(data["text"].split()) <= TEXT_MAX_WORDS and len(data["text"]) <= TEXT_MAX_CHARS
                assert 1 <= len(data["tip"].split()) <= TIP_MAX_WORDS and len(data["tip"]) <= TIP_MAX_CHARS
                assert moderation_check(data["text"]).allowed and moderation_check(data["tip"]).allowed
                obj_path = (tmp_path / "cache" / "explanations" / case["gameId"] / "v3" / case["itemId"]
                            / f"{case['answer']}.json")
                assert json.loads(obj_path.read_text())["text"] == data["text"]

                before = (await c.get("/v1/energy", headers={"X-Glitch-Device": DEVICE_B})).json()["energy"]["remaining"]
                hit = await c.post("/v1/explain", json=case, headers={"X-Glitch-Device": DEVICE_B})
                assert hit.json()["data"]["cached"] is True and hit.json()["data"]["text"] == data["text"]
                assert hit.json()["energy"]["remaining"] == before
    finally:
        await provider.aclose()
    assert provider.calls == EXPECTED_CALLS
    failures, stats = check_log_lines(live_log.read_text().splitlines(), [], EXPLAIN_ROUTE)
    assert failures == [] and stats["cache_hit"] == 2 and stats["cache_miss"] == 2
