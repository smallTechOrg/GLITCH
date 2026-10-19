"""Free-write pipeline (agent/freewrite.py) with scripted providers — no HTTP layer."""

from __future__ import annotations

import json
from typing import Any

import pytest

from glitch_api.agent.freewrite import STEPS, CallOptions, extract_json, parse_output, run_freewrite
from glitch_api.caps.budget import EnergyService
from glitch_api.caps.store import MemoryCounterStore
from glitch_api.llm.base import LLMRequest, LLMResult, LLMTimeoutError
from glitch_api.llm.fake import FakeProvider
from glitch_api.metrics import get_metrics
from glitch_api.prompts.loader import PromptLibrary
from glitch_api.schemas.freewrite import EvaluateRequest

DEV = "abc123abc123"
ALL_TRUE = {"task": True, "context": True, "role": True, "format": True, "limit": True}


class Scripted:
    """Provider returning a fixed text (or raising) and recording requests."""

    name = "openrouter"
    model = "google/gemini-2.5-flash-lite"

    def __init__(self, text: str | None = None, exc: Exception | None = None, model_used: str | None = None) -> None:
        self.text, self.exc, self.model_used = text, exc, model_used
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        if self.exc:
            raise self.exc
        return LLMResult(
            text=self.text or "",
            provider="openrouter",
            model_requested=self.model,
            model_used=self.model_used or self.model,
            prompt_tokens=10,
            completion_tokens=5,
            latency_ms=12.0,
        )

    async def aclose(self) -> None:
        return None


def _out(levers: dict[str, bool] | None = None, reply: str = "Plants eat light.", tip: str = "Nice.") -> str:
    return json.dumps({"reply": reply, "levers": levers or ALL_TRUE, "tip": tip})


def _req(prompt: str = "Explain photosynthesis to my class in 3 bullets") -> EvaluateRequest:
    return EvaluateRequest.model_validate({"goalId": "fw1", "goal": "Explain photosynthesis.", "prompt": prompt})


async def _run(provider: Any, clock, *, device_cap: int = 10, global_cap: int = 500, **kw: Any):
    energy = EnergyService(MemoryCounterStore(), device_cap=device_cap, global_cap=global_cap, clock=clock)
    state = await run_freewrite(
        _req(**kw), DEV, provider=provider, energy=energy, prompts=PromptLibrary(), clock=clock
    )
    return state, energy


def test_pipeline_steps_match_spec_order() -> None:
    assert [s.__name__ for s in STEPS] == ["check_budget", "build_messages", "call_llm", "parse_validate", "moderate", "finalize"]


async def test_pipeline_success_makes_one_call_and_charges_both_budgets(frozen_clock) -> None:
    provider = Scripted(_out())
    state, energy = await _run(provider, frozen_clock)
    assert state.error is None
    assert len(provider.requests) == 1
    req = provider.requests[0]
    assert req.purpose == "freewrite_eval" and req.max_tokens == 700 and req.temperature == 0.4 and req.timeout_s == 7.0
    assert req.json_schema is not None
    assert state.result is not None and state.result.passed is True and state.result.levers_hit == 5
    assert state.energy is not None and state.energy.remaining == 9
    assert await energy.global_remaining() == 499
    assert get_metrics().snapshot()["llm_calls_by_outcome"] == {"ok": 1}


@pytest.mark.parametrize(("hits", "passed"), [(5, True), (4, True), (3, False), (0, False)])
async def test_pass_is_computed_server_side_from_lever_count(frozen_clock, hits: int, passed: bool) -> None:
    keys = list(ALL_TRUE)
    levers = {k: i < hits for i, k in enumerate(keys)}
    # The model also "claims" a pass in an extra field — it must be ignored.
    text = json.dumps({"reply": "r", "levers": levers, "tip": "t", "passed": True, "leversHit": 5})
    state, _ = await _run(Scripted(text), frozen_clock)
    assert state.result is not None
    assert state.result.levers_hit == hits
    assert state.result.passed is passed


async def test_device_cap_stops_before_any_provider_call(frozen_clock) -> None:
    provider = Scripted(_out())
    energy = EnergyService(MemoryCounterStore(), device_cap=1, global_cap=500, clock=frozen_clock)
    await energy.charge_device(DEV)
    state = await run_freewrite(_req(), DEV, provider=provider, energy=energy, prompts=PromptLibrary(), clock=frozen_clock)
    assert state.error is not None and state.error.code == "CAP_DEVICE"
    assert provider.requests == []
    assert state.energy is not None and state.energy.remaining == 0
    assert get_metrics().llm_calls_total == 0


async def test_global_cap_stops_before_any_provider_call(frozen_clock) -> None:
    provider = Scripted(_out())
    state, _ = await _run(provider, frozen_clock, global_cap=0)
    assert state.error is not None and state.error.code == "CAP_GLOBAL"
    assert provider.requests == []


async def test_failed_call_charges_global_but_not_device(frozen_clock) -> None:
    state, energy = await _run(Scripted(exc=LLMTimeoutError("slow")), frozen_clock)
    assert state.error is not None and state.error.code == "AI_TIMEOUT"
    assert state.error.energy is not None and state.error.energy.remaining == 10
    assert await energy.global_remaining() == 499
    assert get_metrics().snapshot()["llm_calls_by_outcome"] == {"timeout": 1}


async def test_unexpected_provider_exception_is_ai_unavailable(frozen_clock) -> None:
    state, _ = await _run(Scripted(exc=RuntimeError("boom")), frozen_clock)
    assert state.error is not None and state.error.code == "AI_UNAVAILABLE"


@pytest.mark.parametrize(
    "text",
    ["not json at all", '{"reply": "r"}', json.dumps({"reply": "r", "levers": {**ALL_TRUE, "task": "yes"}, "tip": "t"})],
)
async def test_invalid_output_maps_to_ai_invalid_output(frozen_clock, text: str) -> None:
    state, _ = await _run(Scripted(text), frozen_clock)
    assert state.error is not None and state.error.code == "AI_INVALID_OUTPUT"
    assert state.energy is not None and state.energy.remaining == 10
    assert get_metrics().snapshot()["llm_calls_by_outcome"] == {"invalid_output": 1}


async def test_moderated_output_fails_closed(frozen_clock) -> None:
    state, _ = await _run(Scripted(_out(reply="That is a shit idea.")), frozen_clock)
    assert state.error is not None and state.error.code == "MODERATED"
    assert state.result is None
    assert state.energy is not None and state.energy.remaining == 10


async def test_links_are_stripped_from_reply(frozen_clock) -> None:
    state, _ = await _run(Scripted(_out(reply="Read https://example.com/photo for more.")), frozen_clock)
    assert state.result is not None
    assert "example.com" not in state.result.reply
    assert "[link removed]" in state.result.reply


async def test_model_used_reported_from_provider_fallback(frozen_clock) -> None:
    state, _ = await _run(Scripted(_out(), model_used="openai/gpt-4o-mini"), frozen_clock)
    assert state.result is not None and state.result.model == "openai/gpt-4o-mini"


async def test_call_options_are_forwarded(frozen_clock) -> None:
    provider = Scripted(_out())
    energy = EnergyService(MemoryCounterStore(), device_cap=10, global_cap=500, clock=frozen_clock)
    await run_freewrite(
        _req(), DEV, provider=provider, energy=energy, prompts=PromptLibrary(), clock=frozen_clock,
        options=CallOptions(max_tokens=123, timeout_s=3.5),
    )
    assert provider.requests[0].max_tokens == 123
    assert provider.requests[0].timeout_s == 3.5


async def test_fake_provider_end_to_end_through_pipeline(frozen_clock) -> None:
    strong = (
        "Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, "
        "who loves plants. Use 3 short bullet points. Keep it under 80 words."
    )
    state, _ = await _run(FakeProvider(), frozen_clock, prompt=strong)
    assert state.result is not None and state.result.passed is True and state.result.provider == "fake"
    state, _ = await _run(FakeProvider(), frozen_clock, prompt="plants")
    assert state.result is not None and state.result.passed is False and state.result.levers_hit == 0


def test_extract_json_strips_code_fences() -> None:
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_extract_json_salvages_first_object_from_prose() -> None:
    assert extract_json('Sure! Here it is: {"a": "b}"} and {"c": 2} trailing') == {"a": "b}"}


def test_extract_json_raises_when_no_object() -> None:
    with pytest.raises(ValueError):
        extract_json("no braces here")


def test_parse_output_rejects_json_array() -> None:
    with pytest.raises(ValueError):
        parse_output("[1, 2]")
