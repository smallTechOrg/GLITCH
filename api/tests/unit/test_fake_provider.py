"""FakeProvider: deterministic demo NOVA dispatching on the purpose node tag."""

from __future__ import annotations

import json

import pytest

from glitch_api.heuristics.levers import ALL_FIVE_TIP, CANNED_TIPS
from glitch_api.llm.base import FAKE_MODEL_SLUG, LLMProviderError, LLMRequest, LLMTimeoutError
from glitch_api.llm.fake import DEMO_PREFIX, FakeProvider
from glitch_api.prompts.loader import PromptLibrary
from glitch_api.schemas.freewrite import LLMFreewriteOutput

STRONG = (
    "Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, "
    "who loves plants. Use 3 short bullet points. Keep it under 80 words."
)
GOAL = "Explain photosynthesis to a 10-year-old."


def _request(prompt: str, purpose: str = "freewrite_eval", timeout_s: float = 7.0) -> LLMRequest:
    return LLMRequest(
        messages=PromptLibrary().freewrite_messages(GOAL, prompt), purpose=purpose, timeout_s=timeout_s
    )


async def test_fake_provider_strong_prompt_scores_five_with_praise() -> None:
    result = await FakeProvider().complete(_request(STRONG))
    out = LLMFreewriteOutput.model_validate(json.loads(result.text))
    assert out.levers.hit_count() == 5
    assert out.tip == ALL_FIVE_TIP
    assert out.reply.startswith(DEMO_PREFIX + GOAL)
    assert result.provider == "fake"
    assert result.model_used == FAKE_MODEL_SLUG


async def test_fake_provider_one_word_prompt_scores_zero_with_task_tip() -> None:
    result = await FakeProvider().complete(_request("plants"))
    out = LLMFreewriteOutput.model_validate(json.loads(result.text))
    assert out.levers.hit_count() == 0
    assert out.tip == CANNED_TIPS["task"]


async def test_fake_provider_is_deterministic_and_counts_calls() -> None:
    provider = FakeProvider()
    a = await provider.complete(_request(STRONG))
    b = await provider.complete(_request(STRONG))
    assert a.text == b.text
    assert provider.calls == 2


async def test_fake_provider_unknown_purpose_is_provider_error() -> None:
    with pytest.raises(LLMProviderError):
        await FakeProvider().complete(_request("x", purpose="explain"))


async def test_fake_provider_latency_beyond_budget_times_out() -> None:
    with pytest.raises(LLMTimeoutError):
        await FakeProvider(latency_ms=200).complete(_request("plants", timeout_s=0.05))


async def test_fake_provider_latency_within_budget_succeeds() -> None:
    result = await FakeProvider(latency_ms=10).complete(_request("plants", timeout_s=1.0))
    assert result.latency_ms >= 10
