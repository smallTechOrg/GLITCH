"""``GET /v1/energy`` — the device's AI energy for today. Never consumes energy."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from glitch_api.caps.budget import energy_service_for
from glitch_api.device import Device, require_device
from glitch_api.envelope import ok

router = APIRouter()


@router.get("/v1/energy")
async def energy(request: Request, device: Device = Depends(require_device)) -> JSONResponse:
    service = energy_service_for(request.app)
    return ok({}, energy=await service.energy(device.hash))
