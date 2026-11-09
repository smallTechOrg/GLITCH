"""FallbackProvider: Claude first, OpenRouter on provider failure, shared time budget."""

from __future__ import annotations

import asyncio

import pytest

from glitch_api.llm.base import (
    ChatMessage,
    LLMAuthError,
    LLMInvalidOutputError,
    LLMProviderError,
    LLMRequest,
    LLMResult,
    LLMTimeoutError,
)
from glitch_api.llm.fallback import FallbackProvider


class Scripted:
    def __init__(self, name: str, *, exc: Exception | None = None, delay_s: float = 0.0) -> None:
        self.name = name
        self.model = f"{name}-model"
        self.exc = exc
        self.delay_s = delay_s
        self.timeouts: list[float] = []
        self.closed = False

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.timeouts.append(request.timeout_s)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.exc is not None:
            raise self.exc
        return LLMResult(text="{}", provider=self.name, model_requested=self.model, model_used=self.model)  # type: ignore[arg-type]

    async def aclose(self) -> None:
        self.closed = True


def _request(timeout_s: float = 7.0) -> LLMRequest:
    return LLMRequest(messages=[ChatMessage(role="user", content="hi")], purpose="explain", timeout_s=timeout_s)


async def test_primary_success_skips_the_backup() -> None:
    primary, backup = Scripted("anthropic"), Scripted("openrouter")
    chain = FallbackProvider(primary, backup)

    result = await chain.complete(_request())

    assert result.provider == "anthropic"
    assert backup.timeouts == []
    assert primary.timeouts == [pytest.approx(7.0 * 0.6)]
    assert (chain.name, chain.model) == ("anthropic", "anthropic-model")


@pytest.mark.parametrize("exc", [LLMProviderError("down"), LLMTimeoutError("slow"), LLMAuthError("bad key")])
async def test_provider_failure_falls_back_with_the_remaining_budget(exc: Exception) -> None:
    primary, backup = Scripted("anthropic", exc=exc), Scripted("openrouter")

    result = await FallbackProvider(primary, backup).complete(_request())

    assert result.provider == "openrouter"
    assert 6.5 < backup.timeouts[0] <= 7.0


async def test_invalid_output_is_not_retried_on_the_backup() -> None:
    primary, backup = Scripted("anthropic", exc=LLMInvalidOutputError("junk")), Scripted("openrouter")

    with pytest.raises(LLMInvalidOutputError):
        await FallbackProvider(primary, backup).complete(_request())
    assert backup.timeouts == []


async def test_no_time_left_raises_the_primary_error() -> None:
    primary = Scripted("anthropic", exc=LLMTimeoutError("slow"), delay_s=0.05)
    backup = Scripted("openrouter")

    with pytest.raises(LLMTimeoutError):
        await FallbackProvider(primary, backup, primary_share=1.0).complete(_request(timeout_s=1.0))
    assert backup.timeouts == []


async def test_backup_errors_propagate() -> None:
    primary = Scripted("anthropic", exc=LLMProviderError("down"))
    backup = Scripted("openrouter", exc=LLMProviderError("also down"))

    with pytest.raises(LLMProviderError, match="also down"):
        await FallbackProvider(primary, backup).complete(_request())


async def test_aclose_closes_both() -> None:
    primary, backup = Scripted("anthropic"), Scripted("openrouter")
    await FallbackProvider(primary, backup).aclose()
    assert primary.closed and backup.closed


def test_primary_share_is_validated() -> None:
    with pytest.raises(ValueError):
        FallbackProvider(Scripted("a"), Scripted("b"), primary_share=0)
