"""OpenRouterProvider — one ``POST {base}/chat/completions`` per ``complete()`` call.

- Model fallback is OpenRouter-side: the body carries ``models: [primary, *fallbacks]``,
  so it stays ONE HTTP request; ``model_used`` is the ``model`` field OpenRouter returns.
- Total budget ``request.timeout_s`` (default 7 s) enforced around the whole request.
- ``max_tokens`` bounded by ``GLITCH_LLM_MAX_OUTPUT_TOKENS``.
- Zero app-level retries (spec: free-write latency budget).
- Error messages are fixed, actionable strings; never the key, the prompt or raw output.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Literal

import httpx

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

AUTH_MESSAGE = "OpenRouter key rejected — check GLITCH_OPENROUTER_API_KEY in .env"
MODEL_MESSAGE = "model slug not found — check GLITCH_OPENROUTER_MODEL"
SCHEMA_MESSAGE = (
    "no provider for this model supports json_schema — pick another slug or set "
    "GLITCH_OPENROUTER_RESPONSE_FORMAT=json_object"
)
RATE_MESSAGE = "OpenRouter rate limit hit"
CREDITS_MESSAGE = "OpenRouter account has insufficient credits"
TIMEOUT_MESSAGE = "OpenRouter did not answer within the time budget"
NETWORK_MESSAGE = "could not reach OpenRouter"


def _error_detail(payload: Any) -> str:
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            return str(err.get("message", ""))[:300].lower()
    return ""


def classify_status(status: int, detail: str, model: str) -> LLMError:
    """Map an upstream HTTP status (+ lower-cased error text) to an LLMError."""
    if status in (401, 403):
        return LLMAuthError(AUTH_MESSAGE, status=status, model=model)
    if status == 402:
        return LLMProviderError(CREDITS_MESSAGE, status=status, model=model)
    if status == 404 and ("endpoint" in detail or "parameter" in detail or "support" in detail):
        return LLMProviderError(SCHEMA_MESSAGE, status=status, model=model)
    if status == 404 or "not a valid model" in detail or "model not found" in detail:
        return LLMModelNotFoundError(MODEL_MESSAGE, status=status, model=model)
    if status == 408:
        return LLMTimeoutError(TIMEOUT_MESSAGE, status=status, model=model)
    if status == 429:
        return LLMRateLimitError(RATE_MESSAGE, status=status, model=model)
    return LLMProviderError(f"OpenRouter returned HTTP {status}", status=status, model=model)


def _as_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


class OpenRouterProvider:
    name: Literal["openrouter"] = "openrouter"

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not settings.has_openrouter_key:
            raise LLMAuthError("GLITCH_OPENROUTER_API_KEY missing — add it to .env")
        self.settings = settings
        self.model = settings.openrouter_model
        self.fallbacks = [m for m in settings.fallback_model_list if m != self.model]
        self.url = settings.openrouter_base_url.rstrip("/") + "/chat/completions"
        self._client = client or httpx.AsyncClient(transport=transport, timeout=settings.llm_timeout_s)

    def _headers(self) -> dict[str, str]:
        key = self.settings.openrouter_api_key
        assert key is not None
        return {
            "Authorization": f"Bearer {key.get_secret_value()}",
            "HTTP-Referer": self.settings.app_url,
            "X-Title": "GLITCH",
            "Content-Type": "application/json",
        }

    def build_body(self, request: LLMRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [m.model_dump() for m in request.messages],
            "max_tokens": min(request.max_tokens, self.settings.llm_max_output_tokens),
            "temperature": request.temperature,
            "provider": {"require_parameters": True},
        }
        if self.fallbacks:
            body["models"] = [self.model, *self.fallbacks]
        if request.json_schema is not None:
            if self.settings.openrouter_response_format == "json_schema":
                body["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": request.schema_name, "strict": True, "schema": request.json_schema},
                }
            else:
                body["response_format"] = {"type": "json_object"}
        return body

    async def complete(self, request: LLMRequest) -> LLMResult:
        body = self.build_body(request)
        timeout = request.timeout_s
        start = time.perf_counter()
        try:
            resp = await asyncio.wait_for(
                self._client.post(self.url, json=body, headers=self._headers(), timeout=timeout),
                timeout=timeout,
            )
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise LLMTimeoutError(TIMEOUT_MESSAGE, model=self.model) from exc
        except httpx.HTTPError as exc:
            raise LLMProviderError(f"{NETWORK_MESSAGE} ({type(exc).__name__})", model=self.model) from exc
        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        try:
            payload = resp.json()
        except ValueError:
            payload = None

        if resp.status_code != 200:
            raise classify_status(resp.status_code, _error_detail(payload), self.model)
        if not isinstance(payload, dict):
            raise LLMInvalidOutputError("OpenRouter returned a non-JSON body", model=self.model)
        if "error" in payload:
            # OpenRouter can answer 200 with an error object (upstream failure mid-route).
            err = payload["error"] if isinstance(payload["error"], dict) else {}
            code = err.get("code")
            raise classify_status(code if isinstance(code, int) else 502, _error_detail(payload), self.model)

        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            raise LLMInvalidOutputError("OpenRouter returned no choices", model=self.model)
        message = choices[0].get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise LLMInvalidOutputError("OpenRouter returned empty content", model=self.model)

        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        model_used = payload.get("model")
        return LLMResult(
            text=content,
            provider="openrouter",
            model_requested=self.model,
            model_used=str(model_used) if isinstance(model_used, str) and model_used else self.model,
            prompt_tokens=_as_int(usage.get("prompt_tokens")),
            completion_tokens=_as_int(usage.get("completion_tokens")),
            latency_ms=latency_ms,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
