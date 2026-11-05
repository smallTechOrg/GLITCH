"""Ask NOVA why — ``spec/agent.md`` → Composition 3, ``spec/api.md`` → ``POST /v1/explain``.

lookup_cache(key) → hit: serve free → miss: check_budget → generate (ONE call) → validate
→ moderate → store → finalize. The item, the correct answer and the canned message are
resolved on the server (``resolve_item``); the client only sends closed ids.

- Cache object: ``explanations/<gameId>/<variationId>/<itemId>/<answer>.json``
  (``explanations-demo/…`` under the demo provider). A hit is re-validated (limits +
  moderation) and costs nothing; an invalid stored object counts as a miss and is
  overwritten.
- A miss RESERVES one device unit up front (refunded on every failure path) and charges
  one global unit before the provider call (kept once the provider was called).
- Single flight: concurrent requests for the same key in one process await the first
  request; the followers are served as hits (no charge) or share its error.
- Logs: one ``llm_call`` line per request (``cache: hit|miss``). The item id, the answer and
  the variation id are never logged; nor is any explanation text.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any, Final

from glitch_api.agent.freewrite import extract_json
from glitch_api.caps.budget import EnergyService
from glitch_api.envelope import ApiError, Energy
from glitch_api.explain.fake import explain_provider
from glitch_api.explain.content import GAME_TITLES, VARIATION_GAMES, content_for
from glitch_api.explain.items import ExplainItem, is_unexplainable, items_for
from glitch_api.explain.schemas import (
    LLM_JSON_SCHEMA,
    PROMPT_VERSION,
    SCHEMA_NAME,
    V3,
    ExplainInvalid,
    ExplainRequest,
    moderation_category,
    validate_output,
)
from glitch_api.llm.base import ChatMessage, LLMError, LLMOutcome, LLMProvider, LLMRequest, LLMResult
from glitch_api.logging import get_logger
from glitch_api.metrics import get_metrics
from glitch_api.prompts.loader import PROMPTS_DIR
from glitch_api.scenarios.repository import ScenarioRepository
from glitch_api.store.base import BlobStore, StoreError, get_json, put_json

PURPOSE: Final = "explain"
NAMESPACE: Final = "explanations"
DEMO_NAMESPACE: Final = "explanations-demo"
MAX_TOKENS: Final = 200
TEMPERATURE: Final = 0.3


class BadExplainRequest(ValueError):
    """The request names something that cannot be explained (→ ``BAD_REQUEST``, no charge)."""


@dataclass(frozen=True)
class ExplainOptions:
    max_tokens: int = MAX_TOKENS
    temperature: float = TEMPERATURE
    timeout_s: float = 7.0


@dataclass(frozen=True)
class ExplainKey:
    game_id: str
    variation_id: str
    item_id: str
    answer: str

    @classmethod
    def of(cls, req: ExplainRequest) -> ExplainKey:
        return cls(req.game_id, req.variation_id, req.item_id, req.answer)

    def blob_key(self, namespace: str) -> str:
        return f"{namespace}/{self.game_id}/{self.variation_id}/{self.item_id}/{self.answer}.json"


def namespace_for(provider: LLMProvider) -> str:
    """Demo explanations live apart so they are never served once the real AI is connected."""
    return DEMO_NAMESPACE if provider.name == "fake" else NAMESPACE


# ---- item resolution (server side only) ------------------------------------------------
async def resolve_item(key: ExplainKey, repo: ScenarioRepository) -> ExplainItem:
    """The item named by ``key`` from the bundled v3 JSON or the scenario store.

    Raises ``BadExplainRequest`` (unknown variation / item, out-of-vocabulary or correct
    answer, ``fw.*``) or ``StoreError`` (scenario store unreadable).
    """
    if is_unexplainable(key.item_id):
        raise BadExplainRequest("This mistake cannot be explained.")
    content = content_for(key.game_id)
    if key.variation_id == V3:
        data = content.data
    else:
        if key.game_id not in VARIATION_GAMES or not key.variation_id.startswith(f"{key.game_id}-"):
            raise BadExplainRequest("Unknown variation for this game.")
        variation = await repo.get(key.game_id, key.variation_id)
        if variation is None:
            raise BadExplainRequest("Unknown variation for this game.")
        data = variation.data
    item = items_for(key.game_id, data, content.copy, content.concept_rules).get(key.item_id)
    if item is None or not item.explain:
        raise BadExplainRequest("Unknown item for this game.")
    if key.answer not in item.answers or key.answer == item.correct:
        raise BadExplainRequest("That answer is not a mistake for this item.")
    return item


# ---- prompts --------------------------------------------------------------------------
_TAG = re.compile(r"<\s*/?\s*[A-Za-z_][^<>]*>")


def _data(value: str) -> str:
    """Neutralise anything tag-like in game data (variation text is AI-generated)."""
    return _TAG.sub("[tag removed]", value).replace("<", "‹").replace(">", "›")


@lru_cache(maxsize=1)
def _templates() -> tuple[str, str]:
    system = (PROMPTS_DIR / "explain_system.md").read_text(encoding="utf-8").strip()
    user = (PROMPTS_DIR / "explain_user.md").read_text(encoding="utf-8").strip()
    if not system or not user:
        raise RuntimeError("explain prompt files are empty")
    return system, user


def explain_messages(game_id: str, item: ExplainItem, answer: str) -> list[ChatMessage]:
    system, user = _templates()
    filled = user.format(
        game_title=GAME_TITLES[game_id],
        concept=item.concept,
        item=_data(item.text),
        context=_data(item.context),
        learner_answer=_data(item.answers[answer]),
        correct_answer=_data(item.correct_label),
        canned=_data(item.canned[answer]),
    )
    return [ChatMessage(role="system", content=system), ChatMessage(role="user", content=filled)]


# ---- cache ----------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


async def read_cached(store: BlobStore, namespace: str, key: ExplainKey) -> tuple[str, str, str] | None:
    """``(text, tip, model)`` of a valid stored explanation, else None (absent or invalid)."""
    got = await get_json(store, key.blob_key(namespace))
    if got is None:
        return None
    raw = got[0]
    try:
        if not isinstance(raw, dict):
            raise ExplainInvalid(["not an object"])
        if (raw.get("gameId"), raw.get("variationId"), raw.get("itemId"), raw.get("answer")) != (
            key.game_id, key.variation_id, key.item_id, key.answer,
        ) or raw.get("promptVersion") != PROMPT_VERSION:
            raise ExplainInvalid(["envelope mismatch"])
        text, tip = validate_output({"text": raw.get("text"), "tip": raw.get("tip")})
        if moderation_category(text, tip) is not None:
            raise ExplainInvalid(["moderated"])
    except ExplainInvalid:
        get_logger().warning("explain_cache_invalid", game_id=key.game_id)
        return None
    return text, tip, str(raw.get("model") or "cache")


async def write_cached(store: BlobStore, namespace: str, key: ExplainKey, text: str, tip: str, model: str) -> None:
    await put_json(store, key.blob_key(namespace), {
        "gameId": key.game_id,
        "variationId": key.variation_id,
        "itemId": key.item_id,
        "answer": key.answer,
        "text": text,
        "tip": tip,
        "model": model,
        "promptVersion": PROMPT_VERSION,
        "createdAt": _now_iso(),
    })


# ---- state ----------------------------------------------------------------------------
@dataclass
class ExplainResult:
    text: str
    tip: str
    cached: bool
    provider: str
    model: str = ""

    def to_json(self) -> dict[str, Any]:
        return {"text": self.text, "tip": self.tip, "cached": self.cached, "provider": self.provider}


@dataclass
class ExplainState:
    request_id: str
    key: ExplainKey
    item: ExplainItem
    device_hash: str
    namespace: str
    llm: LLMResult | None = None
    text: str | None = None
    tip: str | None = None
    result: ExplainResult | None = None
    energy: Energy | None = None
    error: ApiError | None = None
    errors: list[str] = field(default_factory=list)
    reserved_day: str | None = None
    calls: int = 0
    outcome: LLMOutcome | None = None
    detail: str | None = None
    call_latency_ms: float = 0.0
    provider_name: str | None = None
    model_requested: str | None = None
    call_logged: bool = True


# ---- steps ----------------------------------------------------------------------------
async def lookup_cache(s: ExplainState, *, provider: LLMProvider, store: BlobStore, **_: Any) -> bool:
    try:
        hit = await read_cached(store, s.namespace, s.key)
    except (StoreError, ValueError):
        get_logger().warning("store_error", request_id=s.request_id, op="explain_lookup", game_id=s.key.game_id)
        hit = None  # unreadable cache → behave like a miss; the store step fails closed
    get_metrics().record_cache(hit is not None)
    if hit is None:
        return False
    text, tip, model = hit
    s.result = ExplainResult(text, tip, True, provider.name, model)
    _log_hit(s, model)
    return True


async def check_budget(s: ExplainState, *, energy: EnergyService, **_: Any) -> None:
    s.reserved_day = await energy.reserve_device(s.device_hash)
    if s.reserved_day is None:
        s.error = ApiError("CAP_DEVICE")
    elif not await energy.ensure_global():
        s.error = ApiError("CAP_GLOBAL")


async def generate(s: ExplainState, *, provider: LLMProvider, energy: EnergyService, options: ExplainOptions,
                   **_: Any) -> None:
    """ONE provider call. No app-level retry, no regeneration."""
    if not await energy.charge_global():
        s.error = ApiError("CAP_GLOBAL")
        return
    request = LLMRequest(
        messages=explain_messages(s.key.game_id, s.item, s.key.answer),
        purpose=PURPOSE,
        json_schema=LLM_JSON_SCHEMA,
        schema_name=SCHEMA_NAME,
        max_tokens=options.max_tokens,
        temperature=options.temperature,
        timeout_s=options.timeout_s,
    )
    s.calls += 1
    s.call_logged = False
    s.provider_name, s.model_requested = provider.name, provider.model
    start = time.perf_counter()
    try:
        s.llm = await provider.complete(request)
        s.outcome = "ok"
    except LLMError as exc:
        s.outcome, s.detail, s.error = exc.outcome, exc.message, ApiError(exc.code)
    except Exception as exc:  # noqa: BLE001 — a provider bug is "unavailable", never a trace
        s.outcome = "provider_error"
        s.detail = f"unexpected provider failure ({type(exc).__name__})"
        s.error = ApiError("AI_UNAVAILABLE")
    finally:
        s.call_latency_ms = s.llm.latency_ms if s.llm else round((time.perf_counter() - start) * 1000, 2)


async def validate(s: ExplainState, **_: Any) -> None:
    assert s.llm is not None
    try:
        s.text, s.tip = validate_output(extract_json(s.llm.text))
    except ExplainInvalid as exc:
        s.errors = exc.errors
    except (ValueError, TypeError):
        s.errors = ["the answer was not one valid JSON object"]
    if s.errors:
        s.outcome = "invalid_output"
        s.detail = f"failed explanation validation ({len(s.errors)} problem(s))"
        s.error = ApiError("AI_INVALID_OUTPUT")


async def moderate(s: ExplainState, **_: Any) -> None:
    assert s.text is not None and s.tip is not None
    category = moderation_category(s.text, s.tip)
    if category is not None:
        s.outcome = "moderated"
        s.detail = f"blocked by output filter ({category})"
        s.error = ApiError("MODERATED")


async def store_step(s: ExplainState, *, store: BlobStore, **_: Any) -> None:
    assert s.text is not None and s.tip is not None and s.llm is not None
    try:
        await write_cached(store, s.namespace, s.key, s.text, s.tip, s.llm.model_used)
    except (StoreError, ValueError) as exc:
        get_logger().error("store_error", request_id=s.request_id, op="explain_put", game_id=s.key.game_id,
                           error_type=type(exc).__name__)
        s.detail = "could not store the explanation"
        s.error = ApiError("INTERNAL")


async def finalize(s: ExplainState, *, provider: LLMProvider, **_: Any) -> None:
    assert s.text is not None and s.tip is not None and s.llm is not None
    s.result = ExplainResult(s.text, s.tip, False, provider.name, s.llm.model_used)
    s.reserved_day = None  # success: the reserved unit is spent
    s.outcome = "ok"


async def release_reservation(s: ExplainState, energy: EnergyService) -> None:
    day, s.reserved_day = s.reserved_day, None
    if day is not None:
        await energy.refund_device(s.device_hash, day)


# ---- monitoring -----------------------------------------------------------------------
def _base_fields(s: ExplainState) -> dict[str, Any]:
    # Deliberately no item id, answer, variation id or explanation text (spec/api.md).
    return {"request_id": s.request_id, "purpose": PURPOSE, "game_id": s.key.game_id, "device_hash": s.device_hash}


def _log_hit(s: ExplainState, model: str) -> None:
    get_logger().info("llm_call", **_base_fields(s), cache="hit", model=model or "cache", latency_ms=0.0,
                      prompt_tokens=0, completion_tokens=0, outcome="ok")


def _log_call(s: ExplainState) -> None:
    """The ``cache: "miss"`` line + metrics for the one provider call."""
    if s.call_logged:
        return
    s.call_logged = True
    outcome: LLMOutcome = s.outcome or "provider_error"
    prompt_tokens = s.llm.prompt_tokens if s.llm else 0
    completion_tokens = s.llm.completion_tokens if s.llm else 0
    model_used = s.llm.model_used if s.llm else None
    get_metrics().record_llm_call(outcome, prompt_tokens, completion_tokens)
    fields: dict[str, Any] = {
        **_base_fields(s),
        "cache": "miss",
        "provider": s.llm.provider if s.llm else s.provider_name,
        "model_requested": s.llm.model_requested if s.llm else s.model_requested,
        "model_used": model_used,
        "model": model_used or s.model_requested or "unknown",
        "latency_ms": s.call_latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "outcome": outcome,
    }
    if s.errors:
        fields["validation_errors"] = list(s.errors)  # rule names only, never text
    if s.error is not None:
        fields["error_code"] = s.error.code
    if s.detail:
        fields["detail"] = s.detail
    log = get_logger()
    (log.info if outcome == "ok" and s.error is None else log.warning)("llm_call", **fields)


def _log_no_call(s: ExplainState) -> None:
    """A miss that never reached the provider (caps / store) still gets its one line."""
    get_logger().warning("llm_call", **_base_fields(s), cache="miss", model=s.model_requested or "none",
                         latency_ms=0.0, prompt_tokens=0, completion_tokens=0, outcome="not_called",
                         error_code=s.error.code if s.error else "INTERNAL")


# ---- assembly -------------------------------------------------------------------------
Flight = asyncio.Future  # resolves to ExplainResult (leader served) or an error code str


def new_request_id() -> str:
    return uuid.uuid4().hex


async def _run(s: ExplainState, deps: dict[str, Any]) -> None:
    energy: EnergyService = deps["energy"]
    try:
        if await lookup_cache(s, **deps):
            return
        await check_budget(s, **deps)
        if s.error is None:
            await generate(s, **deps)
        for step in (validate, moderate, store_step, finalize):
            if s.error is not None:
                break
            await step(s, **deps)
    except Exception as exc:  # noqa: BLE001 — unexpected bug: INTERNAL envelope, energy refunded
        get_logger().error("explain_internal_error", request_id=s.request_id, game_id=s.key.game_id,
                           error_type=type(exc).__name__)
        s.result, s.error = None, ApiError("INTERNAL")
    finally:
        if s.calls:
            _log_call(s)
        elif s.result is None:
            _log_no_call(s)
        if s.reserved_day is not None:
            await release_reservation(s, energy)
        s.energy = await energy.energy(s.device_hash)
        if s.error is not None:
            s.error.energy = s.energy


async def run_explain(
    key: ExplainKey,
    item: ExplainItem,
    device_hash: str,
    *,
    provider: LLMProvider,
    store: BlobStore,
    energy: EnergyService,
    inflight: dict[str, Flight],
    options: ExplainOptions | None = None,
    request_id: str | None = None,
) -> ExplainState:
    """Serve a cached explanation, or generate (and cache) one — one flight per key."""
    s = ExplainState(request_id or new_request_id(), key, item, device_hash, namespace_for(provider))
    deps: dict[str, Any] = {"provider": explain_provider(provider), "store": store, "energy": energy,
                            "options": options or ExplainOptions()}
    flight_key = key.blob_key(s.namespace)

    while (leader := inflight.get(flight_key)) is not None:
        # Follower: share the first request's result, never charged. Only a leader that was
        # itself out of energy (a per-device outcome) makes the follower try on its own.
        shared = await asyncio.shield(leader)
        if shared == "CAP_DEVICE":
            continue
        if isinstance(shared, ExplainResult):
            get_metrics().record_cache(True)
            s.result = ExplainResult(shared.text, shared.tip, True, shared.provider, shared.model)
            _log_hit(s, shared.model)
        else:
            s.error = ApiError(str(shared))
            _log_no_call(s)
        s.energy = await energy.energy(device_hash)
        if s.error is not None:
            s.error.energy = s.energy
        return s

    flight: Flight = asyncio.get_running_loop().create_future()
    inflight[flight_key] = flight
    try:
        await _run(s, deps)
    finally:
        inflight.pop(flight_key, None)
        if not flight.done():
            flight.set_result(s.result if s.result is not None else (s.error.code if s.error else "INTERNAL"))
    return s
