"""OpenRouterProvider over httpx.MockTransport (recorded-shape responses, no network)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from glitch_api.llm.base import (
    ChatMessage,
    LLMAuthError,
    LLMInvalidOutputError,
    LLMModelNotFoundError,
    LLMProviderError,
    LLMRateLimitError,
    LLMRequest,
    LLMTimeoutError,
)
from glitch_api.llm.openrouter import AUTH_MESSAGE, MODEL_MESSAGE, OpenRouterProvider
from glitch_api.schemas.freewrite import FREEWRITE_SCHEMA

TEST_KEY = "sk-or-v1-TESTKEYDONOTUSE0000000000000000"
PRIMARY = "google/gemini-2.5-flash-lite"
FALLBACK = "openai/gpt-4o-mini"


def _completion(content: Any, model: str = PRIMARY, usage: dict | None = None) -> dict[str, Any]:
    return {
        "id": "gen-1",
        "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
        "usage": usage if usage is not None else {"prompt_tokens": 400, "completion_tokens": 90},
    }


def _request(**overrides: Any) -> LLMRequest:
    base: dict[str, Any] = {
        "messages": [ChatMessage(role="system", content="sys"), ChatMessage(role="user", content="hi")],
        "purpose": "freewrite_eval",
        "json_schema": FREEWRITE_SCHEMA,
        "schema_name": "freewrite_eval",
        "max_tokens": 700,
        "timeout_s": 2.0,
    }
    base.update(overrides)
    return LLMRequest(**base)


@pytest.fixture
def make_provider(make_settings):
    def _make(handler, **overrides: Any) -> tuple[OpenRouterProvider, list[httpx.Request]]:
        seen: list[httpx.Request] = []

        async def wrapped(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            result = handler(request)
            if asyncio.iscoroutine(result):
                result = await result
            return result

        settings = make_settings(llm_provider="openrouter", openrouter_api_key=TEST_KEY, **overrides)
        return OpenRouterProvider(settings, transport=httpx.MockTransport(wrapped)), seen

    return _make


async def test_openrouter_sends_one_request_with_headers_fallbacks_and_schema(make_provider) -> None:
    provider, seen = make_provider(lambda r: httpx.Response(200, json=_completion("{}")))
    await provider.complete(_request())

    assert len(seen) == 1
    req = seen[0]
    assert str(req.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert req.headers["authorization"] == f"Bearer {TEST_KEY}"
    assert req.headers["x-title"] == "GLITCH"
    assert req.headers["http-referer"] == "https://smalltechorg.github.io/GLITCH/"
    body = json.loads(req.content)
    assert body["models"] == [PRIMARY, FALLBACK]
    assert body["model"] == PRIMARY
    assert body["max_tokens"] == 700
    assert body["temperature"] == 0.4
    assert body["provider"] == {"require_parameters": True}
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == FREEWRITE_SCHEMA
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]


async def test_openrouter_bounds_max_tokens_by_settings(make_provider) -> None:
    provider, seen = make_provider(lambda r: httpx.Response(200, json=_completion("{}")), llm_max_output_tokens=120)
    await provider.complete(_request(max_tokens=700))
    assert json.loads(seen[0].content)["max_tokens"] == 120


async def test_openrouter_json_object_mode_and_no_fallbacks(make_provider) -> None:
    provider, seen = make_provider(
        lambda r: httpx.Response(200, json=_completion("{}")),
        openrouter_response_format="json_object",
        openrouter_fallback_models="",
    )
    await provider.complete(_request())
    body = json.loads(seen[0].content)
    assert body["response_format"] == {"type": "json_object"}
    assert "models" not in body


async def test_openrouter_reads_model_used_and_usage(make_provider) -> None:
    provider, _ = make_provider(
        lambda r: httpx.Response(200, json=_completion('{"a":1}', model=FALLBACK, usage={"prompt_tokens": 11, "completion_tokens": 7}))
    )
    result = await provider.complete(_request())
    assert result.text == '{"a":1}'
    assert result.model_requested == PRIMARY
    assert result.model_used == FALLBACK
    assert (result.prompt_tokens, result.completion_tokens) == (11, 7)
    assert result.provider == "openrouter"


async def test_openrouter_missing_usage_defaults_to_zero(make_provider) -> None:
    provider, _ = make_provider(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]}))
    result = await provider.complete(_request())
    assert (result.prompt_tokens, result.completion_tokens) == (0, 0)
    assert result.model_used == PRIMARY


@pytest.mark.parametrize(
    ("status", "payload", "exc_type", "message"),
    [
        (401, {"error": {"message": "No auth credentials found", "code": 401}}, LLMAuthError, AUTH_MESSAGE),
        (403, {"error": {"message": "forbidden"}}, LLMAuthError, AUTH_MESSAGE),
        (404, {"error": {"message": "Model foo/bar does not exist"}}, LLMModelNotFoundError, MODEL_MESSAGE),
        (400, {"error": {"message": "foo/bar is not a valid model ID"}}, LLMModelNotFoundError, MODEL_MESSAGE),
        (429, {"error": {"message": "Rate limit exceeded"}}, LLMRateLimitError, None),
        (402, {"error": {"message": "Insufficient credits"}}, LLMProviderError, None),
        (500, {"error": {"message": "Internal"}}, LLMProviderError, None),
        (503, "not json", LLMProviderError, None),
    ],
)
async def test_openrouter_maps_http_errors(make_provider, status, payload, exc_type, message) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if isinstance(payload, str):
            return httpx.Response(status, text=payload)
        return httpx.Response(status, json=payload)

    provider, _ = make_provider(handler)
    with pytest.raises(exc_type) as info:
        await provider.complete(_request())
    assert info.value.code == "AI_UNAVAILABLE"
    assert info.value.outcome == "provider_error"
    assert info.value.status == status
    if message:
        assert info.value.message == message
    assert TEST_KEY not in str(info.value)


async def test_openrouter_404_no_endpoint_for_parameters_is_actionable(make_provider) -> None:
    provider, _ = make_provider(
        lambda r: httpx.Response(404, json={"error": {"message": "No endpoints found that can handle the requested parameters."}})
    )
    with pytest.raises(LLMProviderError) as info:
        await provider.complete(_request())
    assert not isinstance(info.value, LLMModelNotFoundError)
    assert "json_object" in info.value.message


async def test_openrouter_200_with_error_object_is_provider_error(make_provider) -> None:
    provider, _ = make_provider(lambda r: httpx.Response(200, json={"error": {"message": "upstream failed", "code": 502}}))
    with pytest.raises(LLMProviderError):
        await provider.complete(_request())


async def test_openrouter_read_timeout_maps_to_ai_timeout(make_provider) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=r)

    provider, _ = make_provider(handler)
    with pytest.raises(LLMTimeoutError) as info:
        await provider.complete(_request())
    assert info.value.code == "AI_TIMEOUT"
    assert info.value.outcome == "timeout"


async def test_openrouter_total_budget_enforced_on_slow_upstream(make_provider) -> None:
    async def handler(r: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1.0)
        return httpx.Response(200, json=_completion("{}"))

    provider, _ = make_provider(handler)
    loop = asyncio.get_running_loop()
    start = loop.time()
    with pytest.raises(LLMTimeoutError):
        await provider.complete(_request(timeout_s=0.05))
    assert loop.time() - start < 0.5


async def test_openrouter_network_error_is_provider_error(make_provider) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=r)

    provider, _ = make_provider(handler)
    with pytest.raises(LLMProviderError) as info:
        await provider.complete(_request())
    assert info.value.code == "AI_UNAVAILABLE"


@pytest.mark.parametrize(
    "payload",
    [
        {"choices": []},
        {"choices": [{"message": {"content": ""}}]},
        {"choices": [{"message": {"content": None}}]},
        {"choices": [{"message": {}}]},
    ],
)
async def test_openrouter_empty_or_missing_content_is_invalid_output(make_provider, payload) -> None:
    provider, _ = make_provider(lambda r: httpx.Response(200, json=payload))
    with pytest.raises(LLMInvalidOutputError) as info:
        await provider.complete(_request())
    assert info.value.code == "AI_INVALID_OUTPUT"


async def test_openrouter_non_json_200_body_is_invalid_output(make_provider) -> None:
    provider, _ = make_provider(lambda r: httpx.Response(200, text="<html>oops</html>"))
    with pytest.raises(LLMInvalidOutputError):
        await provider.complete(_request())


def test_openrouter_refuses_to_build_without_key(make_settings) -> None:
    with pytest.raises(LLMAuthError):
        OpenRouterProvider(make_settings(llm_provider="fake"))
