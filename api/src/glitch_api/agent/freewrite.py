"""Free-write evaluation pipeline — mirrors ``spec/agent.md`` → Composition 1.

check_budget → build_messages → call_llm → parse_validate → moderate → finalize;
any step may set ``state.error``, which jumps to handle_error. ONE provider call per
request, zero app-level retries. Learner text (goal, prompt) and the reply are never
logged — only ``prompt_chars``.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import ValidationError

from glitch_api.caps.budget import EnergyService
from glitch_api.caps.clock import Clock
from glitch_api.envelope import ApiError, Energy
from glitch_api.llm.base import ChatMessage, LLMError, LLMOutcome, LLMProvider, LLMRequest, LLMResult
from glitch_api.logging import get_logger
from glitch_api.metrics import get_metrics
from glitch_api.moderation import filter as moderation
from glitch_api.prompts.loader import PromptLibrary
from glitch_api.schemas.freewrite import (
    FREEWRITE_SCHEMA,
    FREEWRITE_SCHEMA_NAME,
    REPLY_MAX,
    TIP_MAX,
    EvaluateData,
    EvaluateRequest,
    LLMFreewriteOutput,
)

PURPOSE = "freewrite_eval"
MAX_TOKENS = 700
TEMPERATURE = 0.4
TIMEOUT_S = 7.0
PASS_THRESHOLD = 4


def new_request_id() -> str:
    return uuid.uuid4().hex


@dataclass
class FreewriteState:
    request_id: str
    device_hash: str
    goal_id: str
    goal: str  # never logged
    prompt: str  # never logged; prompt_chars logged
    started_at: float
    messages: list[ChatMessage] = field(default_factory=list)
    llm: LLMResult | None = None
    parsed: LLMFreewriteOutput | None = None
    result: EvaluateData | None = None
    energy: Energy | None = None
    error: ApiError | None = None
    # bookkeeping for the llm_call log line (never learner text)
    called: bool = False
    outcome: LLMOutcome | None = None
    detail: str | None = None  # fixed diagnostic string (e.g. "OpenRouter key rejected …")
    call_latency_ms: float = 0.0
    model_requested: str | None = None
    provider_name: str | None = None


@dataclass(frozen=True)
class CallOptions:
    max_tokens: int = MAX_TOKENS
    temperature: float = TEMPERATURE
    timeout_s: float = TIMEOUT_S


class Step(Protocol):
    async def __call__(self, s: FreewriteState, **deps: Any) -> None: ...


# ---- steps --------------------------------------------------------------------------
async def check_budget(s: FreewriteState, *, energy: EnergyService, **_: Any) -> None:
    scope = await energy.check(s.device_hash)
    if scope is not None:
        s.error = ApiError("CAP_DEVICE" if scope == "device" else "CAP_GLOBAL")


async def build_messages(s: FreewriteState, *, prompts: PromptLibrary, **_: Any) -> None:
    s.messages = prompts.freewrite_messages(s.goal, s.prompt)


async def call_llm(
    s: FreewriteState, *, provider: LLMProvider, energy: EnergyService, options: CallOptions, **_: Any
) -> None:
    if not await energy.charge_global():
        s.error = ApiError("CAP_GLOBAL")
        return
    s.called = True
    s.provider_name = provider.name
    s.model_requested = provider.model
    request = LLMRequest(
        messages=s.messages,
        purpose=PURPOSE,
        json_schema=FREEWRITE_SCHEMA,
        schema_name=FREEWRITE_SCHEMA_NAME,
        max_tokens=options.max_tokens,
        temperature=options.temperature,
        timeout_s=options.timeout_s,
    )
    start = time.perf_counter()
    try:
        s.llm = await provider.complete(request)
    except LLMError as exc:
        s.outcome = exc.outcome
        s.detail = exc.message
        s.error = ApiError(exc.code)
    except Exception as exc:  # noqa: BLE001 — any provider bug is "unavailable", never a 500 trace
        s.outcome = "provider_error"
        s.detail = f"unexpected provider failure ({type(exc).__name__})"
        s.error = ApiError("AI_UNAVAILABLE")
    finally:
        s.call_latency_ms = s.llm.latency_ms if s.llm else round((time.perf_counter() - start) * 1000, 2)


_FENCE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\s*|\s*```\s*$")


def extract_json(text: str) -> Any:
    """Strict parse; else strip code fences and salvage the first balanced ``{…}`` block."""
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        pass
    stripped = _FENCE.sub("", text.strip())
    try:
        return json.loads(stripped)
    except ValueError:
        pass
    start = stripped.find("{")
    while start != -1:
        depth, in_str, escape = 0, False, False
        for i in range(start, len(stripped)):
            ch = stripped[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(stripped[start : i + 1])
                    except ValueError:
                        break
        start = stripped.find("{", start + 1)
    raise ValueError("no JSON object found")


def parse_output(text: str) -> LLMFreewriteOutput:
    """Raise ValueError/ValidationError when the text is not a valid free-write output."""
    data = extract_json(text)
    if not isinstance(data, dict):
        raise ValueError("output is not a JSON object")
    return LLMFreewriteOutput.model_validate(data)


async def parse_validate(s: FreewriteState, **_: Any) -> None:
    assert s.llm is not None
    try:
        s.parsed = parse_output(s.llm.text)
    except (ValueError, ValidationError):
        s.outcome = "invalid_output"
        s.detail = "model output failed the free-write schema"
        s.error = ApiError("AI_INVALID_OUTPUT")


async def moderate(s: FreewriteState, **_: Any) -> None:
    assert s.parsed is not None
    reply = moderation.strip_links(s.parsed.reply)[:REPLY_MAX]
    tip = moderation.strip_links(s.parsed.tip)[:TIP_MAX]
    verdict = moderation.check(reply + "\n" + tip)
    if not verdict.allowed:
        s.outcome = "moderated"
        s.detail = f"blocked by output filter ({verdict.category})"
        s.error = ApiError("MODERATED")
        return
    s.parsed = s.parsed.model_copy(update={"reply": reply, "tip": tip})


async def finalize(s: FreewriteState, *, energy: EnergyService, **_: Any) -> None:
    assert s.parsed is not None and s.llm is not None
    levers = s.parsed.levers
    hit = levers.hit_count()
    s.energy = await energy.charge_device(s.device_hash)
    s.result = EvaluateData(
        reply=s.parsed.reply,
        levers=levers,
        leversHit=hit,
        passed=hit >= PASS_THRESHOLD,  # server-side, never the model's opinion
        tip=s.parsed.tip,
        provider=s.llm.provider,
        model=s.llm.model_used,
    )
    s.outcome = "ok"
    _record_llm_call(s)


async def handle_error(s: FreewriteState, *, energy: EnergyService, **_: Any) -> None:
    if s.called:
        _record_llm_call(s)
    s.energy = await energy.energy(s.device_hash)
    assert s.error is not None
    s.error.energy = s.energy


# ---- monitoring ---------------------------------------------------------------------
def _record_llm_call(s: FreewriteState) -> None:
    outcome: LLMOutcome = s.outcome or "provider_error"
    prompt_tokens = s.llm.prompt_tokens if s.llm else 0
    completion_tokens = s.llm.completion_tokens if s.llm else 0
    model_used = s.llm.model_used if s.llm else None
    get_metrics().record_llm_call(outcome, prompt_tokens, completion_tokens)
    fields: dict[str, Any] = {
        "request_id": s.request_id,
        "purpose": PURPOSE,
        "provider": s.llm.provider if s.llm else s.provider_name,
        "model_requested": s.llm.model_requested if s.llm else s.model_requested,
        "model_used": model_used,
        "model": model_used or s.model_requested,
        "latency_ms": s.call_latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cache": "none",
        "outcome": outcome,
        "prompt_chars": len(s.prompt),
        "device_hash": s.device_hash,
    }
    if s.result is not None:
        fields["levers_hit"] = s.result.levers_hit
        fields["passed"] = s.result.passed
    if s.error is not None:
        fields["error_code"] = s.error.code
    if s.detail:
        fields["detail"] = s.detail
    log = get_logger()
    if outcome == "ok":
        log.info("llm_call", **fields)
    else:
        log.warning("llm_call", **fields)


# ---- assembly -----------------------------------------------------------------------
STEPS: tuple[Step, ...] = (check_budget, build_messages, call_llm, parse_validate, moderate, finalize)


async def run_freewrite(
    req: EvaluateRequest,
    device_hash: str,
    *,
    provider: LLMProvider,
    energy: EnergyService,
    prompts: PromptLibrary,
    clock: Clock,
    request_id: str | None = None,
    options: CallOptions | None = None,
) -> FreewriteState:
    s = FreewriteState(
        request_id or new_request_id(), device_hash, req.goal_id, req.goal, req.prompt, clock.monotonic()
    )
    deps: dict[str, Any] = {
        "provider": provider,
        "energy": energy,
        "prompts": prompts,
        "clock": clock,
        "options": options or CallOptions(),
    }
    try:
        for step in STEPS:
            await step(s, **deps)
            if s.error:
                await handle_error(s, **deps)
                break
    except Exception:  # noqa: BLE001 — unexpected bug: INTERNAL envelope, still with energy
        s.result = None
        s.error = ApiError("INTERNAL")
        s.energy = await energy.energy(device_hash)
        s.error.energy = s.energy
    return s
