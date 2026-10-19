"""Provider selection."""

from __future__ import annotations

from glitch_api.llm.factory import build_provider, get_provider, reset_provider
from glitch_api.llm.fake import FakeProvider
from glitch_api.llm.openrouter import OpenRouterProvider


def test_auto_without_key_selects_fake(make_settings) -> None:
    provider = build_provider(make_settings())
    assert isinstance(provider, FakeProvider)
    assert provider.name == "fake"


def test_auto_with_key_selects_openrouter(make_settings) -> None:
    provider = build_provider(make_settings(openrouter_api_key="sk-or-v1-test"))
    assert isinstance(provider, OpenRouterProvider)
    assert provider.model == "google/gemini-2.5-flash-lite"
    assert provider.fallbacks == ["openai/gpt-4o-mini"]


def test_fallback_list_drops_the_primary(make_settings) -> None:
    provider = build_provider(
        make_settings(openrouter_api_key="sk-or-v1-test", openrouter_fallback_models="google/gemini-2.5-flash-lite, x/y")
    )
    assert isinstance(provider, OpenRouterProvider)
    assert provider.fallbacks == ["x/y"]


def test_fake_latency_is_passed_through(make_settings) -> None:
    provider = build_provider(make_settings(fake_latency_ms=25))
    assert isinstance(provider, FakeProvider) and provider.latency_ms == 25


def test_get_provider_is_a_resettable_singleton(make_settings) -> None:
    settings = make_settings()
    try:
        assert get_provider(settings) is get_provider(settings)
        first = get_provider(settings)
        reset_provider()
        assert get_provider(settings) is not first
    finally:
        reset_provider()
