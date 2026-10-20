"""``POST /v1/explain`` — STUB mount point (Phase 3, slice P3-C).

Always answers the well-formed ``AI_UNAVAILABLE`` error envelope with the device's energy,
so the client's offline line + canned message path works end to end. Never charges energy,
never calls a provider, never reads or logs the body. Slice P3-D1 replaces this file with
the real endpoint (spec/api.md → ``POST /v1/explain``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from glitch_api.caps.budget import energy_service_for
from glitch_api.device import Device, require_device
from glitch_api.envelope import ApiError

router = APIRouter()


@router.post("/v1/explain")
async def explain(request: Request, device: Device = Depends(require_device)) -> JSONResponse:
    energy = await energy_service_for(request.app).energy(device.hash)
    raise ApiError("AI_UNAVAILABLE", energy=energy)
