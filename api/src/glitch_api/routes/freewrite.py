"""``POST /v1/freewrite/evaluate`` — NOVA's reply + 5-lever verdict + one tip (one AI call).

Order: device header (``BAD_DEVICE``, no energy) → body (``BAD_REQUEST``, with energy) →
``run_freewrite`` pipeline. The body is parsed here rather than by FastAPI so every error
after a valid device header carries the device's energy, and so no validation detail
(which would contain learner text) can ever be echoed.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from glitch_api.agent.freewrite import CallOptions, run_freewrite
from glitch_api.caps.budget import energy_service_for
from glitch_api.device import Device, require_device
from glitch_api.envelope import ApiError, ok
from glitch_api.llm.factory import provider_for
from glitch_api.prompts.loader import get_prompt_library
from glitch_api.schemas.freewrite import GOAL_MAX, PROMPT_MAX, EvaluateRequest

router = APIRouter()

# Generous ceiling for {goalId, goal ≤200, prompt ≤600} even with \u-escaped text.
MAX_BODY_BYTES = 16 * 1024
BAD_BODY_MESSAGE = (
    f"Invalid request body: send goalId, goal (1–{GOAL_MAX} characters) and prompt (1–{PROMPT_MAX} characters)."
)


@router.post("/v1/freewrite/evaluate")
async def evaluate(request: Request, device: Device = Depends(require_device)) -> JSONResponse:
    energy = energy_service_for(request.app)

    raw = await request.body()
    try:
        if len(raw) > MAX_BODY_BYTES:
            raise ValueError("body too large")
        req = EvaluateRequest.model_validate(json.loads(raw))
    except (ValueError, ValidationError, UnicodeDecodeError):
        raise ApiError("BAD_REQUEST", message=BAD_BODY_MESSAGE, energy=await energy.energy(device.hash)) from None

    settings = request.app.state.settings
    state = await run_freewrite(
        req,
        device.hash,
        provider=provider_for(request.app),
        energy=energy,
        prompts=get_prompt_library(),
        clock=energy.clock,
        request_id=request.scope.get("state", {}).get("request_id"),
        options=CallOptions(
            max_tokens=settings.llm_max_output_tokens,
            timeout_s=settings.llm_timeout_s,
        ),
    )
    if state.error is not None:
        raise state.error
    assert state.result is not None
    return ok(state.result, energy=state.energy)
