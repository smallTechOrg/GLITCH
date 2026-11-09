"""AnthropicProvider — one Claude Messages API call per ``complete()`` call.

- Uses the official ``anthropic`` SDK (async client) with SDK retries off: one
  ``complete()`` is one request, and the fallback chain (``llm/fallback.py``) decides
  what happens on failure.
- ``system`` messages become the top-level ``system`` prompt; the rest go in ``messages``.
- JSON output uses structured outputs (``output_config.format``), so the text block is
  schema-valid JSON.
- Current Claude models think adaptively; ``GLITCH_ANTHROPIC_EFFORT`` sets the depth.
  Thinking shares ``max_tokens`` with the answer, so the cap is ``GLITCH_ANTHROPIC_MAX_TOKENS``.
- ``GLITCH_ANTHROPIC_WORKSPACE_ID`` is sent as ``anthropic-workspace-id`` (required for
  keys that are not scoped to one workspace).
- No ``temperature``: current Claude models reject sampling parameters.
- On models that support it, server-side refusal fallback is on (``fallbacks: "default"``):
  a declined request is re-run on Anthropic's recommended fallback model inside the same
  call. Claude Haiku 5.5 has none; a refusal there goes to the OpenRouter backup.
- Error messages are fixed, actionable strings; never the key, the prompt or raw output.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Literal

import anthropic

from glitch_api.config import Settings
from glitch_api.llm.base import (
    LLMAuthError,
    LLMError,
    LLMInvalidOutputError,
    LLMModelNotFoundError,
    LLMProviderError,
    LLMRateLimitError,
    LLMRequest,
    LLMResult,
    LLMTimeoutError,
)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
# Models that accept ``fallbacks: "default"`` on the Claude API.
SERVER_FALLBACK_MODELS = frozenset(
    {"claude-fable-5-1", "claude-fable-5", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
)
WORKSPACE_HEADER = "anthropic-workspace-id"

MISSING_KEY_MESSAGE = "GLITCH_ANTHROPIC_API_KEY missing — add it to .env"
AUTH_MESSAGE = "Anthropic key rejected — check GLITCH_ANTHROPIC_API_KEY in .env"
MODEL_MESSAGE = "Claude model not found — check GLITCH_ANTHROPIC_MODEL"
RATE_MESSAGE = "Anthropic rate limit hit"
TIMEOUT_MESSAGE = "Anthropic did not answer within the time budget"
NETWORK_MESSAGE = "could not reach Anthropic"
REFUSAL_MESSAGE = "Claude declined the request"
TRUNCATED_MESSAGE = "Claude hit max_tokens before finishing — raise GLITCH_ANTHROPIC_MAX_TOKENS"
EMPTY_MESSAGE = "Anthropic returned empty content"


def _usage_int(usage: Any, field: str) -> int:
    try:
        return max(0, int(getattr(usage, field, 0) or 0))
    except (TypeError, ValueError):
        return 0


class AnthropicProvider:
    name: Literal["anthropic"] = "anthropic"

    def __init__(self, settings: Settings, *, client: Any | None = None) -> None:
        if client is None and not settings.has_anthropic_key:
            raise LLMAuthError(MISSING_KEY_MESSAGE)
        self.settings = settings
        self.model = settings.anthropic_model
        if client is None:
            key = settings.anthropic_api_key
            assert key is not None
            headers = {WORKSPACE_HEADER: settings.anthropic_workspace_id} if settings.anthropic_workspace_id else None
            client = anthropic.AsyncAnthropic(
                api_key=key.get_secret_value(),
                max_retries=0,
                timeout=settings.llm_timeout_s,
                default_headers=headers,
            )
        self._client = client

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        system = "\n\n".join(m.content for m in request.messages if m.role == "system")
        messages = [{"role": m.role, "content": m.content} for m in request.messages if m.role != "system"]
        output_config: dict[str, Any] = {"effort": self.settings.anthropic_effort}
        if request.json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": request.json_schema}
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.settings.anthropic_max_tokens,
            "messages": messages,
            "output_config": output_config,
        }
        if self.model in SERVER_FALLBACK_MODELS:
            params["betas"] = [FALLBACK_BETA]
            params["fallbacks"] = "default"
        if system:
            params["system"] = system
        return params

    def _map_error(self, exc: Exception) -> LLMError:
        model = self.model
        # APITimeoutError subclasses APIConnectionError: check it first.
        if isinstance(exc, anthropic.APITimeoutError | TimeoutError):
            return LLMTimeoutError(TIMEOUT_MESSAGE, model=model)
        if isinstance(exc, anthropic.APIConnectionError):
            return LLMProviderError(f"{NETWORK_MESSAGE} ({type(exc).__name__})", model=model)
        if isinstance(exc, anthropic.AuthenticationError | anthropic.PermissionDeniedError):
            return LLMAuthError(AUTH_MESSAGE, status=exc.status_code, model=model)
        if isinstance(exc, anthropic.NotFoundError):
            return LLMModelNotFoundError(MODEL_MESSAGE, status=exc.status_code, model=model)
        if isinstance(exc, anthropic.RateLimitError):
            return LLMRateLimitError(RATE_MESSAGE, status=exc.status_code, model=model)
        if isinstance(exc, anthropic.APIStatusError):
            return LLMProviderError(f"Anthropic returned HTTP {exc.status_code}", status=exc.status_code, model=model)
        return LLMProviderError(f"Anthropic call failed ({type(exc).__name__})", model=model)

    async def complete(self, request: LLMRequest) -> LLMResult:
        params = self.build_params(request)
        timeout = request.timeout_s
        start = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._client.beta.messages.create(**params, timeout=timeout), timeout=timeout
            )
        except (anthropic.AnthropicError, TimeoutError) as exc:
            raise self._map_error(exc) from exc
        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        stop_reason = getattr(response, "stop_reason", None)
        if stop_reason == "refusal":
            # The whole server-side fallback chain declined; let the OpenRouter backup try.
            raise LLMProviderError(REFUSAL_MESSAGE, model=self.model)
        if stop_reason == "max_tokens":
            raise LLMInvalidOutputError(TRUNCATED_MESSAGE, model=self.model)

        text = "".join(
            getattr(block, "text", "") for block in (response.content or []) if getattr(block, "type", None) == "text"
        )
        if not text.strip():
            raise LLMInvalidOutputError(EMPTY_MESSAGE, model=self.model)

        usage = getattr(response, "usage", None)
        model_used = getattr(response, "model", None)
        return LLMResult(
            text=text,
            provider="anthropic",
            model_requested=self.model,
            model_used=str(model_used) if isinstance(model_used, str) and model_used else self.model,
            prompt_tokens=_usage_int(usage, "input_tokens"),
            completion_tokens=_usage_int(usage, "output_tokens"),
            latency_ms=latency_ms,
        )

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()
