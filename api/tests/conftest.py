"""Shared pytest fixtures for the GLITCH API.

- Unit/integration tests are isolated from the developer's machine: every ``GLITCH_*``
  env var and ``PORT`` are removed and settings are built with ``_env_file=None`` so a
  repo-root ``.env`` can never change a unit result.
- ``live`` tests are NOT isolated: they read the real repo-root ``.env``. When ``-m``
  selects the live tier and the key is absent, the run exits 1 with PENDING-KEY instead
  of skipping (even before any live test exists).
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from glitch_api.config import Settings, get_settings, reset_settings
from glitch_api.main import create_app
from glitch_api.metrics import reset_metrics

PENDING_KEY_MESSAGE = "PENDING-KEY: GLITCH_OPENROUTER_API_KEY missing from .env"

# A valid UUID v4 device id for tests (never a real learner's).
TEST_DEVICE_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c"


def _selects_marker(markexpr: str, marker: str) -> bool:
    """True when ``-m <markexpr>`` would select a test carrying only ``marker``."""
    if not markexpr.strip():
        return False
    try:
        from _pytest.mark.expression import Expression

        return bool(Expression.compile(markexpr).evaluate(lambda name, *a, **kw: name == marker))
    except Exception:  # pragma: no cover — pytest internals moved; be conservative
        return marker in markexpr and f"not {marker}" not in markexpr


def pytest_sessionstart(session: pytest.Session) -> None:
    """``-m live`` with no key fails the run loudly (PENDING-KEY), never skips."""
    if not _selects_marker(session.config.option.markexpr or "", "live"):
        return
    reset_settings()
    if not get_settings().has_openrouter_key:
        pytest.exit(PENDING_KEY_MESSAGE, returncode=1)


@pytest.fixture(autouse=True)
def _isolate(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Reset singletons; strip GLITCH_* / PORT env vars for every non-live test."""
    if request.node.get_closest_marker("live") is None:
        for name in list(os.environ):
            if name.startswith("GLITCH_") or name == "PORT":
                monkeypatch.delenv(name, raising=False)
    reset_settings()
    reset_metrics()
    yield
    reset_settings()
    reset_metrics()


@pytest.fixture
def make_settings() -> Callable[..., Settings]:
    """Build Settings that ignore the repo-root .env: ``make_settings(llm_provider="fake")``."""

    def _make(**overrides: Any) -> Settings:
        return Settings(_env_file=None, **overrides)

    return _make


@pytest.fixture
def settings(make_settings: Callable[..., Settings]) -> Settings:
    """Default isolated settings (no key → provider resolves to ``fake``)."""
    return make_settings()


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """In-process HTTP client on the real ASGI app (no network)."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8787") as c:
        yield c


@pytest.fixture
def device_id() -> str:
    return TEST_DEVICE_ID


class FrozenClock:
    """Deterministic clock: ``now()`` → aware UTC datetime, ``monotonic()`` → float seconds."""

    def __init__(self, start: datetime) -> None:
        self._now = start
        self._mono = 1000.0

    def now(self) -> datetime:
        return self._now

    def monotonic(self) -> float:
        return self._mono

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)
        self._mono += seconds

    def set(self, when: datetime) -> None:
        self._now = when


@pytest.fixture
def frozen_clock() -> FrozenClock:
    """Frozen at 2026-10-19T12:00:00Z (UTC day boundary is 12 h away)."""
    return FrozenClock(datetime(2026, 10, 19, 12, 0, 0, tzinfo=UTC))
