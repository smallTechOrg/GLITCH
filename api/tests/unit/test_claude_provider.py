"""AnthropicProvider (Claude) over a stub SDK client — no network."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import anthropic
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
from glitch_api.llm.claude import FALLBACK_BETA, WORKSPACE_HEADER, AnthropicProvider

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}


def _request(**overrides: Any) -> LLMRequest:
    fields: dict[str, Any] = {
        "messages": [ChatMessage(role="system", content="be brief"), ChatMessage(role="user", content="hi")],
        "purpose": "explain",
        "json_schema": SCHEMA,
        "timeout_s": 2.0,
    }
    fields.update(overrides)
    return LLMRequest(**fields)


def _response(text: str = '{"ok": true}', stop_reason: str = "end_turn", model: str = "claude-haiku-5-5") -> Any:
    return SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason,
        model=model,
        usage=SimpleNamespace(input_tokens=12, output_tokens=34),
    )


class StubClient:
    """Duck-types ``AsyncAnthropic``: records ``beta.messages.create`` kwargs."""

    def __init__(self, result: Any = None, exc: Exception | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.closed = False

        async def create(**kwargs: Any) -> Any:
            self.calls.append(kwargs)
            if exc is not None:
                raise exc
            return result if result is not None else _response()

        self.beta = SimpleNamespace(messages=SimpleNamespace(create=create))

    async def close(self) -> None:
        self.closed = True


def _status_error(cls: type[anthropic.APIStatusError], status: int) -> anthropic.APIStatusError:
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("boom", response=httpx.Response(status, request=req), body=None)


def test_missing_key_is_rejected(make_settings) -> None:
    with pytest.raises(LLMAuthError, match="GLITCH_ANTHROPIC_API_KEY"):
        AnthropicProvider(make_settings())


async def test_request_shape(make_settings) -> None:
    stub = StubClient()
    provider = AnthropicProvider(make_settings(anthropic_effort="medium", anthropic_max_tokens=2000), client=stub)

    result = await provider.complete(_request())

    call = stub.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert call["system"] == "be brief"
    assert call["messages"] == [{"role": "user", "content": "hi"}]
    assert call["max_tokens"] == 2000
    assert call["output_config"] == {"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}}
    assert "fallbacks" not in call and "betas" not in call  # Haiku 5.5 has no server-side fallback
    assert call["timeout"] == 2.0
    assert "temperature" not in call  # current Claude models reject sampling params

    assert result.text == '{"ok": true}'  # thinking block skipped
    assert result.provider == "anthropic"
    assert result.model_used == "claude-haiku-5-5"
    assert (result.prompt_tokens, result.completion_tokens) == (12, 34)


async def test_no_schema_means_no_format_and_no_system(make_settings) -> None:
    stub = StubClient()
    provider = AnthropicProvider(make_settings(), client=stub)

    await provider.complete(_request(json_schema=None, messages=[ChatMessage(role="user", content="hi")]))

    assert stub.calls[0]["output_config"] == {"effort": "low"}
    assert "system" not in stub.calls[0]


async def test_models_with_server_side_fallback_opt_in(make_settings) -> None:
    stub = StubClient(_response(model="claude-opus-4-8"))
    provider = AnthropicProvider(make_settings(anthropic_model="claude-opus-5-5"), client=stub)

    result = await provider.complete(_request())

    assert stub.calls[0]["fallbacks"] == "default" and stub.calls[0]["betas"] == [FALLBACK_BETA]
    assert result.model_used == "claude-opus-4-8"  # the fallback model that answered


def test_workspace_id_is_sent_as_a_header(make_settings) -> None:
    provider = AnthropicProvider(make_settings(anthropic_api_key="sk-ant-test", anthropic_workspace_id="wrkspc_x"))
    assert provider._client.default_headers[WORKSPACE_HEADER] == "wrkspc_x"
    plain = AnthropicProvider(make_settings(anthropic_api_key="sk-ant-test"))
    assert WORKSPACE_HEADER not in plain._client.default_headers


@pytest.mark.parametrize(
    ("stop_reason", "text", "error"),
    [
        ("refusal", "", LLMProviderError),
        ("max_tokens", '{"ok": tr', LLMInvalidOutputError),
        ("end_turn", "   ", LLMInvalidOutputError),
    ],
)
async def test_unusable_responses(make_settings, stop_reason: str, text: str, error: type[Exception]) -> None:
    provider = AnthropicProvider(make_settings(), client=StubClient(_response(text=text, stop_reason=stop_reason)))
    with pytest.raises(error):
        await provider.complete(_request())


@pytest.mark.parametrize(
    ("exc", "error"),
    [
        (_status_error(anthropic.AuthenticationError, 401), LLMAuthError),
        (_status_error(anthropic.PermissionDeniedError, 403), LLMAuthError),
        (_status_error(anthropic.NotFoundError, 404), LLMModelNotFoundError),
        (_status_error(anthropic.RateLimitError, 429), LLMRateLimitError),
        (_status_error(anthropic.InternalServerError, 500), LLMProviderError),
        (anthropic.APITimeoutError(request=httpx.Request("POST", "https://x")), LLMTimeoutError),
        (anthropic.APIConnectionError(request=httpx.Request("POST", "https://x")), LLMProviderError),
    ],
)
async def test_sdk_errors_map_to_llm_errors(make_settings, exc: Exception, error: type[Exception]) -> None:
    provider = AnthropicProvider(make_settings(), client=StubClient(exc=exc))
    with pytest.raises(error) as info:
        await provider.complete(_request())
    assert "sk-ant" not in str(info.value)


async def test_aclose_closes_the_client(make_settings) -> None:
    stub = StubClient()
    await AnthropicProvider(make_settings(), client=stub).aclose()
    assert stub.closed
