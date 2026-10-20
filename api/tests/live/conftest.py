"""Live tier: the real app, the real OpenRouter key from the repo-root .env.

Budget guard: every provider call goes through ``CountingProvider``; the session fails
loudly if more than ``MAX_LIVE_CALLS`` real calls are attempted (paid key, small credit).
The key itself is never read here — Settings loads it as a SecretStr.

Isolation: live apps read the real ``.env`` for the key, but their blob store (durable
energy counters + scenario cache) is always a local directory under the test's tmp_path —
never the repo's ``api/.cache`` (which a running dev server uses) and never a bucket.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from glitch_api.config import Settings
from glitch_api.llm.base import LLMProvider, LLMRequest, LLMResult
from glitch_api.llm.factory import build_provider
from glitch_api.main import create_app

MAX_LIVE_CALLS = 15  # 5 free-write + 5 scenario generations + headroom for validator-fed regenerations
_calls = {"n": 0}


class CountingProvider:
    def __init__(self, inner: LLMProvider) -> None:
        self.inner = inner
        self.name = inner.name
        self.model = inner.model

    async def complete(self, request: LLMRequest) -> LLMResult:
        if _calls["n"] >= MAX_LIVE_CALLS:
            pytest.fail(f"live budget guard: more than {MAX_LIVE_CALLS} real calls in one run")
        _calls["n"] += 1
        return await self.inner.complete(request)

    async def aclose(self) -> None:
        await self.inner.aclose()


def live_calls() -> int:
    return _calls["n"]


@pytest.fixture
def live_log(tmp_path: Path) -> Path:
    return tmp_path / "live-api.log"


def live_settings(tmp_path: Path, **overrides: Any) -> Settings:
    """Settings from the real ``.env`` with the blob store forced to an isolated tmp dir."""
    isolated: dict[str, Any] = {
        "env": "dev",  # a prod .env would (correctly) refuse the local backend at startup
        "blob_backend": "local",
        "cache_dir": str(tmp_path / "cache"),
        "blob_prefix": "",
        "gcs_bucket": None,
    }
    isolated.update(overrides)
    return Settings(**isolated)


@pytest.fixture
def live_cache_dir(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
async def live_client(live_log: Path, live_cache_dir: Path) -> AsyncIterator[httpx.AsyncClient]:
    settings = live_settings(live_cache_dir.parent, log_file=str(live_log))
    assert settings.cache_path == live_cache_dir, "live tests must never use the repo's api/.cache"
    assert settings.resolved_provider == "openrouter", "live tests need the OpenRouter provider"
    app = create_app(settings)
    provider: Any = CountingProvider(build_provider(settings))
    app.state.provider = provider
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8787") as c:
            yield c
    finally:
        await provider.aclose()


def pytest_terminal_summary(terminalreporter: Any) -> None:
    if _calls["n"]:
        terminalreporter.write_line(f"live OpenRouter calls this run: {_calls['n']} (cap {MAX_LIVE_CALLS})")
