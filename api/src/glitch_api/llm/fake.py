"""FakeProvider — deterministic demo NOVA (no key, no network).

Selected by ``GLITCH_LLM_PROVIDER=auto`` only when no key is set; forbidden in prod
(``Settings.startup_check``). It dispatches on the injected node tag for the request's
purpose (``<node:freewrite_eval>``, ``<node:scenario_gen>``), never on prose keywords. For free-write it reads the
goal and learner prompt from their delimiter tags, scores levers with the shared lever cue
rules, and returns JSON in exactly the shape the real model must produce.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections.abc import Callable
from typing import Literal

from glitch_api.heuristics.levers import canned_tip, evaluate_levers
from glitch_api.llm.base import (
    FAKE_MODEL_SLUG,
    LLMProviderError,
    LLMRequest,
    LLMResult,
    LLMTimeoutError,
)

DEMO_PREFIX = "[DEMO NOVA] Here's my answer to your prompt about: "
DEMO_PARAGRAPH = (
    "This is a practice answer from demo NOVA, because the live AI is not connected right now. "
    "A real NOVA would follow your prompt word for word, so the clearer your task, context, "
    "role, format and limit, the closer the answer gets to what you wanted."
)

_GOAL = re.compile(r"<goal>(.*?)</goal>", re.DOTALL)
_PROMPT = re.compile(r"<learner_prompt>\n?(.*?)\n?</learner_prompt>", re.DOTALL)


def node_tag(purpose: str) -> str:
    return f"<node:{purpose}>"


def _user_text(request: LLMRequest) -> str:
    return "\n".join(m.content for m in request.messages if m.role == "user")


def _freewrite_eval(request: LLMRequest) -> str:
    text = _user_text(request)
    goal_m, prompt_m = _GOAL.search(text), _PROMPT.search(text)
    goal = goal_m.group(1).strip() if goal_m else ""
    prompt = prompt_m.group(1).strip() if prompt_m else ""
    levers = evaluate_levers(prompt)
    out = {
        "reply": f"{DEMO_PREFIX}{goal}\n\n{DEMO_PARAGRAPH}",
        "levers": levers,
        "tip": canned_tip(levers),
    }
    return json.dumps(out, ensure_ascii=False)


def _scenario_gen(request: LLMRequest) -> str:
    # Phase 2: deterministic demo case files (imported lazily — keeps llm/ free of a
    # module-level dependency on the scenarios package).
    from glitch_api.scenarios.fake_gen import fake_scenario_from_prompt

    return fake_scenario_from_prompt(_user_text(request))


_NODES: dict[str, Callable[[LLMRequest], str]] = {
    node_tag("freewrite_eval"): _freewrite_eval,
    node_tag("scenario_gen"): _scenario_gen,
}


class FakeProvider:
    name: Literal["fake"] = "fake"

    def __init__(self, latency_ms: int = 0) -> None:
        self.model = FAKE_MODEL_SLUG
        self.latency_ms = max(0, latency_ms)
        self.calls = 0

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.calls += 1
        start = time.perf_counter()
        if self.latency_ms:
            delay = self.latency_ms / 1000
            if delay >= request.timeout_s:
                await asyncio.sleep(request.timeout_s)
                raise LLMTimeoutError("demo provider exceeded the time budget", model=self.model)
            await asyncio.sleep(delay)
        handler = _NODES.get(node_tag(request.purpose))
        if handler is None:
            raise LLMProviderError(f"demo provider has no node for {request.purpose}", model=self.model)
        text = handler(request)
        return LLMResult(
            text=text,
            provider="fake",
            model_requested=self.model,
            model_used=self.model,
            prompt_tokens=sum(len(m.content.split()) for m in request.messages),
            completion_tokens=len(text.split()),
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    async def aclose(self) -> None:
        return None
