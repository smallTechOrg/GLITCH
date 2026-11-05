"""Provider selection: ``settings.resolved_provider`` → OpenRouterProvider | FakeProvider.

``get_provider(settings)`` / ``reset_provider()`` is the process singleton; the HTTP
routes use ``provider_for(app)``, which keeps one provider per app instance (tests inject
``app.state.provider`` — e.g. an OpenRouterProvider over ``httpx.MockTransport``).
"""

from __future__ import annotations

from typing import Any

from glitch_api.config import Settings
from glitch_api.llm.base import LLMProvider
from glitch_api.llm.fake import FakeProvider
from glitch_api.llm.openrouter import OpenRouterProvider


def build_provider(settings: Settings) -> LLMProvider:
    if settings.resolved_provider == "openrouter":
        return OpenRouterProvider(settings)
    return FakeProvider(latency_ms=settings.fake_latency_ms)


_provider: LLMProvider | None = None


def get_provider(settings: Settings) -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = build_provider(settings)
    return _provider


def reset_provider() -> None:
    global _provider
    _provider = None


def provider_for(app: Any) -> LLMProvider:
    provider = getattr(app.state, "provider", None)
    if provider is None:
        provider = build_provider(app.state.settings)
        app.state.provider = provider
    return provider
