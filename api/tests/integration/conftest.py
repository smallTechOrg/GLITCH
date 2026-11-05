"""Integration helpers: the real ASGI app with an injected provider and frozen clock.

``openrouter_app(handler)`` wires a real ``OpenRouterProvider`` over ``httpx.MockTransport``
so every adapter path (status mapping, parsing, fallback ``model`` field) runs for real.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from glitch_api.llm.fake import FakeProvider
from glitch_api.llm.openrouter import OpenRouterProvider
from glitch_api.main import create_app

STRONG_PROMPT = (
    "Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, "
    "who loves plants. Use 3 short bullet points. Keep it under 80 words."
)
GOAL = "Explain photosynthesis to a 10-year-old."
TEST_KEY = "sk-or-v1-TESTKEYDONOTUSE0000000000000000"

OTHER_DEVICES = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-9222-222222222222",
    "33333333-3333-4333-a333-333333333333",
]


def body(prompt: str = STRONG_PROMPT, goal: str = GOAL, goal_id: str = "fw1") -> dict[str, str]:
    return {"goalId": goal_id, "goal": goal, "prompt": prompt}


def model_json(
    reply: str = "Plants make food from sunlight.",
    levers: dict[str, Any] | None = None,
    tip: str = "Great prompt!",
    **extra: Any,
) -> str:
    levers = levers if levers is not None else {"task": True, "context": True, "role": True, "format": True, "limit": True}
    return json.dumps({"reply": reply, "levers": levers, "tip": tip, **extra})


def completion(
    content: str | None,
    *,
    model: str = "google/gemini-2.5-flash-lite",
    prompt_tokens: int = 420,
    completion_tokens: int = 95,
) -> dict[str, Any]:
    return {
        "id": "gen-test",
        "model": model,
        "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }


class Recorder:
    """MockTransport handler wrapper that records every request body."""

    def __init__(self, handler: Callable[[httpx.Request], Any]) -> None:
        self.handler = handler
        self.requests: list[httpx.Request] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        result = self.handler(request)
        if hasattr(result, "__await__"):
            result = await result
        return result

    @property
    def bodies(self) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests]


def read_log(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


@asynccontextmanager
async def _client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8787") as c:
        yield c


@pytest.fixture
def log_path(tmp_path: Path) -> Path:
    return tmp_path / "api.log"


@pytest.fixture
def fake_app(make_settings, frozen_clock, log_path) -> Callable[..., FastAPI]:
    def _make(**overrides: Any) -> FastAPI:
        settings = make_settings(llm_provider="fake", log_file=str(log_path), **overrides)
        app = create_app(settings)
        app.state.clock = frozen_clock
        app.state.provider = FakeProvider(latency_ms=settings.fake_latency_ms)
        return app

    return _make


@pytest.fixture
def openrouter_app(make_settings, frozen_clock, log_path) -> Callable[..., tuple[FastAPI, Recorder]]:
    def _make(handler: Callable[[httpx.Request], Any], **overrides: Any) -> tuple[FastAPI, Recorder]:
        settings = make_settings(
            llm_provider="openrouter", openrouter_api_key=TEST_KEY, log_file=str(log_path), **overrides
        )
        app = create_app(settings)
        app.state.clock = frozen_clock
        recorder = Recorder(handler)
        app.state.provider = OpenRouterProvider(settings, transport=httpx.MockTransport(recorder))
        return app, recorder

    return _make


@pytest.fixture
def client_for() -> Callable[[FastAPI], Any]:
    return _client
