"""Generate-once content pipeline — mirrors ``spec/agent.md`` → Composition 2.

lookup_cache → check_budget → generate → validate → moderate → dedupe → store → finalize;
on ``validate`` failure with attempt 1 the scenario is regenerated ONCE with the validator
errors fed back (bounded self-correction); any other failure → handle_error and the
client plays v3.

- ONE provider call per attempt; the whole scenario comes back in that call.
- A cache hit costs nothing (no energy, no provider call) and is logged as an
  ``llm_call`` line with ``cache: "hit"`` (zero tokens) so hit and miss sit side by side.
- A generation RESERVES one unit of device energy up front (refunded on every failure
  path; kept only when a variation is served) and charges the global budget before every
  provider call — the same pattern as the free-write round.
- ``energy=None`` is bank mode (``tools/build_bank.py``): no lookup, no device or global
  charge, nothing about any device.
- Nothing about the learner is stored or logged: the only device datum is the hashed id
  used for caps; ``seen`` ids are compared and discarded.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from glitch_api.agent.freewrite import extract_json
from glitch_api.caps.budget import EnergyService
from glitch_api.envelope import ApiError, Energy
from glitch_api.llm.base import LLMError, LLMOutcome, LLMProvider, LLMRequest, LLMResult
from glitch_api.logging import get_logger
from glitch_api.metrics import get_metrics
from glitch_api.moderation import filter as moderation
from glitch_api.scenarios.prompts import scenario_messages
from glitch_api.scenarios.repository import ScenarioRepository, StoredVariation, content_hash, variation_id
from glitch_api.scenarios.schemas import GAMES, SCHEMA_VERSION, ScenarioInvalid, parse_candidate
from glitch_api.store.base import StoreError

PURPOSE = "scenario_gen"
KIND = "scenario"
MAX_ATTEMPTS = 2  # first try + one validator-fed regeneration
MIN_RETRY_BUDGET_S = 2.0  # do not start a regeneration with less time than this left
TEMPERATURE = 0.7  # lower than 0.9: fewer schema/domain-invalid generations, still varied


@dataclass(frozen=True)
class ScenarioOptions:
    max_tokens: int = 700
    temperature: float = TEMPERATURE
    timeout_s: float = 7.0  # per provider call
    deadline_s: float = 7.0  # whole pipeline (the client gives up at 8 s)
    max_attempts: int = MAX_ATTEMPTS


@dataclass
class ScenarioResult:
    """Response ``data`` for ``GET /v1/scenarios/{gameId}/next``."""

    variation_id: str
    game_id: str
    schema_version: int
    cached: bool
    data: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        return {
            "variationId": self.variation_id,
            "gameId": self.game_id,
            "schemaVersion": self.schema_version,
            "cached": self.cached,
            "data": self.data,
        }


@dataclass
class ScenarioState:
    request_id: str
    game_id: str
    seen_ids: frozenset[str]
    device_hash: str | None
    started_at: float
    kind: str = KIND
    attempt: int = 0
    llm: LLMResult | None = None
    candidate: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    stored: StoredVariation | None = None
    stored_id: str | None = None
    created: bool = False
    result: ScenarioResult | None = None
    energy: Energy | None = None
    error: ApiError | None = None
    # bookkeeping (never learner data)
    reserved_day: str | None = None
    calls: int = 0
    outcome: LLMOutcome | None = None
    detail: str | None = None
    call_latency_ms: float = 0.0
    provider_name: str | None = None
    model_requested: str | None = None
    call_logged: bool = True


def new_request_id() -> str:
    return uuid.uuid4().hex


# ---- steps ------------------------------------------------------------------------------
async def lookup_cache(s: ScenarioState, *, repo: ScenarioRepository, **_: Any) -> bool:
    """True when a cached unseen variation was served (pipeline done)."""
    try:
        variation = await repo.next_unseen(s.game_id, s.seen_ids)
    except StoreError:
        get_logger().warning("store_error", request_id=s.request_id, op="lookup", game_id=s.game_id)
        variation = None  # cache unreadable → behave like a miss; store step will fail closed
    if variation is None:
        get_metrics().record_cache(False)
        return False
    get_metrics().record_cache(True)
    s.stored = variation
    s.result = ScenarioResult(variation.id, s.game_id, SCHEMA_VERSION, True, variation.data)
    get_logger().info(
        "llm_call",
        request_id=s.request_id,
        purpose=PURPOSE,
        game_id=s.game_id,
        cache="hit",
        model=variation.model or "cache",
        latency_ms=0.0,
        prompt_tokens=0,
        completion_tokens=0,
        outcome="ok",
        variation_id=variation.id,
        device_hash=s.device_hash,
    )
    return True


async def check_budget(s: ScenarioState, *, energy: EnergyService | None, **_: Any) -> None:
    if energy is None or s.device_hash is None:
        return
    s.reserved_day = await energy.reserve_device(s.device_hash)
    if s.reserved_day is None:
        s.error = ApiError("CAP_DEVICE")
    elif not await energy.ensure_global():
        s.error = ApiError("CAP_GLOBAL")


async def generate(
    s: ScenarioState,
    *,
    provider: LLMProvider,
    energy: EnergyService | None,
    options: ScenarioOptions,
    case_number: int,
    clock_start: float,
    **_: Any,
) -> None:
    """ONE provider call for the whole scenario (errors from the last attempt fed back)."""
    s.attempt += 1
    if energy is not None and not await energy.charge_global():
        s.error = ApiError("CAP_GLOBAL")
        return
    remaining = options.deadline_s - (time.perf_counter() - clock_start)
    timeout = max(0.5, min(options.timeout_s, remaining))
    spec = GAMES[s.game_id]
    request = LLMRequest(
        messages=scenario_messages(s.game_id, case_number, s.errors or None),
        purpose=PURPOSE,
        json_schema=spec.llm_json_schema,
        schema_name=spec.schema_name,
        max_tokens=options.max_tokens,
        temperature=options.temperature,
        timeout_s=timeout,
    )
    s.calls += 1
    s.call_logged = False
    s.llm = None
    s.provider_name, s.model_requested = provider.name, provider.model
    start = time.perf_counter()
    try:
        s.llm = await provider.complete(request)
        s.outcome = "ok"  # the call succeeded; later steps override on their own failure
    except LLMError as exc:
        s.outcome, s.detail, s.error = exc.outcome, exc.message, ApiError(exc.code)
    except Exception as exc:  # noqa: BLE001 — a provider bug is "unavailable", never a trace
        s.outcome = "provider_error"
        s.detail = f"unexpected provider failure ({type(exc).__name__})"
        s.error = ApiError("AI_UNAVAILABLE")
    finally:
        s.call_latency_ms = s.llm.latency_ms if s.llm else round((time.perf_counter() - start) * 1000, 2)
    if s.error is not None:
        _log_call(s)


async def validate(s: ScenarioState, **_: Any) -> None:
    """Schema + domain validation. On failure sets ``errors`` (regeneration input)."""
    assert s.llm is not None
    try:
        s.candidate = parse_candidate(s.game_id, extract_json(s.llm.text))
        s.errors = []
    except ScenarioInvalid as exc:
        s.errors = exc.errors
    except (ValueError, ValidationError):
        s.errors = ["the answer was not one valid JSON object"]
    if s.errors:
        s.candidate = None
        s.outcome = "invalid_output"
        s.detail = f"failed scenario validation ({len(s.errors)} problem(s))"
        s.error = ApiError("AI_INVALID_OUTPUT")
        # Validator messages name rules and positions only (never generated or learner text).
        _log_call(s, validation_errors=list(s.errors))


async def moderate(s: ScenarioState, **_: Any) -> None:
    assert s.candidate is not None
    for text in GAMES[s.game_id].texts(s.candidate):
        if moderation.strip_links(text) != text:
            category: str | None = "link"
        else:
            verdict = moderation.check(text)
            category = None if verdict.allowed else verdict.category
        if category is not None:
            s.outcome = "moderated"
            s.detail = f"blocked by output filter ({category})"
            s.error = ApiError("MODERATED")
            _log_call(s)
            return
    s.outcome = "ok"


async def dedupe(s: ScenarioState, *, repo: ScenarioRepository, **_: Any) -> None:
    assert s.candidate is not None
    vid = variation_id(s.game_id, content_hash(s.candidate))
    if vid in s.seen_ids:
        s.detail = "generated a case file this device has already seen"
        s.error = ApiError("AI_INVALID_OUTPUT")
        _log_call(s)


async def store(s: ScenarioState, *, repo: ScenarioRepository, **_: Any) -> None:
    assert s.candidate is not None and s.llm is not None
    try:
        s.stored, s.created = await repo.add(s.game_id, s.candidate, model=s.llm.model_used)
    except (StoreError, ScenarioInvalid) as exc:
        get_logger().error("store_error", request_id=s.request_id, op="add", game_id=s.game_id, error_type=type(exc).__name__)
        s.detail = "could not store the generated case file"
        s.error = ApiError("INTERNAL")
        _log_call(s)
        return
    s.stored_id = s.stored.id


async def finalize(s: ScenarioState, *, energy: EnergyService | None, **_: Any) -> None:
    assert s.stored is not None
    s.result = ScenarioResult(s.stored.id, s.game_id, SCHEMA_VERSION, False, s.stored.data)
    s.reserved_day = None  # success: the reserved unit is spent
    s.outcome = "ok"
    _log_call(s)


async def release_reservation(s: ScenarioState, energy: EnergyService | None) -> None:
    day, s.reserved_day = s.reserved_day, None
    if day is not None and energy is not None and s.device_hash is not None:
        await energy.refund_device(s.device_hash, day)


async def handle_error(s: ScenarioState, *, energy: EnergyService | None, **_: Any) -> None:
    if not s.call_logged:
        _log_call(s)
    await release_reservation(s, energy)
    if energy is not None and s.device_hash is not None:
        s.energy = await energy.energy(s.device_hash)
        assert s.error is not None
        s.error.energy = s.energy


# ---- monitoring -------------------------------------------------------------------------
def _log_call(s: ScenarioState, **extra: Any) -> None:
    """One ``llm_call`` line + metrics per provider call (``cache: "miss"``)."""
    if s.call_logged:
        return
    s.call_logged = True
    outcome: LLMOutcome = s.outcome or "provider_error"
    prompt_tokens = s.llm.prompt_tokens if s.llm else 0
    completion_tokens = s.llm.completion_tokens if s.llm else 0
    model_used = s.llm.model_used if s.llm else None
    get_metrics().record_llm_call(outcome, prompt_tokens, completion_tokens)
    fields: dict[str, Any] = {
        "request_id": s.request_id,
        "purpose": PURPOSE,
        "game_id": s.game_id,
        "cache": "miss",
        "attempt": s.attempt,
        "provider": s.llm.provider if s.llm else s.provider_name,
        "model_requested": s.llm.model_requested if s.llm else s.model_requested,
        "model_used": model_used,
        "model": model_used or s.model_requested or "unknown",
        "latency_ms": s.call_latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "outcome": outcome,
        "device_hash": s.device_hash,
        **extra,
    }
    if s.stored_id:
        fields["variation_id"] = s.stored_id
        fields["stored"] = "new" if s.created else "existing"
    if s.error is not None:
        fields["error_code"] = s.error.code
    if s.detail:
        fields["detail"] = s.detail
    log = get_logger()
    (log.info if outcome == "ok" and s.error is None else log.warning)("llm_call", **fields)


# ---- assembly ---------------------------------------------------------------------------
async def run_scenario(
    game_id: str,
    seen_ids: frozenset[str] | set[str],
    device_hash: str | None,
    *,
    provider: LLMProvider,
    repo: ScenarioRepository,
    energy: EnergyService | None,
    options: ScenarioOptions | None = None,
    request_id: str | None = None,
    skip_lookup: bool = False,
) -> ScenarioState:
    """Serve the next unseen cached variation, or generate (and cache) one.

    ``energy=None`` + ``skip_lookup=True`` is the bank-script mode.
    """
    if game_id not in GAMES:
        raise KeyError(f"unknown content game {game_id!r}")
    options = options or ScenarioOptions()
    clock_start = time.perf_counter()
    s = ScenarioState(request_id or new_request_id(), game_id, frozenset(seen_ids), device_hash, clock_start)
    deps: dict[str, Any] = {"provider": provider, "repo": repo, "energy": energy, "options": options}
    try:
        if not skip_lookup and await lookup_cache(s, **deps):
            if energy is not None and device_hash is not None:
                s.energy = await energy.energy(device_hash)
            return s
        await check_budget(s, **deps)
        if s.error is None:
            try:
                case_number = await repo.count(game_id) + 1
            except StoreError:
                case_number = 1
            while True:
                s.error = None
                await generate(s, case_number=case_number, clock_start=clock_start, **deps)
                if s.error is not None:
                    break
                await validate(s, **deps)
                if s.error is None:
                    break
                elapsed = time.perf_counter() - clock_start
                if s.attempt >= options.max_attempts or options.deadline_s - elapsed < MIN_RETRY_BUDGET_S:
                    break
        for step in (moderate, dedupe, store, finalize):
            if s.error is not None:
                break
            await step(s, **deps)
        if s.error is not None:
            await handle_error(s, **deps)
        elif energy is not None and device_hash is not None:
            s.energy = await energy.energy(device_hash)
    except Exception as exc:  # noqa: BLE001 — unexpected bug: INTERNAL envelope, energy refunded
        get_logger().error("scenario_internal_error", request_id=s.request_id, game_id=game_id, error_type=type(exc).__name__)
        s.result = None
        s.error = ApiError("INTERNAL")
        await handle_error(s, **deps)
    finally:
        if s.reserved_day is not None:
            await release_reservation(s, energy)
    return s
