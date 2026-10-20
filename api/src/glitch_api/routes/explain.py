"""``POST /v1/explain`` — Ask NOVA why (Phase 3, ``spec/api.md``).

Order: device header (``BAD_DEVICE``, no energy) → body: exactly ``gameId``,
``variationId``, ``itemId``, ``answer`` (``BAD_REQUEST`` with energy) → server-side item
resolution from the bundled v3 JSON or the scenario store (``BAD_REQUEST`` with energy for
an unknown variation / item, an out-of-vocabulary answer, the correct answer or ``fw.*``)
→ ``run_explain``: a cached explanation (free) or ONE provider call (1 device energy, only
when served). Nothing from the body is ever logged or echoed.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from glitch_api.caps.budget import energy_service_for
from glitch_api.device import Device, require_device
from glitch_api.envelope import ApiError, ok
from glitch_api.explain.pipeline import (
    BadExplainRequest,
    ExplainKey,
    ExplainOptions,
    Flight,
    resolve_item,
    run_explain,
)
from glitch_api.explain.schemas import ExplainRequest
from glitch_api.llm.factory import provider_for
from glitch_api.logging import get_logger
from glitch_api.scenarios import repository_for
from glitch_api.store import StoreError, store_for

router = APIRouter()

MAX_BODY_BYTES = 1024
BAD_BODY_MESSAGE = "Invalid request body: send exactly gameId, variationId, itemId and answer."


def _inflight(app: Any) -> dict[str, Flight]:
    flights = getattr(app.state, "explain_inflight", None)
    if flights is None:
        flights = {}
        app.state.explain_inflight = flights
    return flights


def options_for(request: Request) -> ExplainOptions:
    preset = getattr(request.app.state, "explain_options", None)
    if isinstance(preset, ExplainOptions):
        return preset
    return ExplainOptions(timeout_s=request.app.state.settings.llm_timeout_s)


@router.post("/v1/explain")
async def explain(request: Request, device: Device = Depends(require_device)) -> JSONResponse:
    energy = energy_service_for(request.app)

    raw = await request.body()
    try:
        if len(raw) > MAX_BODY_BYTES:
            raise ValueError("body too large")
        req = ExplainRequest.model_validate(json.loads(raw))
    except (ValueError, ValidationError, UnicodeDecodeError):
        raise ApiError("BAD_REQUEST", message=BAD_BODY_MESSAGE, energy=await energy.energy(device.hash)) from None

    key = ExplainKey.of(req)
    provider = provider_for(request.app)
    request_id = request.scope.get("state", {}).get("request_id")
    try:
        item = await resolve_item(key, repository_for(request.app, provider))
    except BadExplainRequest as exc:
        raise ApiError("BAD_REQUEST", message=str(exc), energy=await energy.energy(device.hash)) from None
    except StoreError as exc:
        get_logger().error("store_error", request_id=request_id, op="explain_variation", game_id=key.game_id,
                           error_type=type(exc).__name__)
        raise ApiError("INTERNAL", energy=await energy.energy(device.hash)) from None

    state = await run_explain(
        key,
        item,
        device.hash,
        provider=provider,
        store=store_for(request.app),
        energy=energy,
        inflight=_inflight(request.app),
        options=options_for(request),
        request_id=request_id,
    )
    if state.error is not None:
        raise state.error
    assert state.result is not None
    return ok(state.result.to_json(), energy=state.energy)
