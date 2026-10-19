"""Provider protocol + DTOs (FROZEN for Phase 1 — slice D implements against these).

One ``complete()`` call == one HTTP request to the provider == one artifact.
Providers raise the ``LLMError`` subclasses below; each carries the envelope ``code``
and the ``llm_call`` log ``outcome`` it maps to. Error messages never contain the key,
the learner's prompt or the model's raw output.
"""

from __future__ import annotations

from typing import Any, ClassVar, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

# Model slug reported by /healthz and by FakeProvider results.
FAKE_MODEL_SLUG = "glitch/demo-nova"

Purpose = Literal["freewrite_eval", "scenario_gen", "explain"]
LLMOutcome = Literal["ok", "timeout", "provider_error", "invalid_output", "moderated"]


class ChatMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: Literal["system", "user", "assistant"]
    content: str


class LLMRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: list[ChatMessage]
    purpose: Purpose
    json_schema: dict[str, Any] | None = None  # JSON Schema of the expected object, or None
    schema_name: str = "output"  # response_format.json_schema.name
    max_tokens: int = Field(default=700, gt=0)
    temperature: float = Field(default=0.4, ge=0.0, le=2.0)
    timeout_s: float = Field(default=7.0, gt=0.0)  # total budget for this one call


class LLMResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    text: str  # raw assistant content (JSON text when json_schema was given)
    provider: Literal["openrouter", "fake"]
    model_requested: str
    model_used: str  # what the provider actually served (OpenRouter fallback may differ)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0


class LLMError(Exception):
    """Base provider failure. ``code`` = envelope error code, ``outcome`` = log outcome."""

    code: ClassVar[str] = "AI_UNAVAILABLE"
    outcome: ClassVar[LLMOutcome] = "provider_error"

    def __init__(self, message: str, *, status: int | None = None, model: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status  # upstream HTTP status, if any
        self.model = model


class LLMTimeoutError(LLMError):
    code = "AI_TIMEOUT"
    outcome = "timeout"


class LLMProviderError(LLMError):
    """Upstream 4xx/5xx, network failure, no model available."""


class LLMAuthError(LLMProviderError):
    """401/403 — 'OpenRouter key rejected — check GLITCH_OPENROUTER_API_KEY in .env'."""


class LLMModelNotFoundError(LLMProviderError):
    """404 / invalid slug — 'model slug not found — check GLITCH_OPENROUTER_MODEL'."""


class LLMRateLimitError(LLMProviderError):
    """429 from the provider."""


class LLMInvalidOutputError(LLMError):
    """Response arrived but is unusable (empty content / unparseable)."""

    code = "AI_INVALID_OUTPUT"
    outcome = "invalid_output"


@runtime_checkable
class LLMProvider(Protocol):
    name: Literal["openrouter", "fake"]
    model: str  # primary model slug

    async def complete(self, request: LLMRequest) -> LLMResult:
        """Exactly one provider call. Raises an ``LLMError`` subclass on failure."""
        ...

    async def aclose(self) -> None:
        """Release network resources (no-op for the fake provider)."""
        ...
