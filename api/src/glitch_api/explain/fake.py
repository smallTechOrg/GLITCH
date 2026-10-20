"""Deterministic demo explanation (no network) — ``spec/api.md`` → ``POST /v1/explain``.

``text`` = ``"<canned> The right call here: <correct label>."`` (truncated to 60 words),
``tip`` = ``FAKE_TIP``. ``<canned>`` and ``<correct label>`` are the server-side values the
user prompt carries inside its ``<canned>`` / ``<correct_answer>`` tags.

``DemoExplainProvider`` wraps the demo provider (``llm/fake.py``) for the explain
pipeline: one ``complete`` = one counted demo call (``FakeProvider.calls``) with the same
simulated latency / timeout behaviour, so the pipeline runs exactly as with the real
provider (one call, charged, validated, moderated, stored, logged).
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Final, Literal

from glitch_api.explain.schemas import TEXT_MAX_CHARS, TEXT_MAX_WORDS, truncate_words
from glitch_api.llm.base import LLMProvider, LLMRequest, LLMResult, LLMTimeoutError
from glitch_api.llm.fake import FakeProvider

FAKE_TIP: Final = "Slow down: find the clue first, then make the call."
_CANNED = re.compile(r"<canned>(.*?)</canned>", re.DOTALL)
_CORRECT = re.compile(r"<correct_answer>(.*?)</correct_answer>", re.DOTALL)


def fake_text(canned: str, correct_label: str) -> str:
    text = truncate_words(f"{canned} The right call here: {correct_label}.", TEXT_MAX_WORDS)
    return text[:TEXT_MAX_CHARS]


def fake_explanation(request: LLMRequest) -> str:
    user = "\n".join(m.content for m in request.messages if m.role == "user")
    canned_m, correct_m = _CANNED.search(user), _CORRECT.search(user)
    canned = canned_m.group(1).strip() if canned_m else ""
    correct = correct_m.group(1).strip() if correct_m else ""
    return json.dumps({"text": fake_text(canned, correct), "tip": FAKE_TIP}, ensure_ascii=False)


class DemoExplainProvider:
    """The demo provider's ``explain`` node (deterministic, no network)."""

    name: Literal["fake"] = "fake"

    def __init__(self, inner: FakeProvider) -> None:
        self.inner = inner
        self.model = inner.model

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.inner.calls += 1
        start = time.perf_counter()
        if self.inner.latency_ms:
            delay = self.inner.latency_ms / 1000
            if delay >= request.timeout_s:
                await asyncio.sleep(request.timeout_s)
                raise LLMTimeoutError("demo provider exceeded the time budget", model=self.model)
            await asyncio.sleep(delay)
        text = fake_explanation(request)
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


def explain_provider(provider: LLMProvider) -> LLMProvider:
    """The provider the explain pipeline calls: the demo node for the demo provider."""
    return DemoExplainProvider(provider) if isinstance(provider, FakeProvider) else provider
